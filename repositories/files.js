import db from '../db.js';

export async function listFiles() {
  const [rows] = await db.query('SELECT * FROM files');
  return rows.map((r) => ({ id: r.id, filename: r.filename, pathname: r.pathname, mimetype: r.mimetype, size: r.size, metadata: r.metadata }));
}

export async function addFile({ filename, pathname, mimetype, size, ownerId, metadata }) {
  const [res] = await db.query('INSERT INTO files (filename, pathname, mimetype, size, owner_id, metadata) VALUES (?, ?, ?, ?, ?, ?)', [filename, pathname, mimetype || null, size || 0, ownerId || null, JSON.stringify(metadata || {})]);
  return { id: res.insertId, filename, pathname, mimetype, size, ownerId, metadata };
}
