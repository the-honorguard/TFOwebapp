import db from '../db.js';
import { getOperationAbsences, getOperationSquads, replaceOperationAbsences, replaceOperationSquads } from './layouts.js';

function normalizeOpPayload(payload = {}) {
  return {
    ...payload,
    squads: payload.squads || payload.sections || [],
    absentUserIds: Array.isArray(payload.absentUserIds) ? payload.absentUserIds : []
  };
}

export async function listOps() {
  const [rows] = await db.query('SELECT id FROM ops');
  return Promise.all(rows.map((row) => getOpById(row.id)));
}

export async function createOp({ templateId, title, payload = {}, scheduled_at = null, status = 'scheduled', recurrenceId = null, occurrenceAt = null }, executor = null) {
  const connection = executor || await db.getConnection();
  const ownsConnection = !executor;
  try {
    if (ownsConnection) await connection.beginTransaction();
    const { id, squads = [], sections, absentUserIds = [], ...settings } = payload;
    const [res] = await connection.query(
      'INSERT INTO ops (template_id, title, scheduled_at, recurrence_id, occurrence_at, payload, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [templateId || null, title || null, scheduled_at, recurrenceId, occurrenceAt, JSON.stringify(settings), status]
    );
    await replaceOperationSquads(res.insertId, squads || sections || [], connection, { clear: false });
    await replaceOperationAbsences(res.insertId, absentUserIds, connection, { clear: false });
    if (ownsConnection) {
      await connection.commit();
      return getOpById(res.insertId);
    }
    return {
      id: res.insertId,
      templateId: templateId || null,
      title: title || null,
      payload: { ...settings, id: res.insertId, squads: await getOperationSquads(res.insertId, connection), absentUserIds: [] }
    };
  } catch (error) {
    if (ownsConnection) await connection.rollback();
    throw error;
  } finally {
    if (ownsConnection) connection.release();
  }
}

export async function getOpById(id) {
  const [rows] = await db.query('SELECT * FROM ops WHERE id = ?', [id]);
  if (!rows[0]) return null;
  const o = rows[0];
  let payload = {};
  try { payload = typeof o.payload === 'string' ? JSON.parse(o.payload) : o.payload || {}; } catch (e) { payload = o.payload || {}; }
  payload = normalizeOpPayload({ ...payload, id: o.id, squads: await getOperationSquads(o.id), absentUserIds: await getOperationAbsences(o.id) });
  return { id: o.id, templateId: o.template_id, title: o.title || o.name, ownerId: o.owner_id, scheduled_at: o.scheduled_at, timezone: o.timezone, recurrence: o.recurrence, payload, status: o.status };
}

export async function updateOp(id, patch) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
  const fields = [];
  const values = [];
  if ('title' in patch) { fields.push('title = ?'); values.push(patch.title); }
  if ('templateId' in patch) { fields.push('template_id = ?'); values.push(patch.templateId); }
  if ('scheduled_at' in patch) { fields.push('scheduled_at = ?'); values.push(patch.scheduled_at); }
  if ('timezone' in patch) { fields.push('timezone = ?'); values.push(patch.timezone); }
  if ('recurrence' in patch) { fields.push('recurrence = ?'); values.push(JSON.stringify(patch.recurrence || null)); }
  if ('status' in patch) { fields.push('status = ?'); values.push(patch.status); }
  if ('payload' in patch) {
    const { id: payloadId, squads = [], sections, absentUserIds = [], ...settings } = patch.payload || {};
    const inputSquads = squads || sections || [];
    const persistedSquads = await replaceOperationSquads(id, inputSquads, connection);
    const persistedIdByInputId = new Map(inputSquads.map((squad, index) => (
      [String(squad.id), persistedSquads[index]?.id]
    )));
    if (Array.isArray(settings.layoutNodes)) {
      settings.layoutNodes = settings.layoutNodes.map((node) => ({
        ...node,
        squadId: persistedIdByInputId.get(String(node.squadId)) ?? node.squadId,
        parentId: node.parentId == null
          ? null
          : (persistedIdByInputId.get(String(node.parentId)) ?? node.parentId)
      }));
    }
    if (Array.isArray(settings.flowEdges)) {
      settings.flowEdges = settings.flowEdges.map((edge) => ({
        ...edge,
        sourceId: persistedIdByInputId.get(String(edge.sourceId)) ?? edge.sourceId,
        targetId: persistedIdByInputId.get(String(edge.targetId)) ?? edge.targetId
      }));
    }
    fields.push('payload = ?'); values.push(JSON.stringify(settings));
    await replaceOperationAbsences(id, absentUserIds, connection);
  }
  if (fields.length) {
    values.push(id);
    await connection.query(`UPDATE ops SET ${fields.join(', ')} WHERE id = ?`, values);
  }
  await connection.commit();
  return getOpById(id);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function deleteOp(id) {
  await db.query('DELETE FROM recurrences WHERE op_id = ?', [id]);
  await db.query('DELETE FROM ops WHERE id = ?', [id]);
  return true;
}

async function _savePayload(id, payload) {
  await updateOp(id, { payload });
}

export async function joinSlot(opId, slotId, userId) {
  const [result] = await db.query(`UPDATE operation_slots slot
    INNER JOIN operation_squads squad ON squad.id = slot.squad_id
    SET slot.assigned_user_id = ?
    WHERE slot.id = ? AND squad.operation_id = ? AND (slot.assigned_user_id IS NULL OR slot.assigned_user_id = ?)`,
  [userId, slotId, opId, userId]);
  if (!result.affectedRows) {
    const [rows] = await db.query(`SELECT slot.assigned_user_id FROM operation_slots slot
      INNER JOIN operation_squads squad ON squad.id = slot.squad_id WHERE slot.id = ? AND squad.operation_id = ?`, [slotId, opId]);
    if (!rows[0]) throw new Error('Slot not found');
    throw new Error('Slot taken');
  }
  await db.query('DELETE FROM operation_absences WHERE operation_id = ? AND user_id = ?', [opId, userId]);
  return getOpById(opId);
}

export async function setPlayerAbsent(opId, userId, absent) {
  if (absent) {
    await db.query('INSERT IGNORE INTO operation_absences (operation_id, user_id) VALUES (?, ?)', [opId, userId]);
    await db.query(`UPDATE operation_slots slot INNER JOIN operation_squads squad ON squad.id = slot.squad_id
      SET slot.assigned_user_id = NULL WHERE squad.operation_id = ? AND slot.assigned_user_id = ?`, [opId, userId]);
  } else {
    await db.query('DELETE FROM operation_absences WHERE operation_id = ? AND user_id = ?', [opId, userId]);
  }
  return getOpById(opId);
}

export async function signoffSlot(opId, slotId, userId) {
  const [result] = await db.query(`UPDATE operation_slots slot INNER JOIN operation_squads squad ON squad.id = slot.squad_id
    SET slot.assigned_user_id = NULL WHERE slot.id = ? AND squad.operation_id = ? AND slot.assigned_user_id = ?`, [slotId, opId, userId]);
  if (!result.affectedRows) throw new Error('Not assigned');
  return getOpById(opId);
}

export async function updateSquad(opId, squadId, patch) {
  const fields = []; const values = [];
  const mapping = { lrChannel: 'lr_channel', srChannel: 'sr_channel', marker: 'marker', markerIconUrl: 'marker_icon_url', active: 'active' };
  for (const [key, column] of Object.entries(mapping)) if (key in patch) { fields.push(`${column} = ?`); values.push(patch[key]); }
  if (!fields.length) return getOpById(opId);
  values.push(squadId, opId);
  const [result] = await db.query(`UPDATE operation_squads SET ${fields.join(', ')} WHERE id = ? AND operation_id = ?`, values);
  if (!result.affectedRows) throw new Error('Squad not found');
  return getOpById(opId);
}

export async function addSquad(opId, title) {
  const [rows] = await db.query('SELECT COUNT(*) AS count FROM operation_squads WHERE operation_id = ?', [opId]);
  const count = Number(rows[0].count);
  await db.query(`INSERT INTO operation_squads (operation_id, title, lr_channel, sr_channel, sort_order)
    VALUES (?, ?, 1, ?, ?)`, [opId, title || `Squad ${count + 1}`, count + 1, count]);
  return getOpById(opId);
}

export async function updateSlot(opId, slotId, patch) {
  const fields = []; const values = [];
  const mapping = { name: 'name', role: 'role', notes: 'notes', allowedRoles: 'allowed_roles' };
  for (const [key, column] of Object.entries(mapping)) if (key in patch) {
    fields.push(`${column} = ?`); values.push(key === 'allowedRoles' ? JSON.stringify(patch[key]) : patch[key]);
  }
  values.push(slotId, opId);
  const [result] = await db.query(`UPDATE operation_slots slot INNER JOIN operation_squads squad ON squad.id = slot.squad_id
    SET ${fields.map((field) => `slot.${field}`).join(', ')} WHERE slot.id = ? AND squad.operation_id = ?`, values);
  if (!result.affectedRows) throw new Error('Slot not found');
  return getOpById(opId);
}
