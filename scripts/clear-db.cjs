#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

async function loadConfig() {
  const envHost = process.env.DB_HOST;
  const envUser = process.env.DB_USER;
  const envPassword = process.env.DB_PASSWORD;
  const envName = process.env.DB_NAME;
  const envPort = process.env.DB_PORT;

  let cfg = null;
  const cfgPath = path.join(process.cwd(), 'config', 'mysql.json');
  if (fs.existsSync(cfgPath)) {
    try { cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8')); } catch (e) { cfg = null; }
  }

  const host = envHost || (cfg && cfg.host) || '127.0.0.1';
  const user = envUser || (cfg && cfg.user) || 'tfo';
  const password = envPassword || (cfg && cfg.password) || 'tfo_pass';
  const database = envName || (cfg && cfg.database) || 'tfowebapp';
  const port = Number(envPort || (cfg && cfg.port) || 3306);
  return { host, user, password, database, port };
}

function askConfirmation(prompt) {
  return new Promise((resolve) => {
    const rl = require('readline').createInterface({ input: process.stdin, output: process.stdout });
    rl.question(prompt, (answer) => { rl.close(); resolve(answer); });
  });
}

(async () => {
  const args = process.argv.slice(2);
  const force = args.includes('-Force') || args.includes('--force');
  const cfg = await loadConfig();
  console.log(`Database target: ${cfg.host}:${cfg.port} / ${cfg.database}`);

  // Determine mode from flags, if provided
  let mode = null; // 'drop' | 'truncate' | 'drop-recreate'
  if (args.includes('--truncate') || args.includes('-t')) mode = 'truncate';
  if (args.includes('--drop') || args.includes('-d')) mode = 'drop';
  if (args.includes('--recreate') || args.includes('-r')) {
    // If recreate requested without explicit drop flag, treat as drop-recreate
    if (mode === 'truncate') {
      // contradictory flags; prefer explicit drop-recreate
      mode = 'drop-recreate';
    } else {
      mode = mode === 'drop' ? 'drop-recreate' : (mode || 'drop-recreate');
    }
  }

  // If no mode specified, present interactive menu
  if (!mode) {
    console.log('Select an action:');
    console.log('  1) Drop all tables (remove schema and data)');
    console.log('  2) Clear all data (TRUNCATE/DELETE) but keep schema');
    console.log('  3) Drop all tables AND recreate empty schema (drop + init)');
    console.log('  4) Cancel');
    const choice = await askConfirmation('Choose 1,2,3 or 4: ');
    if (choice === '1') mode = 'drop';
    else if (choice === '2') mode = 'truncate';
    else if (choice === '3') mode = 'drop-recreate';
    else {
      console.log('Cancelled by user.');
      process.exit(0);
    }
  }

  console.log(`Chosen action: ${mode}`);

  if (!force) {
    const ans = await askConfirmation(`Type DELETE to confirm action '${mode}' on database '${cfg.database}': `);
    if (ans !== 'DELETE') {
      console.log('Aborted by user.');
      process.exit(1);
    }
  } else {
    console.log('-Force supplied: skipping interactive confirmation');
  }

  let conn;
  try {
    conn = await mysql.createConnection({ host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password, database: cfg.database });
    const [rows] = await conn.execute("SELECT TABLE_NAME, TABLE_TYPE FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?", [cfg.database]);
    const allTables = (rows || []).map(r => ({ name: r.TABLE_NAME, type: r.TABLE_TYPE })).filter(Boolean);
    const tables = allTables.map(r => r.name).filter(Boolean);
    if (tables.length === 0) {
      console.log(`No tables found in database '${cfg.database}'. Nothing to do.`);
      await conn.end();
      process.exit(0);
    }

    if (mode === 'truncate') {
      console.log(`Clearing data from ${tables.length} tables (preserving schema)...`);
      await conn.query('SET FOREIGN_KEY_CHECKS = 0');
      for (const t of tables) {
        try {
          await conn.query(`TRUNCATE TABLE \`${t}\``);
          console.log(`Truncated ${t}`);
        } catch (err) {
          try {
            await conn.query(`DELETE FROM \`${t}\``);
            console.log(`Deleted rows from ${t}`);
          } catch (err2) {
            console.error(`Failed to clear table ${t}:`, err2 && err2.message ? err2.message : err2);
          }
        }
      }
      await conn.query('SET FOREIGN_KEY_CHECKS = 1');
      console.log(`All tables cleared (schema preserved) from '${cfg.database}'.`);
      await conn.end();
      process.exit(0);
    }

    if (mode === 'drop' || mode === 'drop-recreate') {
      console.log(`Dropping ${tables.length} tables...`);
      await conn.query('SET FOREIGN_KEY_CHECKS = 0');
      for (const t of tables) {
        await conn.query(`DROP TABLE IF EXISTS \`${t}\``);
        console.log(`Dropped ${t}`);
      }
      await conn.query('SET FOREIGN_KEY_CHECKS = 1');
      console.log(`All tables dropped from '${cfg.database}'.`);
      await conn.end();

      if (mode === 'drop-recreate') {
        try {
          const { spawnSync } = require('child_process');
          const scriptPath = path.join(process.cwd(), 'scripts', 'init-schema.mjs');
          console.log('Recreating tables (empty schema) because drop-recreate was selected...');
          const res = spawnSync('node', [scriptPath], { stdio: 'inherit' });
          if (res.status !== 0) {
            console.error('Schema initialization failed with exit code', res.status);
            process.exit(3);
          }
          console.log('Empty schema recreated successfully.');
          process.exit(0);
        } catch (err) {
          console.error('Failed to run schema init:', err && err.message ? err.message : err);
          process.exit(3);
        }
      }

      process.exit(0);
    }

    console.log('Unknown mode, exiting.');
    await conn.end();
    process.exit(1);

  } catch (err) {
    if (conn) try { await conn.end(); } catch (e) {}
    console.error('Error clearing DB:', err && err.message ? err.message : err);
    process.exit(2);
  }
})();
