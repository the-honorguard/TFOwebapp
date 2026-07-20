import db from '../db.js';

function normalize(row) {
  let metadata = row.metadata || {};
  if (typeof metadata === 'string') {
    try { metadata = JSON.parse(metadata); } catch { metadata = {}; }
  }
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    message: row.message,
    entityType: row.entity_type,
    entityId: row.entity_id,
    metadata,
    readAt: row.read_at,
    createdAt: row.created_at,
    actorName: row.actor_name || null
  };
}

export async function listForUser(userId, limit = 50) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 100));
  const [rows] = await db.query(
    `SELECT n.*, u.username actor_name
     FROM notifications n LEFT JOIN users u ON u.id = n.actor_id
     WHERE n.user_id = ? ORDER BY n.created_at DESC, n.id DESC LIMIT ${safeLimit}`,
    [userId]
  );
  return rows.map(normalize);
}

export async function createForActiveUsers({ actorId, type, title, message, entityType, entityId, metadata = {} }) {
  const [users] = await db.query(
    `SELECT id FROM users WHERE (status IS NULL OR LOWER(status) = 'active') AND id <> ?`,
    [actorId]
  );
  if (!users.length) return;
  const values = users.map((user) => [user.id, actorId, type, title, message, entityType, entityId, JSON.stringify(metadata)]);
  await db.query(
    'INSERT INTO notifications (user_id, actor_id, type, title, message, entity_type, entity_id, metadata) VALUES ?',
    [values]
  );
}

export async function markRead(userId, notificationId) {
  const [result] = await db.query(
    'UPDATE notifications SET read_at = COALESCE(read_at, NOW()) WHERE id = ? AND user_id = ?',
    [notificationId, userId]
  );
  return result.affectedRows > 0;
}

export async function markAllRead(userId) {
  await db.query('UPDATE notifications SET read_at = NOW() WHERE user_id = ? AND read_at IS NULL', [userId]);
}
