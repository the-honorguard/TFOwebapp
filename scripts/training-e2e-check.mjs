import bcrypt from 'bcryptjs';
import db from '../db.js';

const base = process.env.TRAINING_TEST_URL || 'http://localhost:3101/api';
const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
const names = { member: `e2e_member_${suffix}`, other: `e2e_other_${suffix}`, trainer: `e2e_drill_${suffix}` };
const password = `E2e-${suffix}!`;
const ids = [];
const results = [];
const assert = (condition, message) => { if (!condition) throw new Error(message); results.push(`PASS: ${message}`); };
const api = async (path, token, options = {}) => {
  const response = await fetch(`${base}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
};

async function addUser(username, role, drill = false) {
  const [result] = await db.query('INSERT INTO users (username,password_hash,role,status,permissions,is_drill_sergeant) VALUES (?,?,?,?,?,?)', [username, bcrypt.hashSync(password, 8), role, 'Active', '{}', drill ? 1 : 0]);
  ids.push(result.insertId);
  await db.query('INSERT INTO user_profiles (user_id,settings) VALUES (?,?)', [result.insertId, JSON.stringify({ arma_experience: 'Basic', availability_sunday: 'Yes' })]);
  return result.insertId;
}

async function login(username) {
  const response = await api('/login', null, { method: 'POST', body: JSON.stringify({ username, password }) });
  assert(response.status === 200 && response.body.token, `${username} can log in`);
  return response.body.token;
}

try {
  const trainerGroup = `e2e_drill_${suffix}`.slice(0, 60);
  const trainerPermissions = { view_training: true, view_training_mine: true, view_training_queue: true, view_training_sessions: true, view_training_history: true };
  await db.query('INSERT INTO permission_groups (slug,name,is_system,permissions) VALUES (?,?,0,?)', [trainerGroup, `E2E Drill ${suffix}`, JSON.stringify(trainerPermissions)]);
  const memberId = await addUser(names.member, 'member');
  const otherId = await addUser(names.other, 'member');
  const trainerId = await addUser(names.trainer, trainerGroup, true);
  await db.query('INSERT INTO trainer_role_rights (user_id,role_name) VALUES (?,?)', [trainerId, 'Rifleman']);

  const memberToken = await login(names.member);
  const otherToken = await login(names.other);
  const trainerToken = await login(names.trainer);

  const memberView = await api('/training', memberToken);
  assert(memberView.status === 200, 'member can open training module');
  assert(memberView.body.access.windows.mine === true && memberView.body.access.windows.queue === false, 'member sees My training but not Drill Sergeant queue');
  assert(memberView.body.access.trainer === false, 'member is not treated as Drill Sergeant');

  const deniedSession = await api('/training/sessions', memberToken, { method: 'POST', body: JSON.stringify({ roleName: 'Rifleman', startsAt: new Date(Date.now() + 86400000).toISOString(), capacity: 1 }) });
  assert(deniedSession.status === 403, 'member cannot create a trainer session');

  const created = await api('/training/requests', memberToken, { method: 'POST', body: JSON.stringify({ roleName: 'Rifleman', notes: 'E2E member request' }) });
  assert(created.status === 201, 'member can request training');
  const requestId = created.body.request.id;

  const trainerView = await api('/training', trainerToken);
  assert(trainerView.body.access.windows.queue === true && trainerView.body.access.trainer === true, 'Drill Sergeant sees queue');
  assert(trainerView.body.requests.some((request) => request.id === requestId), 'Drill Sergeant sees matching role request');
  const detail = await api(`/training/requests/${requestId}`, trainerToken);
  assert(detail.status === 200 && detail.body.request.survey.arma_experience === 'Basic', 'Drill Sergeant can see request survey');

  const claim = await api(`/training/requests/${requestId}`, trainerToken, { method: 'PUT', body: JSON.stringify({ action: 'claim' }) });
  assert(claim.status === 200 && claim.body.request.status === 'claimed', 'Drill Sergeant can claim request');
  const memberNotifications = await api('/notifications', memberToken);
  assert(memberNotifications.body.notifications.some((item) => item.entityId === requestId), 'member receives claim notification');

  const startsAt = new Date(Date.now() + 2 * 86400000).toISOString();
  const proposal = await api(`/training/requests/${requestId}/proposals`, memberToken, { method: 'POST', body: JSON.stringify({ startsAt, message: 'Suggested date' }) });
  assert(proposal.status === 201, 'member can propose a training date');
  const trainerNotifications = await api('/notifications', trainerToken);
  assert(trainerNotifications.body.notifications.some((item) => item.entityId === requestId), 'Drill Sergeant receives proposal notification');

  const accepted = await api(`/training/proposals/${proposal.body.id}/accept`, trainerToken, { method: 'POST', body: '{}' });
  assert(accepted.status === 200 && accepted.body.session.participants.length === 1, 'Drill Sergeant can accept proposal and create session');
  const sessionId = accepted.body.session.id;
  const memberScheduled = await api('/training', memberToken);
  assert(memberScheduled.body.sessions.some((session) => session.id === sessionId), 'member sees private scheduled session');

  const otherRequest = await api('/training/requests', trainerToken, { method: 'POST', body: JSON.stringify({ userId: otherId, roleName: 'Rifleman', notes: 'Unrelated request' }) });
  assert(otherRequest.status === 201, 'Drill Sergeant can create request for another member');
  const exploitAttempt = await api(`/training/sessions/${sessionId}/participants/${otherRequest.body.request.id}/complete`, trainerToken, { method: 'POST', body: JSON.stringify({ outcome: 'passed' }) });
  assert(exploitAttempt.status === 409, 'trainer cannot complete a request that is not in the session');

  const missingNotes = await api(`/training/sessions/${sessionId}/participants/${requestId}/complete`, trainerToken, { method: 'POST', body: JSON.stringify({ outcome: 'not_yet' }) });
  assert(missingNotes.status === 400, 'not-yet assessment requires notes');
  const passed = await api(`/training/sessions/${sessionId}/participants/${requestId}/complete`, trainerToken, { method: 'POST', body: JSON.stringify({ outcome: 'passed', notes: 'Completed E2E assessment' }) });
  assert(passed.status === 200, 'Drill Sergeant can pass actual participant');
  const [qualified] = await db.query('SELECT permissions FROM users WHERE id=?', [memberId]);
  const permissions = typeof qualified[0].permissions === 'string' ? JSON.parse(qualified[0].permissions) : qualified[0].permissions;
  assert(permissions.Rifleman === true, 'passing automatically assigns role qualification');
  const repeat = await api('/training/requests', memberToken, { method: 'POST', body: JSON.stringify({ roleName: 'Medic' }) });
  assert(repeat.status === 409, 'three-month global cooldown blocks another request');
  const resultNotifications = await api('/notifications', memberToken);
  assert(resultNotifications.body.notifications.some((item) => item.metadata?.outcome === 'passed'), 'member receives passed-result notification');

  console.log(results.join('\n'));
  console.log(`SUMMARY: ${results.length} checks passed`);
  if (process.env.KEEP_E2E === '1') console.log(`E2E_ACCOUNTS:${JSON.stringify({ names, password, ids })}`);
} finally {
  if (process.env.KEEP_E2E !== '1' && ids.length) {
    await db.query('DELETE FROM training_audit WHERE actor_id IN (?) OR request_id IN (SELECT id FROM training_requests WHERE user_id IN (?))', [ids, ids]);
    await db.query('DELETE FROM training_proposals WHERE proposed_by IN (?) OR request_id IN (SELECT id FROM training_requests WHERE user_id IN (?))', [ids, ids]);
    await db.query('DELETE tp FROM training_participants tp JOIN training_requests tr ON tr.id=tp.request_id WHERE tr.user_id IN (?)', [ids]);
    await db.query('DELETE FROM training_sessions WHERE trainer_id IN (?)', [ids]);
    await db.query('DELETE FROM training_requests WHERE user_id IN (?) OR created_by IN (?)', [ids, ids]);
    await db.query('DELETE FROM notifications WHERE user_id IN (?) OR actor_id IN (?)', [ids, ids]);
    await db.query('DELETE FROM trainer_role_rights WHERE user_id IN (?)', [ids]);
    await db.query('DELETE FROM user_profiles WHERE user_id IN (?)', [ids]);
    await db.query('DELETE FROM users WHERE id IN (?)', [ids]);
  }
  if (process.env.KEEP_E2E !== '1') await db.query("DELETE FROM permission_groups WHERE slug LIKE 'e2e_drill_%'");
  await db.end();
}
