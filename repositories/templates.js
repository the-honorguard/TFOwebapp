import db from '../db.js';

export async function listTemplates() {
  const [rows] = await db.query('SELECT * FROM templates');
  return rows.map((r) => ({ id: r.id, name: r.name, ownerId: r.owner_id, description: r.description, data: r.data }));
}

export async function createTemplate({ id, name, ownerId, description, data }) {
  const [res] = await db.query('INSERT INTO templates (id, name, owner_id, description, data) VALUES (?, ?, ?, ?, ?)', [id || null, name || 'Untitled', ownerId || null, description || null, JSON.stringify(data || {})]);
  return { id: res.insertId || id, name, ownerId, description, data };
}

export async function getTemplateById(id) {
  const [rows] = await db.query('SELECT * FROM templates WHERE id = ?', [id]);
  if (!rows[0]) return null;
  const t = rows[0];
  let data = {};
  try { data = typeof t.data === 'string' ? JSON.parse(t.data) : t.data || {}; } catch (e) { data = t.data || {}; }
  return { id: t.id, name: t.name, ownerId: t.owner_id, description: t.description, data };
}

export async function updateTemplate(id, { name, description, data }) {
  const fields = [];
  const values = [];
  if (typeof name === 'string') { fields.push('name = ?'); values.push(name); }
  if (typeof description !== 'undefined') { fields.push('description = ?'); values.push(description); }
  if (typeof data !== 'undefined') { fields.push('data = ?'); values.push(JSON.stringify(data)); }
  if (fields.length === 0) return getTemplateById(id);
  values.push(id);
  await db.query(`UPDATE templates SET ${fields.join(', ')} WHERE id = ?`, values);
  return getTemplateById(id);
}

export async function deleteTemplate(id) {
  await db.query('DELETE FROM templates WHERE id = ?', [id]);
  return true;
}
