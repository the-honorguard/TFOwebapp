import db from '../db.js';

(async () => {
  try {
    const [rows] = await db.query("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME");
    console.log('Tables:');
    for (const r of rows) console.log('-', r.TABLE_NAME);
  } catch (e) {
    console.error('Error listing tables:', e.message || e);
    process.exit(2);
  }
  process.exit(0);
})();
