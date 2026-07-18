#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

const LOG_DIR = path.join(process.cwd(), 'logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
const COMBINED = path.join(LOG_DIR, 'combined.log');
const APP_LOG = path.join(LOG_DIR, 'app.log');

function write(prefix, chunk) {
  const out = `${new Date().toISOString()} ${prefix} ${chunk.replace(/\r?\n/g, '\n')}`;
  fs.appendFileSync(COMBINED, out + '\n');
}

// Pipe DB docker logs
const docker = spawn('docker', ['logs', '-f', 'tfowebapp-db-1']);
docker.stdout.on('data', (d) => write('[db]', d.toString()));
docker.stderr.on('data', (d) => write('[db:err]', d.toString()));
docker.on('close', (code) => write('[db]', `docker logs process exited ${code}`));

// Tail backend app.log by watching file for changes
let lastSize = 0;
function readNew() {
  try {
    const st = fs.existsSync(APP_LOG) ? fs.statSync(APP_LOG) : null;
    if (!st) return;
    if (st.size > lastSize) {
      const rs = fs.createReadStream(APP_LOG, { start: lastSize, end: st.size });
      rs.on('data', (d) => write('[backend]', d.toString()));
      lastSize = st.size;
    }
  } catch (e) {
    write('[collector:error]', String(e));
  }
}

// initial read
readNew();
// poll for changes every second
const t = setInterval(readNew, 1000);

process.on('SIGINT', () => {
  docker.kill();
  clearInterval(t);
  process.exit(0);
});

console.log('Log collector running, writing to', COMBINED);
