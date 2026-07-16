import { ensureInitialized } from '../lib/dataStore.js';

(async () => {
  try {
    console.log('Running full DB initialization (schema + seed data)...');
    await ensureInitialized();
    console.log('Database initialized successfully.');
    process.exit(0);
  } catch (err) {
    console.error('Database initialization failed:', err && err.stack ? err.stack : err);
    process.exit(2);
  }
})();
