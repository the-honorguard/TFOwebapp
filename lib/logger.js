import fs from 'fs';
import path from 'path';

const LOG_DIR = path.join(process.cwd(), 'logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
const APP_LOG = path.join(LOG_DIR, 'app.log');

function timestamp() {
  return new Date().toISOString();
}

function writeLine(line) {
  try {
    fs.appendFileSync(APP_LOG, line + '\n', 'utf8');
  } catch (e) {
    // best-effort: still print to console
    console.error('Logger write error', e && e.message ? e.message : e);
  }
}

export function info(msg, meta = {}) {
  const line = `${timestamp()} INFO ${typeof msg === 'string' ? msg : JSON.stringify(msg)} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
  writeLine(line);
  console.log(line);
}

export function warn(msg, meta = {}) {
  const line = `${timestamp()} WARN ${typeof msg === 'string' ? msg : JSON.stringify(msg)} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
  writeLine(line);
  console.warn(line);
}

export function error(msg, meta = {}) {
  const line = `${timestamp()} ERROR ${typeof msg === 'string' ? msg : JSON.stringify(msg)} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
  writeLine(line);
  console.error(line);
}

export default { info, warn, error };
