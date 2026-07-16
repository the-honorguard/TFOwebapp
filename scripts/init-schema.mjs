import { ensureSchema } from '../lib/dataStore.js';

(async () => {
  try {
    console.log('Ensuring DB schema...');
    await ensureSchema();
    console.log('Schema created/ensured successfully.');
    process.exit(0);
  } catch (err) {
    console.error('Schema initialization error', err && err.stack ? err.stack : err);
    process.exit(1);
  }
})();
