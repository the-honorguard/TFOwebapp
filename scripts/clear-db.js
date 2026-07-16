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

  if (!force) {
    const ans = await askConfirmation(`Type DELETE to confirm wiping all tables in database '${cfg.database}': `);
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
    const [rows] = await conn.execute("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?", [cfg.database]);
    const tables = rows.map(r => r.TABLE_NAME).filter(Boolean);
    if (tables.length === 0) {
      console.log(`No tables found in database '${cfg.database}'. Nothing to do.`);
      await conn.end();
      process.exit(0);
    }
    console.log(`Dropping ${tables.length} tables...`);
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const t of tables) {
      await conn.query(`DROP TABLE IF EXISTS \`${t}\``);
    }
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');
    console.log(`All tables dropped from '${cfg.database}'.`);
    await conn.end();
    process.exit(0);
  } catch (err) {
    if (conn) try { await conn.end(); } catch (e) {}
    console.error('Error clearing DB:', err && err.message ? err.message : err);
    process.exit(2);
  }
})();
