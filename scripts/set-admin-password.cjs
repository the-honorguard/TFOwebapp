#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

async function loadConfig() {
  const cfgPath = path.join(process.cwd(), 'config', 'mysql.json');
  let cfg = null;
  if (fs.existsSync(cfgPath)) {
    try { cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8')); } catch (e) { cfg = null; }
  }
  const host = process.env.DB_HOST || (cfg && cfg.host) || '127.0.0.1';
  const user = process.env.DB_USER || (cfg && cfg.user) || 'tfo';
  const password = process.env.DB_PASSWORD || (cfg && cfg.password) || 'tfo_pass';
  const database = process.env.DB_NAME || (cfg && cfg.database) || 'tfowebapp';
  const port = Number(process.env.DB_PORT || (cfg && cfg.port) || 3306);
  return { host, user, password, database, port };
}

(async () => {
  try {
    const passwordIndex = process.argv.indexOf('--password');
    const newPassword = passwordIndex >= 0 ? process.argv[passwordIndex + 1] : '';
    const { validatePassword } = await import('../lib/authSecurity.js');
    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      console.error(`Usage: node .\\scripts\\set-admin-password.cjs --password <password>\n${passwordError}`);
      process.exit(1);
    }
    const cfg = await loadConfig();
    const conn = await mysql.createConnection({ host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password, database: cfg.database });
    const hash = bcrypt.hashSync(newPassword, 10);
    const [res] = await conn.query('UPDATE users SET password_hash = ? WHERE username = ?', [hash, 'admin']);
    if (res.affectedRows && res.affectedRows > 0) {
      console.log('Admin password updated');
    } else {
      console.error('No admin user found to update');
      process.exit(2);
    }
    await conn.end();
    process.exit(0);
  } catch (err) {
    console.error('Error setting admin password:', err && err.message ? err.message : err);
    process.exit(3);
  }
})();
