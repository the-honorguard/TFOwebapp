import db from '../db.js';

function normalize(row) {
  if (!row) return null;
  let permissions = row.permissions || {};
  if (typeof permissions === 'string') {
    try { permissions = JSON.parse(permissions); } catch (error) { permissions = {}; }
  }
  return { slug: row.slug, name: row.name, system: !!row.is_system, permissions };
}

export async function listPermissionGroups() {
  const [rows] = await db.query('SELECT * FROM permission_groups ORDER BY is_system DESC, name');
  return rows.map(normalize);
}

export async function getPermissionGroup(slug) {
  const [rows] = await db.query('SELECT * FROM permission_groups WHERE slug = ?', [slug]);
  return normalize(rows[0]);
}

export async function createPermissionGroup({ slug, name, permissions = {} }) {
  await db.query('INSERT INTO permission_groups (slug, name, is_system, permissions) VALUES (?, ?, 0, ?)', [slug, name, JSON.stringify(permissions)]);
  return getPermissionGroup(slug);
}

export async function updatePermissionGroup(slug, { name, permissions }) {
  const fields = [];
  const values = [];
  if (name !== undefined) { fields.push('name = ?'); values.push(name); }
  if (permissions !== undefined) { fields.push('permissions = ?'); values.push(JSON.stringify(permissions)); }
  if (fields.length === 0) return getPermissionGroup(slug);
  values.push(slug);
  await db.query(`UPDATE permission_groups SET ${fields.join(', ')} WHERE slug = ?`, values);
  return getPermissionGroup(slug);
}

export async function deletePermissionGroup(slug) {
  await db.query('DELETE FROM permission_groups WHERE slug = ? AND is_system = 0', [slug]);
}
