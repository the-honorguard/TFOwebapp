import db from '../db.js';

const jsonArray = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return []; }
  }
  return [];
};

function groupSlots(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const slots = grouped.get(String(row.squad_id)) || [];
    slots.push({
      id: row.id,
      originalSlotId: row.template_slot_id ?? undefined,
      name: row.name,
      role: row.role,
      notes: row.notes || '',
      allowedRoles: jsonArray(row.allowed_roles),
      assignedUserId: row.assigned_user_id ?? null
    });
    grouped.set(String(row.squad_id), slots);
  }
  return grouped;
}

export async function getTemplateSquads(templateId, executor = db) {
  const [squads] = await executor.query('SELECT * FROM template_squads WHERE template_id = ? ORDER BY sort_order, id', [templateId]);
  if (!squads.length) return [];
  const [slots] = await executor.query(`SELECT ts.* FROM template_slots ts
    INNER JOIN template_squads sq ON sq.id = ts.squad_id
    WHERE sq.template_id = ? ORDER BY sq.sort_order, ts.sort_order, ts.id`, [templateId]);
  const bySquad = groupSlots(slots);
  return squads.map((row) => ({
    id: row.id,
    parentId: row.parent_squad_id,
    title: row.title,
    lrChannel: row.lr_channel,
    srChannel: row.sr_channel,
    marker: row.marker,
    markerIconUrl: row.marker_icon_url,
    active: !!row.active,
    slots: bySquad.get(String(row.id)) || []
  }));
}

export async function replaceTemplateSquads(templateId, squads = [], executor = db, { clear = true } = {}) {
  if (clear) await executor.query('DELETE FROM template_squads WHERE template_id = ?', [templateId]);
  const idMap = new Map();
  for (const [squadIndex, squad] of squads.entries()) {
    const [squadResult] = await executor.query(
      `INSERT INTO template_squads
       (template_id, title, lr_channel, sr_channel, marker, marker_icon_url, active, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [templateId, squad.title || `Squad ${squadIndex + 1}`, squad.lrChannel ?? 1, squad.srChannel ?? squadIndex + 1,
        squad.marker || null, squad.markerIconUrl || null, squad.active === false ? 0 : 1, squadIndex]
    );
    idMap.set(String(squad.id), squadResult.insertId);
    for (const [slotIndex, slot] of (squad.slots || []).entries()) {
      await executor.query(
        `INSERT INTO template_slots (squad_id, name, role, notes, allowed_roles, sort_order)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [squadResult.insertId, slot.name || 'New role', slot.role || 'Rifleman', slot.notes || '',
          JSON.stringify(slot.allowedRoles || []), slotIndex]
      );
    }
  }
  for (const squad of squads) {
    if (squad.parentId == null) continue;
    const squadId = idMap.get(String(squad.id));
    const parentId = idMap.get(String(squad.parentId));
    if (squadId && parentId) await executor.query('UPDATE template_squads SET parent_squad_id = ? WHERE id = ?', [parentId, squadId]);
  }
  return getTemplateSquads(templateId, executor);
}

export async function getOperationSquads(operationId, executor = db) {
  const [squads] = await executor.query('SELECT * FROM operation_squads WHERE operation_id = ? ORDER BY sort_order, id', [operationId]);
  if (!squads.length) return [];
  const [slots] = await executor.query(`SELECT os.* FROM operation_slots os
    INNER JOIN operation_squads sq ON sq.id = os.squad_id
    WHERE sq.operation_id = ? ORDER BY sq.sort_order, os.sort_order, os.id`, [operationId]);
  const bySquad = groupSlots(slots);
  return squads.map((row) => ({
    id: row.id,
    originalSquadId: row.template_squad_id ?? undefined,
    title: row.title,
    lrChannel: row.lr_channel,
    srChannel: row.sr_channel,
    marker: row.marker,
    markerIconUrl: row.marker_icon_url,
    active: !!row.active,
    slots: bySquad.get(String(row.id)) || []
  }));
}

export async function replaceOperationSquads(operationId, squads = [], executor = db, { clear = true } = {}) {
  if (clear) await executor.query('DELETE FROM operation_squads WHERE operation_id = ?', [operationId]);
  for (const [squadIndex, squad] of squads.entries()) {
    const templateSquadId = squad.originalSquadId || null;
    const [squadResult] = await executor.query(
      `INSERT INTO operation_squads
       (operation_id, template_squad_id, title, lr_channel, sr_channel, marker, marker_icon_url, active, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [operationId, templateSquadId, squad.title || `Squad ${squadIndex + 1}`, squad.lrChannel ?? 1,
        squad.srChannel ?? squadIndex + 1, squad.marker || null, squad.markerIconUrl || null,
        squad.active === false ? 0 : 1, squadIndex]
    );
    for (const [slotIndex, slot] of (squad.slots || []).entries()) {
      await executor.query(
        `INSERT INTO operation_slots
         (squad_id, template_slot_id, name, role, notes, allowed_roles, assigned_user_id, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [squadResult.insertId, slot.originalSlotId || null, slot.name || 'New role', slot.role || 'Rifleman',
          slot.notes || '', JSON.stringify(slot.allowedRoles || []), slot.assignedUserId || null, slotIndex]
      );
    }
  }
  return getOperationSquads(operationId, executor);
}

export async function getOperationAbsences(operationId, executor = db) {
  const [rows] = await executor.query('SELECT user_id FROM operation_absences WHERE operation_id = ? ORDER BY user_id', [operationId]);
  return rows.map((row) => row.user_id);
}

export async function replaceOperationAbsences(operationId, userIds = [], executor = db, { clear = true } = {}) {
  if (clear) await executor.query('DELETE FROM operation_absences WHERE operation_id = ?', [operationId]);
  for (const userId of new Set(userIds.map(Number).filter(Boolean))) {
    await executor.query('INSERT INTO operation_absences (operation_id, user_id) VALUES (?, ?)', [operationId, userId]);
  }
}
