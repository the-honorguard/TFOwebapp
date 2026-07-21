#!/usr/bin/env node
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config({ quiet: true });

const maxWait = Number(process.env.WAIT_DB_SECONDS || 120);
const interval = Number(process.env.WAIT_DB_INTERVAL || 2000);

let host = process.env.DB_HOST || process.env.MYSQL_HOST || '127.0.0.1';
let port = Number(process.env.DB_PORT || process.env.MYSQL_PORT || 3306);
let user = process.env.DB_USER || process.env.MYSQL_USER || 'tfo';
let password = process.env.DB_PASSWORD || process.env.MYSQL_PASSWORD || 'tfo_pass';
let database = process.env.DB_NAME || process.env.MYSQL_DATABASE || 'tfowebapp';

// fallback to config/mysql.json
try {
  const cfgPath = path.join(process.cwd(), 'config', 'mysql.json');
  if (fs.existsSync(cfgPath)) {
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    host = host || cfg.host;
    port = port || cfg.port;
    user = user || cfg.user;
    password = password || cfg.password;
    database = database || cfg.database;
  }
} catch (e) {
  // ignore
}

async function tryConnect() {
  try {
    const conn = await mysql.createConnection({ host, port, user, password, database, connectTimeout: 5000 });
    await conn.end();
    return true;
  } catch (e) {
    return false;
  }
}

(async () => {
  const deadline = Date.now() + maxWait * 1000;
  process.stdout.write(`Waiting for DB at ${host}:${port}... `);
  while (Date.now() < deadline) {
    // eslint-disable-next-line no-await-in-loop
    const ok = await tryConnect();
    if (ok) {
      console.log('ok');
      process.exit(0);
    }
    process.stdout.write('.');
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, interval));
  }
  console.error('\nTimed out waiting for DB');
  process.exit(2);
})();
