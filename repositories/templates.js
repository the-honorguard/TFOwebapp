import db from '../db.js';
import { getTemplateSquads, replaceTemplateSquads } from './layouts.js';

function normalizeTemplateData(data = {}) {
  return {
    ...data,
    squads: data.squads || data.sections || []
  };
}

export async function listTemplates() {
  const [rows] = await db.query('SELECT * FROM templates');
  return Promise.all(rows.map(async (r) => {
    const legacy = normalizeTemplateData(r.data || {});
    const squads = await getTemplateSquads(r.id);
    return { id: r.id, name: r.name, ownerId: r.owner_id, description: r.description, data: { ...legacy, squads } };
  }));
}

export async function createTemplate({ name, ownerId, description, data = {} }) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const { squads = [], sections, ...settings } = data;
    const [res] = await connection.query('INSERT INTO templates (name, owner_id, description, data) VALUES (?, ?, ?, ?)',
      [name || 'Untitled', ownerId || null, description || null, JSON.stringify(settings)]);
    await replaceTemplateSquads(res.insertId, squads || sections || [], connection, { clear: false });
    await connection.commit();
    return getTemplateById(res.insertId);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function getTemplateById(id) {
  const [rows] = await db.query('SELECT * FROM templates WHERE id = ?', [id]);
  if (!rows[0]) return null;
  const t = rows[0];
  let data = {};
  try { data = typeof t.data === 'string' ? JSON.parse(t.data) : t.data || {}; } catch (e) { data = t.data || {}; }
  const squads = await getTemplateSquads(t.id);
  return { id: t.id, name: t.name, ownerId: t.owner_id, description: t.description, data: { ...normalizeTemplateData(data), squads } };
}

export async function updateTemplate(id, { name, description, data }) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
  const fields = [];
  const values = [];
  if (typeof name === 'string') { fields.push('name = ?'); values.push(name); }
  if (typeof description !== 'undefined') { fields.push('description = ?'); values.push(description); }
  if (typeof data !== 'undefined') {
    const { squads, sections, ...settings } = data;
    fields.push('data = ?'); values.push(JSON.stringify(settings));
    await replaceTemplateSquads(id, squads || sections || [], connection);
  }
  if (fields.length) {
    values.push(id);
    await connection.query(`UPDATE templates SET ${fields.join(', ')} WHERE id = ?`, values);
  }
  await connection.commit();
  return getTemplateById(id);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function deleteTemplate(id) {
  await db.query('DELETE FROM templates WHERE id = ?', [id]);
  return true;
}

export async function addSquad(templateId, squad = {}) {
  const [rows] = await db.query('SELECT COUNT(*) AS count FROM template_squads WHERE template_id = ?', [templateId]);
  const order = Number(rows[0].count);
  const [result] = await db.query(`INSERT INTO template_squads
    (template_id, title, lr_channel, sr_channel, marker, marker_icon_url, active, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [templateId, squad.title || 'New squad', squad.lrChannel ?? 1,
    squad.srChannel ?? order + 1, squad.marker || null, squad.markerIconUrl || null, squad.active === false ? 0 : 1, order]);
  return (await getTemplateSquads(templateId)).find((item) => String(item.id) === String(result.insertId));
}

export async function updateSquad(templateId, squadId, patch) {
  const fields = []; const values = [];
  const columns = { title: 'title', lrChannel: 'lr_channel', srChannel: 'sr_channel', marker: 'marker', markerIconUrl: 'marker_icon_url', active: 'active' };
  for (const [key, column] of Object.entries(columns)) if (key in patch) { fields.push(`${column} = ?`); values.push(patch[key]); }
  if (fields.length) {
    values.push(squadId, templateId);
    const [result] = await db.query(`UPDATE template_squads SET ${fields.join(', ')} WHERE id = ? AND template_id = ?`, values);
    if (!result.affectedRows) return null;
  }
  return (await getTemplateSquads(templateId)).find((item) => String(item.id) === String(squadId)) || null;
}

export async function deleteSquad(templateId, squadId) {
  const [result] = await db.query('DELETE FROM template_squads WHERE id = ? AND template_id = ?', [squadId, templateId]);
  return result.affectedRows > 0;
}

export async function addSlot(templateId, squadId, slot = {}) {
  const [squads] = await db.query('SELECT id FROM template_squads WHERE id = ? AND template_id = ?', [squadId, templateId]);
  if (!squads[0]) return null;
  const [rows] = await db.query('SELECT COUNT(*) AS count FROM template_slots WHERE squad_id = ?', [squadId]);
  const [result] = await db.query(`INSERT INTO template_slots
    (squad_id, name, role, notes, allowed_roles, sort_order) VALUES (?, ?, ?, ?, ?, ?)`,
  [squadId, slot.name || 'New role', slot.role || 'Rifleman', slot.notes || '', JSON.stringify(slot.allowedRoles || []), Number(rows[0].count)]);
  const template = await getTemplateById(templateId);
  return template.data.squads.flatMap((squad) => squad.slots).find((item) => String(item.id) === String(result.insertId));
}

export async function updateSlot(templateId, slotId, patch) {
  const fields = []; const values = [];
  const columns = { name: 'name', role: 'role', notes: 'notes', allowedRoles: 'allowed_roles' };
  for (const [key, column] of Object.entries(columns)) if (key in patch) {
    fields.push(`slot.${column} = ?`); values.push(key === 'allowedRoles' ? JSON.stringify(patch[key]) : patch[key]);
  }
  values.push(slotId, templateId);
  const [result] = await db.query(`UPDATE template_slots slot INNER JOIN template_squads squad ON squad.id = slot.squad_id
    SET ${fields.join(', ')} WHERE slot.id = ? AND squad.template_id = ?`, values);
  return result.affectedRows > 0;
}

export async function deleteSlot(templateId, slotId) {
  const [result] = await db.query(`DELETE slot FROM template_slots slot
    INNER JOIN template_squads squad ON squad.id = slot.squad_id WHERE slot.id = ? AND squad.template_id = ?`, [slotId, templateId]);
  return result.affectedRows > 0;
}

export async function reorderSlots(templateId, squadId, slotIds) {
  const [rows] = await db.query(`SELECT slot.id FROM template_slots slot INNER JOIN template_squads squad ON squad.id = slot.squad_id
    WHERE squad.id = ? AND squad.template_id = ?`, [squadId, templateId]);
  const current = new Set(rows.map((row) => String(row.id)));
  if (current.size !== slotIds.length || slotIds.some((id) => !current.has(String(id)))) return false;
  for (const [index, id] of slotIds.entries()) await db.query('UPDATE template_slots SET sort_order = ? WHERE id = ?', [index, id]);
  return true;
}
