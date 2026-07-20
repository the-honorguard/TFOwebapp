import db from '../db.js';

export async function createUser({ id = null, username, email = null, password_hash, role = 'member', rank = null, status = 'Active', permissions = {} }) {
  const [result] = await db.query(
    'INSERT INTO users (id, username, email, password_hash, role, `rank`, status, permissions) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [id, username, email, password_hash, role, rank, status, JSON.stringify(permissions)]
  );
  return { id: result.insertId || id, username, email, role };
}

export async function getUserById(id) {
  const [rows] = await db.query('SELECT * FROM users WHERE id = ?', [id]);
  return rows[0] || null;
}

export async function getUserByUsername(username) {
  const [rows] = await db.query('SELECT * FROM users WHERE username = ?', [username]);
  return rows[0] || null;
}

export async function listUsers() {
  const [rows] = await db.query('SELECT * FROM users');
  return rows;
}

export async function updateUser(id, patch) {
  const fields = [];
  const values = [];
  if ('username' in patch) { fields.push('username = ?'); values.push(patch.username); }
  if ('email' in patch) { fields.push('email = ?'); values.push(patch.email); }
  if ('role' in patch) { fields.push('role = ?'); values.push(patch.role); }
  if ('rank' in patch) { fields.push('`rank` = ?'); values.push(patch.rank); }
  if ('status' in patch) { fields.push('`status` = ?'); values.push(patch.status); }
  if ('permissions' in patch) { fields.push('permissions = ?'); values.push(JSON.stringify(patch.permissions || {})); }
  if ('isDrillSergeant' in patch) { fields.push('is_drill_sergeant = ?'); values.push(patch.isDrillSergeant ? 1 : 0); }
  if (fields.length === 0) return getUserById(id);
  values.push(id);
  const sql = 'UPDATE users SET ' + fields.join(', ') + ' WHERE `id` = ?';
  console.debug('updateUser SQL:', sql, values);
  await db.query(sql, values);
  return getUserById(id);
}

export async function deleteUser(id) {
  await db.query('DELETE FROM user_profiles WHERE user_id = ?', [id]);
  await db.query('DELETE FROM users WHERE id = ?', [id]);
  return true;
}

export async function updatePassword(id, password_hash) {
  await db.query('UPDATE users SET password_hash = ? WHERE id = ?', [password_hash, id]);
  return getUserById(id);
}
