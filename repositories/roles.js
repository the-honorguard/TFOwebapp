import db from '../db.js';

export async function listRoles() {
  const [rows] = await db.query('SELECT * FROM roles ORDER BY name');
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    system: !!r.is_system,
    occupied: r.occupied ? JSON.parse(typeof r.occupied === 'string' ? r.occupied : JSON.stringify(r.occupied)) : null,
    slots: r.slots ? JSON.parse(typeof r.slots === 'string' ? r.slots : JSON.stringify(r.slots)) : [],
    allowed: r.allowed ? JSON.parse(typeof r.allowed === 'string' ? r.allowed : JSON.stringify(r.allowed)) : [],
    metadata: r.metadata ? JSON.parse(typeof r.metadata === 'string' ? r.metadata : JSON.stringify(r.metadata)) : {}
  }));
}

export async function getRoleById(id) {
  const [rows] = await db.query('SELECT * FROM roles WHERE id = ?', [id]);
  if (!rows || rows.length === 0) return null;
  const r = rows[0];
  return {
    id: r.id,
    name: r.name,
    system: !!r.is_system,
    occupied: r.occupied ? JSON.parse(typeof r.occupied === 'string' ? r.occupied : JSON.stringify(r.occupied)) : null,
    slots: r.slots ? JSON.parse(typeof r.slots === 'string' ? r.slots : JSON.stringify(r.slots)) : [],
    allowed: r.allowed ? JSON.parse(typeof r.allowed === 'string' ? r.allowed : JSON.stringify(r.allowed)) : [],
    metadata: r.metadata ? JSON.parse(typeof r.metadata === 'string' ? r.metadata : JSON.stringify(r.metadata)) : {}
  };
}

export async function createRole({ name, system = false, occupied = null, slots = [], allowed = [], metadata = {} }) {
  const id = Date.now();
  await db.query('INSERT INTO roles (id, name, is_system, occupied, slots, allowed, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)', [
    id,
    name,
    system ? 1 : 0,
    occupied ? JSON.stringify(occupied) : null,
    JSON.stringify(slots || []),
    JSON.stringify(allowed || []),
    JSON.stringify(metadata || {})
  ]);
  return getRoleById(id);
}

export async function deleteRole(id) {
  await db.query('DELETE FROM roles WHERE id = ?', [id]);
}

export async function updateRole(id, fields) {
  const toUpdate = [];
  const params = [];
  if (fields.name !== undefined) { toUpdate.push('name = ?'); params.push(fields.name); }
  if (fields.system !== undefined) { toUpdate.push('is_system = ?'); params.push(fields.system ? 1 : 0); }
  if (fields.occupied !== undefined) { toUpdate.push('occupied = ?'); params.push(fields.occupied ? JSON.stringify(fields.occupied) : null); }
  if (fields.slots !== undefined) { toUpdate.push('slots = ?'); params.push(JSON.stringify(fields.slots || [])); }
  if (fields.allowed !== undefined) { toUpdate.push('allowed = ?'); params.push(JSON.stringify(fields.allowed || [])); }
  if (fields.metadata !== undefined) { toUpdate.push('metadata = ?'); params.push(JSON.stringify(fields.metadata || {})); }
  if (toUpdate.length === 0) return getRoleById(id);
  params.push(id);
  await db.query(`UPDATE roles SET ${toUpdate.join(', ')} WHERE id = ?`, params);
  return getRoleById(id);
}

export async function findByName(name) {
  const [rows] = await db.query('SELECT * FROM roles WHERE name = ?', [name]);
  return rows && rows[0] ? rows[0] : null;
}
