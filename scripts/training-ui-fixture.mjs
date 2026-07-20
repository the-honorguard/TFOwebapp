import bcrypt from 'bcryptjs';
import db from '../db.js';

const marker = process.argv[2];
const password = 'Training-ui-test-2026!';
if (!marker) throw new Error('Fixture marker required');
const names = { member: `ui_member_${marker}`, trainer: `ui_drill_${marker}` };

if (process.argv.includes('--cleanup')) {
  const [users] = await db.query('SELECT id FROM users WHERE username IN (?,?)', [names.member, names.trainer]);
  const ids = users.map((row) => row.id);
  if (ids.length) {
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
  await db.query('DELETE FROM permission_groups WHERE slug=?', [`ui_drill_${marker}`]);
  console.log('fixture removed');
} else {
  const permissions = { view_training: true, view_training_mine: true, view_training_queue: true, view_training_sessions: true, view_training_history: true };
  await db.query('INSERT INTO permission_groups (slug,name,is_system,permissions) VALUES (?,?,0,?)', [`ui_drill_${marker}`, 'UI Drill test', JSON.stringify(permissions)]);
  const hash = bcrypt.hashSync(password, 8);
  const [member] = await db.query('INSERT INTO users (username,password_hash,role,status,permissions,is_drill_sergeant) VALUES (?,?,?,?,?,0)', [names.member, hash, 'member', 'Active', '{}']);
  const [trainer] = await db.query('INSERT INTO users (username,password_hash,role,status,permissions,is_drill_sergeant) VALUES (?,?,?,?,?,1)', [names.trainer, hash, `ui_drill_${marker}`, 'Active', '{}']);
  await db.query('INSERT INTO user_profiles (user_id,settings) VALUES (?,?)', [member.insertId, JSON.stringify({ arma_experience: 'Experienced', found_via: 'UI fixture' })]);
  await db.query('INSERT INTO trainer_role_rights (user_id,role_name) VALUES (?,?)', [trainer.insertId, 'Rifleman']);
  console.log(JSON.stringify({ marker, names, password, ids: [member.insertId, trainer.insertId] }));
}
await db.end();
