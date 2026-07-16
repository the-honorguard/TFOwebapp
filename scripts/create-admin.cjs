#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

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

function usage() {
  console.log('Usage: node .\\scripts\\create-admin.cjs --username <name> --password <pw>');
  process.exit(1);
}

(async () => {
  const args = process.argv.slice(2);
  const usernameIndex = args.indexOf('--username');
  const passwordIndex = args.indexOf('--password');
  if (usernameIndex === -1 || passwordIndex === -1) return usage();
  const username = args[usernameIndex + 1];
  const password = args[passwordIndex + 1];
  if (!username || !password) return usage();

  const cfg = await loadConfig();
  let conn;
  try {
    conn = await mysql.createConnection({ host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password, database: cfg.database });
    const hash = bcrypt.hashSync(password, 10);
    const id = Date.now();
    await conn.query('INSERT INTO users (id, username, email, password_hash, role, `rank`, status, permissions) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [id, username, null, hash, 'admin', '', 'Active', JSON.stringify({})]);
    console.log(`Created admin user '${username}' with id ${id}`);
    await conn.end();
    process.exit(0);
  } catch (err) {
    if (conn) try { await conn.end(); } catch (e) {}
    console.error('Error creating admin:', err && err.message ? err.message : err);
    process.exit(2);
  }
})();
