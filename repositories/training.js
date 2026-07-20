import db from '../db.js';

const json = (value, fallback = {}) => {
  if (value == null) return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return fallback; }
};

export async function getSettings() {
  const [rows] = await db.query('SELECT basic_role AS basicRole, cooldown_months AS cooldownMonths FROM training_settings WHERE id = 1');
  return rows[0] || { basicRole: 'Rifleman', cooldownMonths: 3 };
}

export async function updateSettings({ basicRole }) {
  await db.query('UPDATE training_settings SET basic_role = ? WHERE id = 1', [basicRole]);
  return getSettings();
}

export async function getTrainerRights(userId) {
  const [rows] = await db.query('SELECT role_name FROM trainer_role_rights WHERE user_id = ?', [userId]);
  return rows.map((row) => row.role_name);
}

export async function listTrainerRights() {
  const [rows] = await db.query(`SELECT tr.user_id AS userId, u.username, tr.role_name AS roleName
    FROM trainer_role_rights tr JOIN users u ON u.id = tr.user_id ORDER BY u.username, tr.role_name`);
  return rows;
}

export async function replaceTrainerRights(userId, roles) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('DELETE FROM trainer_role_rights WHERE user_id = ?', [userId]);
    for (const role of [...new Set(roles)]) await conn.query('INSERT INTO trainer_role_rights (user_id, role_name) VALUES (?, ?)', [userId, role]);
    await conn.commit();
  } catch (error) { await conn.rollback(); throw error; } finally { conn.release(); }
  return getTrainerRights(userId);
}

export async function lastPassed(userId) {
  const [rows] = await db.query(`SELECT tp.assessed_at AS assessedAt FROM training_participants tp
    JOIN training_requests tr ON tr.id = tp.request_id WHERE tr.user_id = ? AND tp.outcome = 'passed'
    ORDER BY tp.assessed_at DESC LIMIT 1`, [userId]);
  return rows[0]?.assessedAt || null;
}

export async function createRequest({ userId, roleName, source, createdBy = null, notes = null, overrideReason = null }) {
  const [result] = await db.query(`INSERT INTO training_requests (user_id, role_name, source, created_by, notes)
    VALUES (?, ?, ?, ?, ?)`, [userId, roleName, source, createdBy, notes]);
  await audit(result.insertId, createdBy || userId, 'request_created', { source, overrideReason });
  return getRequest(result.insertId);
}

export async function getRequest(id) {
  const [rows] = await db.query(`SELECT tr.*, u.username, u.rank, u.status AS userStatus, up.settings AS survey,
    c.username AS claimedByName FROM training_requests tr JOIN users u ON u.id = tr.user_id
    LEFT JOIN user_profiles up ON up.user_id = u.id LEFT JOIN users c ON c.id = tr.claimed_by WHERE tr.id = ?`, [id]);
  if (!rows[0]) return null;
  return { ...rows[0], survey: json(rows[0].survey, {}) };
}

export async function listRequests() {
  const [rows] = await db.query(`SELECT tr.*, u.username, u.rank, c.username AS claimedByName,
    (SELECT MAX(tp.assessed_at) FROM training_participants tp JOIN training_requests oldr ON oldr.id=tp.request_id WHERE oldr.user_id=tr.user_id AND tp.outcome='passed') AS lastPassedAt
    FROM training_requests tr JOIN users u ON u.id=tr.user_id LEFT JOIN users c ON c.id=tr.claimed_by ORDER BY FIELD(tr.status,'requested','claimed','planning','scheduled','completed','cancelled'), tr.created_at`);
  return rows;
}

export async function activeDuplicate(userId, roleName) {
  const [rows] = await db.query("SELECT id FROM training_requests WHERE user_id=? AND role_name=? AND status IN ('requested','claimed','planning','scheduled') LIMIT 1", [userId, roleName]);
  return rows[0] || null;
}

export async function updateRequest(id, patch, actorId) {
  const allowed = { status: 'status', priority: 'priority', notes: 'notes', claimedBy: 'claimed_by' };
  const fields = []; const values = [];
  for (const [key, column] of Object.entries(allowed)) if (key in patch) { fields.push(`${column} = ?`); values.push(patch[key]); }
  if (fields.length) { values.push(id); await db.query(`UPDATE training_requests SET ${fields.join(', ')} WHERE id = ?`, values); }
  await audit(id, actorId, 'request_updated', patch);
  return getRequest(id);
}

export async function listSessions() {
  const [rows] = await db.query(`SELECT ts.*, u.username AS trainerName, COUNT(tp.request_id) AS participantCount,
    GROUP_CONCAT(tr.user_id) AS participantUserIds
    FROM training_sessions ts JOIN users u ON u.id=ts.trainer_id LEFT JOIN training_participants tp ON tp.session_id=ts.id
    LEFT JOIN training_requests tr ON tr.id=tp.request_id
    GROUP BY ts.id ORDER BY ts.starts_at`);
  return rows.map((row) => ({ ...row, participantUserIds: String(row.participantUserIds || '').split(',').filter(Boolean) }));
}

export async function createSession(input) {
  const [result] = await db.query(`INSERT INTO training_sessions (role_name, trainer_id, title, starts_at, ends_at, capacity, is_open, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [input.roleName, input.trainerId, input.title, input.startsAt, input.endsAt || null, input.capacity, input.isOpen ? 1 : 0, input.notes || null]);
  return result.insertId;
}

export async function addParticipant(sessionId, requestId) {
  await db.query('INSERT INTO training_participants (session_id, request_id) VALUES (?, ?)', [sessionId, requestId]);
  await db.query("UPDATE training_requests SET status='scheduled' WHERE id=?", [requestId]);
}

export async function createSessionWithParticipants(input, requestIds = []) {
  const uniqueIds = [...new Set(requestIds.map(Number).filter(Number.isFinite))];
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const effectiveEnd = input.endsAt || new Date(new Date(input.startsAt).getTime() + 2 * 60 * 60 * 1000);
    const [trainerOverlap] = await conn.query(`SELECT id FROM training_sessions WHERE trainer_id=? AND status='scheduled'
      AND starts_at < ? AND COALESCE(ends_at, DATE_ADD(starts_at, INTERVAL 2 HOUR)) > ? FOR UPDATE`, [input.trainerId, effectiveEnd, input.startsAt]);
    if (trainerOverlap.length) throw Object.assign(new Error('Trainer already has an overlapping session'), { status: 409 });
    let requests = [];
    if (uniqueIds.length) {
      const [rows] = await conn.query(`SELECT * FROM training_requests WHERE id IN (?) FOR UPDATE`, [uniqueIds]);
      requests = rows;
      if (rows.length !== uniqueIds.length) throw Object.assign(new Error('One or more training requests do not exist'), { status: 400 });
      if (rows.some((row) => row.role_name !== input.roleName || !['requested','claimed','planning'].includes(row.status))) throw Object.assign(new Error('All requests must be active and match the session role'), { status: 409 });
      if (rows.length > input.capacity) throw Object.assign(new Error('Session capacity is too small'), { status: 409 });
      const userIds = rows.map((row) => row.user_id);
      const [participantOverlap] = await conn.query(`SELECT tr.user_id FROM training_sessions ts
        JOIN training_participants tp ON tp.session_id=ts.id JOIN training_requests tr ON tr.id=tp.request_id
        WHERE tr.user_id IN (?) AND ts.status='scheduled' AND ts.starts_at < ?
        AND COALESCE(ts.ends_at, DATE_ADD(ts.starts_at, INTERVAL 2 HOUR)) > ? FOR UPDATE`, [userIds, effectiveEnd, input.startsAt]);
      if (participantOverlap.length) throw Object.assign(new Error('One or more players already have an overlapping session'), { status: 409 });
    }
    const [result] = await conn.query(`INSERT INTO training_sessions (role_name, trainer_id, title, starts_at, ends_at, capacity, is_open, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [input.roleName, input.trainerId, input.title, input.startsAt, input.endsAt || null, input.capacity, input.isOpen ? 1 : 0, input.notes || null]);
    for (const request of requests) {
      await conn.query('INSERT INTO training_participants (session_id, request_id) VALUES (?, ?)', [result.insertId, request.id]);
      await conn.query("UPDATE training_requests SET status='scheduled' WHERE id=?", [request.id]);
    }
    await conn.commit();
    return result.insertId;
  } catch (error) { await conn.rollback(); throw error; } finally { conn.release(); }
}

export async function joinOpenSession(sessionId, requestId, userId) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [sessions] = await conn.query("SELECT * FROM training_sessions WHERE id=? AND is_open=1 AND status='scheduled' FOR UPDATE", [sessionId]);
    const session = sessions[0];
    if (!session) throw Object.assign(new Error('Open session not found'), { status: 404 });
    const [[count]] = await conn.query('SELECT COUNT(*) AS total FROM training_participants WHERE session_id=?', [sessionId]);
    if (Number(count.total) >= session.capacity) throw Object.assign(new Error('Session is full'), { status: 409 });
    const [requests] = await conn.query('SELECT * FROM training_requests WHERE id=? FOR UPDATE', [requestId]);
    const request = requests[0];
    if (!request || String(request.user_id) !== String(userId) || request.role_name !== session.role_name || !['requested','claimed','planning'].includes(request.status)) throw Object.assign(new Error('An active matching personal request is required'), { status: 403 });
    const effectiveEnd = session.ends_at || new Date(new Date(session.starts_at).getTime() + 2 * 60 * 60 * 1000);
    const [overlap] = await conn.query(`SELECT ts.id FROM training_sessions ts JOIN training_participants tp ON tp.session_id=ts.id
      JOIN training_requests tr ON tr.id=tp.request_id WHERE tr.user_id=? AND ts.status='scheduled' AND ts.id<>?
      AND ts.starts_at < ? AND COALESCE(ts.ends_at, DATE_ADD(ts.starts_at, INTERVAL 2 HOUR)) > ?`, [userId, sessionId, effectiveEnd, session.starts_at]);
    if (overlap.length) throw Object.assign(new Error('Player already has an overlapping session'), { status: 409 });
    await conn.query('INSERT INTO training_participants (session_id, request_id) VALUES (?, ?)', [sessionId, requestId]);
    await conn.query("UPDATE training_requests SET status='scheduled' WHERE id=?", [requestId]);
    await conn.commit();
  } catch (error) { await conn.rollback(); throw error; } finally { conn.release(); }
}

export async function session(id) {
  const [sessions] = await db.query('SELECT * FROM training_sessions WHERE id=?', [id]);
  const [participants] = await db.query(`SELECT tp.*, tp.request_id AS requestId, tr.user_id AS userId, tr.role_name AS roleName, u.username
    FROM training_participants tp JOIN training_requests tr ON tr.id=tp.request_id JOIN users u ON u.id=tr.user_id WHERE tp.session_id=?`, [id]);
  return sessions[0] ? { ...sessions[0], participants } : null;
}

export async function completeParticipant({ sessionId, requestId, outcome, notes, actorId }) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [requestRows] = await conn.query(`SELECT tr.* FROM training_requests tr JOIN training_participants tp ON tp.request_id=tr.id
      JOIN training_sessions ts ON ts.id=tp.session_id WHERE tr.id=? AND tp.session_id=? AND tp.outcome='pending'
      AND ts.status='scheduled' AND tr.role_name=ts.role_name FOR UPDATE`, [requestId, sessionId]);
    const request = requestRows[0];
    if (!request) throw Object.assign(new Error('Pending participant not found in this session'), { status: 409 });
    await conn.query(`UPDATE training_participants SET outcome=?, assessment_notes=?, assessed_by=?, assessed_at=NOW()
      WHERE session_id=? AND request_id=?`, [outcome, notes || null, actorId, sessionId, requestId]);
    if (outcome === 'passed') {
      const [users] = await conn.query('SELECT permissions FROM users WHERE id=? FOR UPDATE', [request.user_id]);
      const permissions = json(users[0]?.permissions, {});
      permissions[request.role_name] = true;
      await conn.query('UPDATE users SET permissions=? WHERE id=?', [JSON.stringify(permissions), request.user_id]);
      await conn.query("UPDATE training_requests SET status='completed', completed_at=NOW() WHERE id=?", [requestId]);
    } else {
      await conn.query("UPDATE training_requests SET status='requested', claimed_by=NULL WHERE id=?", [requestId]);
    }
    await conn.query('INSERT INTO training_audit (request_id, actor_id, action, details) VALUES (?, ?, ?, ?)', [requestId, actorId, 'assessment_recorded', JSON.stringify({ outcome, notes })]);
    const [[remaining]] = await conn.query("SELECT COUNT(*) AS total FROM training_participants WHERE session_id=? AND outcome='pending'", [sessionId]);
    if (Number(remaining.total) === 0) await conn.query("UPDATE training_sessions SET status='completed' WHERE id=?", [sessionId]);
    await conn.commit();
    return request;
  } catch (error) { await conn.rollback(); throw error; } finally { conn.release(); }
}

export async function createProposal({ requestId, proposedBy, startsAt, endsAt, message }) {
  await db.query("UPDATE training_proposals SET status='superseded' WHERE request_id=? AND status='pending'", [requestId]);
  const [result] = await db.query(`INSERT INTO training_proposals (request_id, proposed_by, starts_at, ends_at, message) VALUES (?, ?, ?, ?, ?)`, [requestId, proposedBy, startsAt, endsAt || null, message || null]);
  await db.query("UPDATE training_requests SET status='planning' WHERE id=?", [requestId]);
  return result.insertId;
}

export async function listProposals(requestId) {
  const [rows] = await db.query(`SELECT p.*, u.username AS proposedByName FROM training_proposals p JOIN users u ON u.id=p.proposed_by WHERE p.request_id=? ORDER BY p.created_at DESC`, [requestId]);
  return rows;
}

export async function getProposal(id) {
  const [rows] = await db.query('SELECT * FROM training_proposals WHERE id=?', [id]);
  return rows[0] || null;
}

export async function acceptProposal(id) {
  const proposal = await getProposal(id);
  if (!proposal || proposal.status !== 'pending') return null;
  await db.query("UPDATE training_proposals SET status=IF(id=?,'accepted','superseded'), responded_at=IF(id=?,NOW(),responded_at) WHERE request_id=? AND status='pending'", [id, id, proposal.request_id]);
  return proposal;
}

export async function acceptProposalAndSchedule({ proposalId, requestId, actorId, trainerId, roleName }) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [proposals] = await conn.query("SELECT * FROM training_proposals WHERE id=? AND request_id=? AND status='pending' FOR UPDATE", [proposalId, requestId]);
    const proposal = proposals[0];
    if (!proposal) throw Object.assign(new Error('Proposal is no longer available'), { status: 409 });
    const [requests] = await conn.query("SELECT * FROM training_requests WHERE id=? AND status IN ('requested','claimed','planning') FOR UPDATE", [requestId]);
    if (!requests[0] || requests[0].role_name !== roleName) throw Object.assign(new Error('Training request is no longer available'), { status: 409 });
    const effectiveEnd = proposal.ends_at || new Date(new Date(proposal.starts_at).getTime() + 2 * 60 * 60 * 1000);
    const [overlap] = await conn.query(`SELECT id FROM training_sessions WHERE trainer_id=? AND status='scheduled' AND starts_at < ?
      AND COALESCE(ends_at, DATE_ADD(starts_at, INTERVAL 2 HOUR)) > ? FOR UPDATE`, [trainerId, effectiveEnd, proposal.starts_at]);
    if (overlap.length) throw Object.assign(new Error('Trainer already has an overlapping session'), { status: 409 });
    const [playerOverlap] = await conn.query(`SELECT ts.id FROM training_sessions ts JOIN training_participants tp ON tp.session_id=ts.id
      JOIN training_requests tr ON tr.id=tp.request_id WHERE tr.user_id=? AND ts.status='scheduled' AND ts.starts_at < ?
      AND COALESCE(ts.ends_at, DATE_ADD(ts.starts_at, INTERVAL 2 HOUR)) > ? FOR UPDATE`, [requests[0].user_id, effectiveEnd, proposal.starts_at]);
    if (playerOverlap.length) throw Object.assign(new Error('Player already has an overlapping session'), { status: 409 });
    await conn.query("UPDATE training_proposals SET status=IF(id=?,'accepted','superseded'), responded_at=IF(id=?,NOW(),responded_at) WHERE request_id=? AND status='pending'", [proposalId, proposalId, requestId]);
    const [result] = await conn.query(`INSERT INTO training_sessions (role_name, trainer_id, title, starts_at, ends_at, capacity, is_open, notes)
      VALUES (?, ?, ?, ?, ?, 1, 0, ?)`, [roleName, trainerId, `${roleName} training`, proposal.starts_at, proposal.ends_at, proposal.message]);
    await conn.query('INSERT INTO training_participants (session_id, request_id) VALUES (?, ?)', [result.insertId, requestId]);
    await conn.query("UPDATE training_requests SET status='scheduled' WHERE id=?", [requestId]);
    await conn.query('INSERT INTO training_audit (request_id, actor_id, action, details) VALUES (?, ?, ?, ?)', [requestId, actorId, 'proposal_accepted', JSON.stringify({ proposalId, sessionId: result.insertId })]);
    await conn.commit();
    return result.insertId;
  } catch (error) { await conn.rollback(); throw error; } finally { conn.release(); }
}

export async function audit(requestId, actorId, action, details = {}) {
  await db.query('INSERT INTO training_audit (request_id, actor_id, action, details) VALUES (?, ?, ?, ?)', [requestId, actorId, action, JSON.stringify(details)]);
}

export async function history(requestId) {
  const [rows] = await db.query(`SELECT a.*, u.username AS actorName FROM training_audit a LEFT JOIN users u ON u.id=a.actor_id WHERE a.request_id=? ORDER BY a.created_at DESC`, [requestId]);
  return rows.map((row) => ({ ...row, details: json(row.details, {}) }));
}
