import db from '../db.js';

(async () => {
  try {
    const [rows] = await db.query('SELECT COUNT(*) AS c FROM users');
    console.log('users count:', rows[0].c);
  } catch (e) {
    console.error('Error querying users:', e.code || e.message || e);
    process.exit(2);
  }
  process.exit(0);
})();
