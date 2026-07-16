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

(async () => {
  try {
    const cfg = await loadConfig();
    const conn = await mysql.createConnection({ host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password, database: cfg.database });
    const [rows] = await conn.execute('SELECT id, username, email, role, `rank`, status, password_hash FROM users');
    console.log('Users:');
    for (const r of rows) {
      console.log(r);
    }
    await conn.end();
  } catch (err) {
    console.error('Error:', err && err.message ? err.message : err);
    process.exit(1);
  }
})();
