process.on('uncaughtException', (err) => {
  try {
    require('fs').writeFileSync(
        __dirname + '/crash.log',
        String(err && err.stack ? err.stack : err)
    );
  } catch (e) {}
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  try {
    require('fs').writeFileSync(
        __dirname + '/crash.log',
        'unhandledRejection: ' + String(err && err.stack ? err.stack : err)
    );
  } catch (e) {}
  process.exit(1);
});
import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import crypto from 'crypto';
import multer from 'multer';
import dotenv from 'dotenv';
import pool, { testConnection } from './db.js';
import logger from './lib/logger.js';
import { readData as _readData, writeData as _writeData, ensureInitialized as ensureDbInitialized, resetDatabase, seedDemo, seedEssential } from './lib/dataStore.js';

dotenv.config();

async function testDb() {
  try {
    const [rows] = await pool.query('SELECT 1 AS ok');
    logger.info('DB connected', { rows });
  } catch (err) {
    logger.error('DB connection error', { message: err && err.message ? err.message : String(err) });
  }
}

testDb();

/*
 * server.js - minimal backend for development
 * - Provides basic REST endpoints under `/api/*` for users, templates, ops and recurrences
 * - Data is stored in MySQL (see db.js / lib/dataStore.js)
 * - Simple token-based auth (JWT) and role checks are implemented for admin/missionmaker paths
 */
const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;
const SECRET = 'tfo-secret';
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
const ALLOWED_UPLOAD_EXTENSIONS = new Set(['.html', '.htm', '.txt', '.json', '.svg', '.png', '.jpg', '.jpeg', '.gif']);

// Ranks are seeded and managed in `lib/dataStore.js` (DB-backed). Remove duplicated in-code seed.

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const uploadStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${crypto.randomUUID()}${ext}`);
  }
});

const upload = multer({
  storage: uploadStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_UPLOAD_EXTENSIONS.has(ext)) {
      return cb(new Error('File type not allowed'));
    }
    cb(null, true);
  }
});

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(UPLOADS_DIR));

// Endpoint for client-side logs (frontend sends errors/warnings here)
app.post('/api/client-log', (req, res) => {
  try {
    const { level = 'info', message = '', meta = {} } = req.body || {};
    if (typeof logger[level] === 'function') logger[level](message, meta);
    else logger.info(message, meta);
    return res.json({ ok: true });
  } catch (e) {
    logger.error('Failed to write client log', { err: e && e.message ? e.message : String(e) });
    return res.status(500).json({ ok: false });
  }
});

// Lightweight health endpoint to detect DB availability
app.get('/health', async (req, res) => {
  try {
    await testConnection(2000);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(503).json({ ok: false, error: err && err.message ? err.message : 'DB unavailable' });
  }
});

// Dedicated DB health endpoint for monitoring/alerts. Returns connected=false
// with 503 when DB check fails, and includes server version when available.
app.get('/api/db-health', async (req, res) => {
  try {
    await testConnection(2000);
    let version = null;
    try {
      const [r] = await pool.query('SELECT VERSION() as version');
      version = Array.isArray(r) && r[0] ? r[0].version : null;
    } catch (e) {
      // ignore version lookup failures
    }
    return res.json({ ok: true, connected: true, version });
  } catch (err) {
    logger.warn('DB health check failed', { err: err && err.message ? err.message : String(err) });
    return res.status(503).json({ ok: false, connected: false, error: err && err.message ? err.message : String(err) });
  }
});

// Init-status for frontend: returns whether DB appears initialized (users exist)
app.get('/api/init-status', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT COUNT(*) as c FROM users');
    const initialized = Array.isArray(rows) && rows[0] && rows[0].c > 0;
    return res.json({ initialized: !!initialized });
  } catch (err) {
    // If users table doesn't exist, consider DB not initialized (but reachable)
    if (err && (err.code === 'ER_NO_SUCH_TABLE' || err.errno === 1146)) {
      return res.json({ initialized: false });
    }
    return res.status(503).json({ error: 'DB unavailable' });
  }
});

// Return table row counts and simple DB info for the setup page
app.get('/api/db-info', async (req, res) => {
  console.log('GET /api/db-info called from', req.ip || req.headers['x-forwarded-for'] || 'unknown');
  const tables = ['users','user_profiles','ranks','templates','ops','recurrences','campaigns','modlists','files','backups','roles'];
  try {
    const results = [];
    for (const t of tables) {
      try {
        const [r] = await pool.query(`SELECT COUNT(*) as c FROM \`${t}\``);
        results.push({ table: t, rows: Array.isArray(r) && r[0] ? Number(r[0].c) : 0 });
      } catch (e) {
        // if table doesn't exist, treat as zero
        results.push({ table: t, rows: 0, error: e && e.code ? e.code : String(e) });
      }
    }
    return res.json({ tables: results });
  } catch (err) {
    console.error('DB info error', err && err.stack ? err.stack : err);
    return res.status(500).json({ error: 'Failed to collect DB info' });
  }
});

// Simple DB integrity check endpoint: returns counts and basic sanity checks
app.get('/api/db-check', async (req, res) => {
  try {
    const tables = ['users','user_profiles','ranks','templates','ops','recurrences','campaigns','modlists','files','backups','roles'];
    const results = {};
    for (const t of tables) {
      try {
        const [r] = await pool.query(`SELECT COUNT(*) as c FROM \`${t}\``);
        results[t] = { rows: Array.isArray(r) && r[0] ? Number(r[0].c) : 0 };
      } catch (e) {
        results[t] = { error: e && e.code ? e.code : String(e) };
      }
    }

    // Check for an admin user and placeholder password
    let admin = { exists: false, id: null, placeholder: false };
    try {
      const [a] = await pool.query('SELECT id, password_hash FROM users WHERE username = ? LIMIT 1', ['admin']);
      if (Array.isArray(a) && a[0]) {
        admin.exists = true; admin.id = a[0].id; admin.placeholder = a[0].password_hash === 'admin-disabled';
      }
    } catch (e) { /* ignore */ }

    // Basic orphan check: templates with non-existing owner_id
    let orphanTemplates = 0;
    try {
      const [rows] = await pool.query(`SELECT COUNT(*) as c FROM templates t LEFT JOIN users u ON u.id = t.owner_id WHERE t.owner_id IS NOT NULL AND u.id IS NULL`);
      orphanTemplates = Array.isArray(rows) && rows[0] ? Number(rows[0].c) : 0;
    } catch (e) { /* ignore */ }

    return res.json({ ok: true, results, admin, orphanTemplates });
  } catch (err) {
    console.error('DB-check error', err && err.stack ? err.stack : err);
    return res.status(500).json({ ok: false, error: err && err.message ? err.message : String(err) });
  }
});

// Simple initialization endpoint used by public/init.html
app.post('/init', async (req, res) => {
  try {
    await ensureDbInitialized();
    return res.json({ ok: true });
  } catch (err) {
    console.error('Init error', err && err.stack ? err.stack : err);
    return res.status(500).json({ error: 'Initialization failed', details: err && err.message ? err.message : String(err) });
  }
});

// --- Log collector management (start/stop) and live stream ---
let logCollectorProc = null;

app.post('/api/logs/start', (req, res) => {
  try {
    if (logCollectorProc && !logCollectorProc.killed) {
      return res.json({ ok: true, running: true, pid: logCollectorProc.pid });
    }
    const nodeExec = process.execPath || 'node';
    const proc = spawn(nodeExec, ['scripts/collect-logs.js'], { cwd: process.cwd(), stdio: 'ignore', detached: true });
    proc.unref();
    logCollectorProc = proc;
    logger.info('Log collector started', { pid: proc.pid });
    return res.json({ ok: true, pid: proc.pid });
  } catch (e) {
    logger.error('Failed to start log collector', { err: e && e.message ? e.message : String(e) });
    return res.status(500).json({ ok: false, error: e && e.message ? e.message : String(e) });
  }
});

app.post('/api/logs/stop', (req, res) => {
  try {
    if (!logCollectorProc) return res.json({ ok: true, running: false });
    try {
      process.kill(logCollectorProc.pid);
    } catch (e) {
      // may already be dead
    }
    logger.info('Log collector stopped', { pid: logCollectorProc.pid });
    logCollectorProc = null;
    return res.json({ ok: true });
  } catch (e) {
    logger.error('Failed to stop log collector', { err: e && e.message ? e.message : String(e) });
    return res.status(500).json({ ok: false });
  }
});

// SSE endpoint to stream appended lines from logs/combined.log
app.get('/api/logs/stream', (req, res) => {
  const logPath = path.join(process.cwd(), 'logs', 'combined.log');
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  });

  let pos = 0;
  try {
    if (fs.existsSync(logPath)) pos = fs.statSync(logPath).size;
  } catch (e) {
    pos = 0;
  }

  const sendChunk = (chunk) => {
    const lines = chunk.toString().split(/\r?\n/);
    for (const line of lines) {
      if (!line) continue;
      // SSE data line
      res.write('data: ' + line.replace(/\n/g, '\\n') + '\n\n');
    }
  };

  // watch file for changes
  const dir = path.dirname(logPath);
  let watcher = null;
  try {
    watcher = fs.watch(dir, (eventType, filename) => {
      if (!filename || path.basename(filename) !== path.basename(logPath)) return;
      try {
        const st = fs.statSync(logPath);
        if (st.size > pos) {
          const rs = fs.createReadStream(logPath, { start: pos, end: st.size });
          rs.on('data', sendChunk);
          rs.on('end', () => { pos = st.size; });
        }
      } catch (e) {
        // ignore
      }
    });
  } catch (e) {
    // fallback: file may not exist yet
  }

  req.on('close', () => {
    try { if (watcher) watcher.close(); } catch (e) {}
    res.end();
  });
});

// Reset database: DROP all tables and re-create schema
app.post('/init/reset', async (req, res) => {
  try {
    const wantEmpty = (req.query && req.query.empty === '1') || (req.body && req.body.empty === true);
    await resetDatabase();
    if (wantEmpty) {
      // Ensure tables exist but remove any seeded rows so DB is truly empty
      const conn = await pool.getConnection();
      try {
        await conn.query('SET FOREIGN_KEY_CHECKS = 0');
        const toClear = ['recurrences','ops','templates','roles','files','modlists','backups','campaigns','ranks','user_profiles','users'];
        for (const t of toClear) {
          try { await conn.query(`DELETE FROM \`${t}\``); } catch (e) { /* ignore */ }
        }
        await conn.query('SET FOREIGN_KEY_CHECKS = 1');
      } finally {
        conn.release();
      }
    } else {
      await ensureDbInitialized();
    }
    return res.json({ ok: true, empty: !!wantEmpty });
  } catch (err) {
    console.error('Reset error', err && err.stack ? err.stack : err);
    return res.status(500).json({ error: 'Reset failed', details: err && err.message ? err.message : String(err) });
  }
});

// Seed demo data only
app.post('/init/demo', async (req, res) => {
  try {
    await seedDemo();
    return res.json({ ok: true });
  } catch (err) {
    console.error('Demo seed error', err && err.stack ? err.stack : err);
    return res.status(500).json({ error: 'Demo seed failed', details: err && err.message ? err.message : String(err) });
  }
});

// Create an admin user (used by init UI). Accepts JSON { username, password }.
app.post('/init/create-admin', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'username and password required' });
    const bcryptHash = bcrypt.hashSync(password, 10);
    const id = Date.now();
    try {
      await pool.query('INSERT INTO users (id, username, email, password_hash, role, `rank`, status, permissions) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [id, username, null, bcryptHash, 'admin', '', 'Active', JSON.stringify({})]);
      return res.json({ ok: true, id });
    } catch (e) {
      if (e && e.code === 'ER_DUP_ENTRY') {
        // If a placeholder admin was created by ensureInitialized() with
        // password_hash='admin-disabled', convert that placeholder into a
        // usable admin by updating the password. This lets a single-button
        // "Create default admin" action work even when the placeholder
        // user exists.
        try {
          const [rows] = await pool.query('SELECT id, password_hash FROM users WHERE username = ? LIMIT 1', [username]);
          if (Array.isArray(rows) && rows[0]) {
            const existing = rows[0];
            if (existing.password_hash === 'admin-disabled') {
              await pool.query('UPDATE users SET password_hash = ?, role = ?, status = ? WHERE id = ?', [bcryptHash, 'admin', 'Active', existing.id]);
              return res.json({ ok: true, id: existing.id, updated: true });
            }
          }
        } catch (inner) {
          console.error('Error upgrading placeholder admin', inner && inner.stack ? inner.stack : inner);
        }
        return res.status(409).json({ error: 'user_exists' });
      }
      console.error('Create admin error', e && e.stack ? e.stack : e);
      return res.status(500).json({ error: 'Could not create admin' });
    }
  } catch (err) {
    console.error('Create-admin endpoint error', err && err.stack ? err.stack : err);
    return res.status(500).json({ error: 'Internal error' });
  }
});

// Import full DB payload (JSON) either via file upload (multipart/form-data) or JSON body
app.post('/init/import', upload.single('file'), async (req, res) => {
  try {
    let payload = null;
    if (req.file && req.file.path) {
      const content = fs.readFileSync(req.file.path, 'utf8');
      payload = JSON.parse(content);
    } else if (req.body && req.body.data) {
      payload = typeof req.body.data === 'string' ? JSON.parse(req.body.data) : req.body.data;
    } else if (req.body) {
      payload = req.body;
    }
    if (!payload) return res.status(400).json({ error: 'No import data provided' });
    await _writeData(payload);
    return res.json({ ok: true });
  } catch (err) {
    console.error('Import error', err && err.stack ? err.stack : err);
    return res.status(500).json({ error: 'Import failed', details: err && err.message ? err.message : String(err) });
  }
});

/** Ensure the data file and containing directory exist.
 * If the data file is missing it will be initialized with a small example dataset.
 */
// Initialize DB-backed storage
async function ensureDataFile() {
  await ensureDbInitialized();
}

/** Async helper: read and normalize stored data from DB. */
async function getData() {
  try {
    const raw = await _readData();
    return normalizeStorage(raw);
  } catch (err) {
    console.error('getData error', err && err.stack ? err.stack : err);
    throw err;
  }
}

/** Write the provided data object back to the JSON storage file. */
async function persistData(data) {
  try {
    await _writeData(data);
  } catch (err) {
    console.error('persistData error', err && err.stack ? err.stack : err);
    throw err;
  }
}

/** Middleware: verify JWT token from `Authorization` header and attach `req.user`. */
function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Missing token' });
  try {
    const decoded = jwt.verify(token, SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Login expired, please log in again', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ error: 'Invalid login session, please log in again', code: 'TOKEN_INVALID' });
  }
}

/** Middleware: ensure the current user is an admin. */
function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  next();
}

function findTemplate(data, id) {
  return data.templates.find((template) => template.id === Number(id));
}

function findSlot(template, slotId) {
  for (const section of template.sections) {
    const slot = section.slots.find((s) => s.id === Number(slotId));
    if (slot) return slot;
  }
  return null;
}

function findOp(data, id) {
  return (data.ops || []).find((op) => op.id === Number(id));
}

function findOpSlot(op, slotId) {
  for (const section of op.sections || []) {
    const slot = (section.slots || []).find((item) => item.id === Number(slotId));
    if (slot) return slot;
  }
  return null;
}

// Helper: build operation sections by copying template section/slot structure

/**
 * Create a copy of the template sections suitable for an operation instance.
 * Existing section data (like assignedUserId) can be preserved when provided.
 */
function buildOpSectionsFromTemplate(template, existingSections = []) {
  // Create a fully independent copy of template sections/slots for an operation.
  // New ids are generated for op sections and slots; we record the original
  // template ids on `originalSectionId` / `originalSlotId` so the client can
  // map template flow edges to the operation copy if desired.
  return (template.sections || []).map((section, index) => {
    // Try to find an existing op section that corresponds to this template section
    // by matching `originalSectionId` if present (preserve previous op-specific ids/assignments).
    const existingSection = existingSections.find((item) => item.originalSectionId === section.id) || null;

    const opSectionId = existingSection ? existingSection.id : (Date.now() + Math.floor(Math.random() * 1000) + index);

    return {
      id: opSectionId,
      originalSectionId: section.id,
      title: section.title,
      lrChannel: section.lrChannel ?? existingSection?.lrChannel ?? 1,
      srChannel: section.srChannel ?? existingSection?.srChannel ?? (index + 1),
      marker: section.marker ?? existingSection?.marker ?? null,
      markerIconUrl: section.markerIconUrl ?? existingSection?.markerIconUrl ?? null,
      slots: (section.slots || []).map((slot, sIndex) => {
        const existingSlot = existingSection?.slots?.find((item) => item.originalSlotId === slot.id) || null;
        const opSlotId = existingSlot ? existingSlot.id : (Date.now() + Math.floor(Math.random() * 1000) + index * 100 + sIndex);

        return {
          id: opSlotId,
          originalSlotId: slot.id,
          name: slot.name,
          role: slot.role,
          allowedRoles: Array.isArray(slot.allowedRoles) ? slot.allowedRoles : [],
          notes: slot.notes || '',
          assignedUserId: existingSlot?.assignedUserId ?? null
        };
      })
    };
  });
}

/**
 * Ensure stored data shape is consistent and fill missing defaults.
 * Normalizes users, templates, ops and recurrences to expected shapes.
 */
function normalizeStorage(data) {
  data.users = (data.users || []).map((user) => ({
    ...user,
    permissions: user.permissions || {}
  }));

  data.templates = (data.templates || []).map((template) => ({
    ...template,
    sections: (template.sections || []).map((section, index) => ({
      ...section,
      marker: section.marker ?? null,
      markerIconUrl: section.markerIconUrl ?? null,
      lrChannel: section.lrChannel ?? 1,
      srChannel: section.srChannel ?? (index + 1),
      slots: (section.slots || []).map((slot) => ({
        ...slot,
        allowedRoles: Array.isArray(slot.allowedRoles) ? slot.allowedRoles : [],
        notes: slot.notes || '',
        assignedUserId: slot.assignedUserId ?? null
      }))
    }))
  }));

  data.ops = (data.ops || []).map((op) => ({
    ...op,
    serverName: op.serverName || '',
    modlist: op.modlist || '',
    modlistPlayer: op.modlistPlayer || '',
    modlistServer: op.modlistServer || '',
    tsAddress: op.tsAddress || '',
      sections: (op.sections || []).map((section, index) => ({
      ...section,
      marker: section.marker ?? null,
      markerIconUrl: section.markerIconUrl ?? null,
      lrChannel: section.lrChannel ?? 1,
      srChannel: section.srChannel ?? (index + 1)
    }))
  }));
  data.recurrences = data.recurrences || [];
  data.campaigns = (data.campaigns || []).map((c) => ({
    id: c.id,
    name: c.name || '',
    image: c.image || '',
    modlistPlayer: c.modlistPlayer || '',
    modlistServer: c.modlistServer || '',
    defaultTemplateId: c.defaultTemplateId ?? null,
    missionmakerUserId: c.missionmakerUserId ?? null
  }));
  // Do not seed ranks here; `lib/dataStore.js` is responsible for DB seeding.
  data.ranks = data.ranks || [];
  data.customRoles = data.customRoles || [];
  return data;
}

function normalizeDays(days) {
  if (!Array.isArray(days)) return [];
  return [...new Set(days.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))].sort((a, b) => a - b);
}

// Advance a base ISO datetime by the given recurrence interval.
function addInterval(dateTime, recurrence) {
  const date = new Date(dateTime);
  if (recurrence === 'daily') {
    date.setDate(date.getDate() + 1);
  } else if (recurrence === 'weekly') {
    date.setDate(date.getDate() + 7);
  } else if (recurrence === 'monthly') {
    date.setMonth(date.getMonth() + 1);
  }
  return date.toISOString();
}

// Compute the next occurrence for weekly/biweekly recurrences based on selected weekdays.
function getNextWeeklyDate(dateTime, recurrence) {
  const current = new Date(dateTime);
  const selectedDays = normalizeDays(recurrence.weeklyDays);
  const currentWeekday = current.getDay();
  const laterDay = selectedDays.find((day) => day > currentWeekday);
  if (laterDay !== undefined) {
    const next = new Date(current);
    next.setDate(next.getDate() + (laterDay - currentWeekday));
    return next.toISOString();
  }
  const weeks = recurrence.recurrence === 'biweekly' ? 2 : 1;
  const next = new Date(current);
  next.setDate(next.getDate() + weeks * 7);
  if (selectedDays.length === 0) return next.toISOString();
  const firstDay = selectedDays[0];
  const offset = (firstDay - next.getDay() + 7) % 7;
  next.setDate(next.getDate() + offset);
  return next.toISOString();
}

// Compute the next occurrence for monthly recurrences, adjusting for month lengths.
function getNextMonthlyDate(dateTime, recurrence) {
  const current = new Date(dateTime);
  const monthlyDay = Number(recurrence.monthlyDay);
  if (!monthlyDay || monthlyDay < 1 || monthlyDay > 31) {
    const next = new Date(current);
    next.setMonth(next.getMonth() + 1);
    return next.toISOString();
  }

  const next = new Date(current);
  next.setDate(monthlyDay);
  if (next <= current) {
    next.setMonth(next.getMonth() + 1);
    const daysInMonth = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
    next.setDate(Math.min(monthlyDay, daysInMonth));
  }
  return next.toISOString();
}

// Delegates to the correct recurrence computation based on recurrence type.
function getNextRecurrenceDate(dateTime, recurrence) {
  if (recurrence.recurrence === 'daily') return addInterval(dateTime, 'daily');
  if (recurrence.recurrence === 'weekly' || recurrence.recurrence === 'biweekly') return getNextWeeklyDate(dateTime, recurrence);
  if (recurrence.recurrence === 'monthly') return getNextMonthlyDate(dateTime, recurrence);
  return null;
}

// Generate any operations that are due according to recurrence entries.
// This is called on data load to materialize scheduled occurrences up to now.
async function generateRecurringOps(data) {
  normalizeStorage(data);
  const now = new Date();
  let changed = false;
  for (const recurrence of data.recurrences) {
    while (recurrence.nextDateTime && new Date(recurrence.nextDateTime) <= now) {
      const nextDate = new Date(recurrence.nextDateTime);
      if (recurrence.repeatUntil && new Date(recurrence.repeatUntil) < nextDate) {
        recurrence.nextDateTime = null;
        changed = true;
        break;
      }
      const op = {
        id: Date.now() + Math.floor(Math.random() * 1000),
        name: recurrence.name,
        templateId: recurrence.templateId,
        date: nextDate.toISOString().slice(0, 10),
        time: nextDate.toISOString().slice(11, 16),
        createdAt: new Date().toISOString(),
        recurrenceId: recurrence.id,
        sections: recurrence.sections.map((section) => ({
          id: section.id,
          title: section.title,
          slots: section.slots.map((slot) => ({ ...slot }))
        }))
      };
      data.ops.push(op);
      changed = true;
      const next = getNextRecurrenceDate(recurrence.nextDateTime, recurrence);
      recurrence.nextDateTime = next;
      if (!recurrence.nextDateTime) break;
      if (recurrence.repeatUntil && new Date(recurrence.repeatUntil) < new Date(recurrence.nextDateTime)) {
        recurrence.nextDateTime = null;
        break;
      }
    }
  }
  if (changed) await persistData(data);
}

import * as usersRepo from './repositories/users.js';

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await usersRepo.getUserByUsername(username);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const ok = bcrypt.compareSync(password, user.password_hash || user.password || '');
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, SECRET, { expiresIn: '8h' });
    res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
  } catch (err) {
    console.error('Login error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/signup', async (req, res) => {
  const username = (req.body.username || '').trim();
  if (!username) return res.status(400).json({ error: 'Username required' });
  try {
    const existing = await usersRepo.getUserByUsername(username);
    if (existing) return res.status(409).json({ error: 'User already exists' });
    const role = 'member';
    const hashed = bcrypt.hashSync(req.body.password || 'changeme', 10);
    const created = await usersRepo.createUser({ id: Date.now(), username, password_hash: hashed, role, rank: req.body.rank || '', status: req.body.status || 'Active', permissions: {}, email: req.body.email || null });
    // create profile if provided
    if (req.body.profile) {
      await db.query('INSERT INTO user_profiles (user_id, display_name, bio, avatar_url, settings) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE display_name=VALUES(display_name), bio=VALUES(bio), avatar_url=VALUES(avatar_url), settings=VALUES(settings)', [created.id, req.body.profile.displayName || null, req.body.profile.bio || null, req.body.profile.avatarUrl || null, JSON.stringify(req.body.profile.settings || {})]);
    }
    const token = jwt.sign({ id: created.id, username: created.username, role: role }, SECRET, { expiresIn: '8h' });
    const userSafe = { id: created.id, username: created.username, role };
    res.json({ token, user: userSafe });
  } catch (err) {
    console.error('Signup error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/public-data', async (req, res) => {
  const data = await getData();
  await generateRecurringOps(data);
  const safeUsers = data.users.map(({ password, ...rest }) => rest);
  res.json({ users: safeUsers, templates: data.templates, ops: data.ops || [], campaigns: data.campaigns || [], customRoles: data.customRoles || [] });
});

app.get('/api/data', authMiddleware, async (req, res) => {
  const data = await getData();
  await generateRecurringOps(data);
  const safeUsers = data.users.map(({ password, ...rest }) => rest);
  res.json({ user: { id: req.user.id, username: req.user.username, role: req.user.role }, users: safeUsers, templates: data.templates, ops: data.ops || [], recurrences: data.recurrences || [], campaigns: data.campaigns || [], customRoles: data.customRoles || [] });
});

app.post('/api/users', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const hashed = bcrypt.hashSync(req.body.password || 'changeme', 10);
    const created = await usersRepo.createUser({ id: Date.now(), username: req.body.username, email: req.body.email || null, password_hash: hashed, role: req.body.role || 'member', rank: req.body.rank || '', status: req.body.status || 'Active', permissions: req.body.permissions || {} });
    const user = await usersRepo.getUserById(created.id);
    const { password_hash, ...safeUser } = user;
    res.json({ user: safeUser });
  } catch (err) {
    console.error('Create user error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/users/:id/permissions', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const patch = {};
    if (req.body.permissions !== undefined) patch.permissions = req.body.permissions;
    if (req.body.rank !== undefined) patch.rank = req.body.rank;
    if (req.body.status !== undefined) patch.status = req.body.status;
    if (req.body.role !== undefined) patch.role = req.body.role;
    const updated = await usersRepo.updateUser(id, patch);
    const { password_hash, ...safeUser } = updated;
    res.json({ user: safeUser });
  } catch (err) {
    console.error('Update permissions error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/users/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const user = await usersRepo.getUserById(id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    await usersRepo.deleteUser(id);
    res.status(204).end();
  } catch (err) {
    console.error('Delete user error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/users/me/password', authMiddleware, async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new password are required' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }

  try {
    const user = await usersRepo.getUserById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const ok = bcrypt.compareSync(currentPassword, user.password_hash || user.password || '');
    if (!ok) return res.status(401).json({ error: 'Current password is incorrect' });
    const hashed = bcrypt.hashSync(newPassword, 10);
    await usersRepo.updatePassword(req.user.id, hashed);
    res.json({ ok: true });
  } catch (err) {
    console.error('Password change error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/templates', authMiddleware, requireAdmin, (req, res) => {
  (async () => {
    try {
      const t = await (await import('./repositories/templates.js')).createTemplate({ id: Date.now(), name: req.body.name, ownerId: req.user?.id || null, data: { sections: [] } });
      res.json({ template: t });
    } catch (err) {
      console.error('Create template error', err);
      res.status(500).json({ error: 'Server error' });
    }
  })();
});

app.put('/api/templates/:id', authMiddleware, requireAdmin, (req, res) => {
  (async () => {
    try {
      const id = Number(req.params.id);
      const updated = await (await import('./repositories/templates.js')).updateTemplate(id, { name: typeof req.body.name === 'string' ? req.body.name : undefined });
      if (!updated) return res.status(404).json({ error: 'Template not found' });
      res.json({ template: updated });
    } catch (err) {
      console.error('Update template error', err);
      res.status(500).json({ error: 'Server error' });
    }
  })();
});

app.post('/api/templates/:id/duplicate', authMiddleware, requireAdmin, (req, res) => {
  (async () => {
    try {
      const tplRepo = await import('./repositories/templates.js');
      const source = await tplRepo.getTemplateById(Number(req.params.id));
      if (!source) return res.status(404).json({ error: 'Template not found' });
      const nextId = () => Date.now() + Math.floor(Math.random() * 10000);
      const newTemplateData = {
        sections: (source.data.sections || []).map((section) => ({
          id: nextId(),
          title: section.title,
          lrChannel: section.lrChannel || 1,
          srChannel: section.srChannel || 1,
          marker: section.marker || null,
          markerIconUrl: section.markerIconUrl || null,
          slots: (section.slots || []).map((slot) => ({
            id: nextId(),
            name: slot.name,
            role: slot.role,
            allowedRoles: Array.isArray(slot.allowedRoles) ? slot.allowedRoles : [],
            notes: slot.notes || '',
            assignedUserId: null
          }))
        }))
      };
      const name = typeof req.body.name === 'string' && req.body.name.trim() ? req.body.name.trim() : `Copy of ${source.name}`;
      const created = await tplRepo.createTemplate({ id: nextId(), name, ownerId: req.user?.id || null, data: newTemplateData });
      res.json({ template: created });
    } catch (err) {
      console.error('Duplicate template error', err);
      res.status(500).json({ error: 'Server error' });
    }
  })();
});

// Campaigns API
app.get('/api/campaigns', async (req, res) => {
  const data = await getData();
  res.json({ campaigns: data.campaigns || [] });
});

app.post('/api/campaigns', authMiddleware, async (req, res) => {
  const data = await getData();
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Name required' });
  const missionmakerUserId = Number(req.body.missionmakerUserId) || null;
  if (!missionmakerUserId) return res.status(400).json({ error: 'missionmakerUserId required' });

  const campaign = {
    id: Date.now(),
    name,
    image: req.body.image || '',
    modlistPlayer: req.body.modlistPlayer || '',
    modlistServer: req.body.modlistServer || '',
    defaultTemplateId: req.body.defaultTemplateId ? Number(req.body.defaultTemplateId) : null,
    missionmakerUserId
  };
  data.campaigns = data.campaigns || [];
  data.campaigns.push(campaign);
  await persistData(data);
  res.json({ campaign });
});

app.put('/api/campaigns/:id', authMiddleware, async (req, res) => {
  const data = await getData();
  const campaign = (data.campaigns || []).find((c) => c.id === Number(req.params.id));
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

  // allow admin or the assigned missionmaker to update
  if (!(req.user?.role === 'admin' || req.user?.id === campaign.missionmakerUserId)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  if (typeof req.body.name === 'string') campaign.name = req.body.name.trim();
  if ('image' in req.body) campaign.image = req.body.image || '';
  if ('modlistPlayer' in req.body) campaign.modlistPlayer = req.body.modlistPlayer || '';
  if ('modlistServer' in req.body) campaign.modlistServer = req.body.modlistServer || '';
  if ('defaultTemplateId' in req.body) campaign.defaultTemplateId = req.body.defaultTemplateId ? Number(req.body.defaultTemplateId) : null;
  if ('missionmakerUserId' in req.body) campaign.missionmakerUserId = req.body.missionmakerUserId ? Number(req.body.missionmakerUserId) : null;

  await persistData(data);
  res.json({ campaign });
});

app.delete('/api/campaigns/:id', authMiddleware, requireAdmin, async (req, res) => {
  const data = await getData();
  const idx = (data.campaigns || []).findIndex((c) => c.id === Number(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Campaign not found' });
  data.campaigns.splice(idx, 1);
  await persistData(data);
  res.status(204).end();
});

app.post('/api/ops', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const tplRepo = await import('./repositories/templates.js');
    const opsRepo = await import('./repositories/ops.js');
    const tplId = (req.body.templateId === null || req.body.templateId === undefined || req.body.templateId === '') ? null : Number(req.body.templateId);
    let sections = [];
    if (tplId) {
      const template = await tplRepo.getTemplateById(tplId);
      if (!template) return res.status(404).json({ error: 'Template not found' });
      sections = buildOpSectionsFromTemplate({ sections: template.data.sections || [] });
    } else {
      // No template selected: create an op with empty sections instead of throwing
      sections = [];
    }
    const recurrence = req.body.recurrence || 'none';
    const payload = {
      id: Date.now(),
      name: req.body.name || 'New operation',
      templateId: Number(req.body.templateId),
      date: req.body.date || '',
      time: req.body.time || '',
      serverName: req.body.serverName || '',
      modlist: req.body.modlist || '',
      modlistPlayer: req.body.modlistPlayer || '',
      modlistServer: req.body.modlistServer || '',
      tsAddress: req.body.tsAddress || '',
      createdAt: new Date().toISOString(),
      sections
    };

    if (recurrence === 'none') {
      const created = await opsRepo.createOp({ id: Date.now(), templateId: Number(req.body.templateId), title: payload.name, payload });
      res.json({ op: created, recurrence: null });
    } else {
      // store recurrence as separate record
      const conn = await import('./db.js');
      const pool = conn.default;
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [rResult] = await connection.query('INSERT INTO recurrences (id, op_id, rule, next_run) VALUES (?, ?, ?, ?)', [Date.now() + 1, null, JSON.stringify({ recurrence }), `${req.body.date}T${req.body.time || '00:00'}:00`]);
        await connection.commit();
        res.json({ op: null, recurrence: { id: rResult.insertId, recurrence } });
      } catch (err) {
        await connection.rollback();
        throw err;
      } finally {
        connection.release();
      }
    }
  } catch (err) {
    console.error('Create op error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/ops/:id/load-template', authMiddleware, async (req, res) => {
  try {
    const isAdminUser = req.user?.role === 'admin';
    const isMissionmaker = req.user?.role === 'missionmaker';
    if (!isAdminUser && !isMissionmaker) return res.status(403).json({ error: 'Forbidden' });
    const data = await getData();
    const op = findOp(data, req.params.id);
    if (!op) return res.status(404).json({ error: 'Operation not found' });
    const templateId = req.body.templateId ? Number(req.body.templateId) : op.templateId;
    if (!templateId) return res.status(400).json({ error: 'No templateId provided' });
    const template = data.templates.find((t) => t.id === templateId);
    if (!template) return res.status(404).json({ error: 'Template not found' });
    const existingSections = op.sections || [];
    op.sections = buildOpSectionsFromTemplate({ sections: template.sections || [] }, existingSections);
    op.templateId = templateId;
    await persistData(data);
    res.json({ op });
  } catch (err) {
    console.error('Load template into op error', err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

app.post('/api/ops/:id/join', authMiddleware, async (req, res) => {
  try {
    console.log('[server] POST /api/ops/:id/join', { opId: req.params.id, slotId: req.body.slotId, user: req.user?.id });
    const opsRepo = await import('./repositories/ops.js');
    const op = await opsRepo.getOpById(Number(req.params.id));
    if (!op) return res.status(404).json({ error: 'Operation not found' });
    const slot = op.payload.sections.flatMap((s) => s.slots).find((sl) => sl.id === Number(req.body.slotId));
    if (!slot) return res.status(404).json({ error: 'Slot not found' });
    if (!slot.allowedRoles.includes(req.user.role) && req.user.role !== 'admin') return res.status(403).json({ error: 'No permission for this slot' });
    const existingSlot = op.payload.sections.flatMap((s) => s.slots).find((other) => other.assignedUserId === req.user.id);
    if (existingSlot && existingSlot.id !== slot.id) return res.status(409).json({ error: 'You are already signed up to another slot for this operation' });
    if (slot.assignedUserId && slot.assignedUserId !== req.user.id) return res.status(409).json({ error: 'This slot is already taken' });
    await opsRepo.joinSlot(Number(req.params.id), Number(req.body.slotId), req.user.id);
    // Return the op in the same normalized shape as /api/public-data (sections at top-level)
    const dataAfter = await getData();
    const opAfter = findOp(dataAfter, Number(req.params.id));
    console.log('[server] join result', { opId: opAfter?.id });
    res.json({ op: opAfter });
  } catch (err) {
    console.error('Join slot error', err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

app.post('/api/ops/:id/signoff', authMiddleware, async (req, res) => {
  try {
    console.log('[server] POST /api/ops/:id/signoff', { opId: req.params.id, slotId: req.body.slotId, user: req.user?.id });
    const opsRepo = await import('./repositories/ops.js');
    await opsRepo.signoffSlot(Number(req.params.id), Number(req.body.slotId), req.user.id);
    // Return normalized op shape so client UI receives `sections` at top-level
    const dataAfter = await getData();
    const opAfter = findOp(dataAfter, Number(req.params.id));
    console.log('[server] signoff result', { opId: opAfter?.id });
    res.json({ op: opAfter });
  } catch (err) {
    console.error('Signoff slot error', err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

app.put('/api/ops/:opId/sections/:sectionId', authMiddleware, async (req, res) => {
  try {
    const isAdminUser = req.user?.role === 'admin';
    const isMissionmaker = req.user?.role === 'missionmaker';
    if (!isAdminUser && !isMissionmaker) return res.status(403).json({ error: 'Forbidden' });
    const opsRepo = await import('./repositories/ops.js');
    const patch = {};
    if ('lrChannel' in req.body) { if (!isValidChannel(req.body.lrChannel)) return res.status(400).json({ error: 'lrChannel must be between 0 and 99' }); patch.lrChannel = Number(req.body.lrChannel); }
    if ('srChannel' in req.body) { if (!isValidChannel(req.body.srChannel)) return res.status(400).json({ error: 'srChannel must be between 0 and 99' }); patch.srChannel = Number(req.body.srChannel); }
    if ('marker' in req.body) { patch.marker = req.body.marker === null ? null : (typeof req.body.marker === 'string' ? req.body.marker.trim() : undefined); }
    if ('markerIconUrl' in req.body) { patch.markerIconUrl = req.body.markerIconUrl === null ? null : (typeof req.body.markerIconUrl === 'string' ? req.body.markerIconUrl.trim() : undefined); }
    const updated = await opsRepo.updateSection(Number(req.params.opId), Number(req.params.sectionId), patch);
    res.json({ op: updated });
  } catch (err) {
    console.error('Update op section error', err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

app.put('/api/ops/:opId/slots/:slotId', authMiddleware, async (req, res) => {
  try {
    const isAdminUser = req.user?.role === 'admin';
    const isMissionmaker = req.user?.role === 'missionmaker';
    if (!isAdminUser && !isMissionmaker) return res.status(403).json({ error: 'Forbidden' });
    const opsRepo = await import('./repositories/ops.js');
    const patch = {};
    if (typeof req.body.name === 'string') patch.name = req.body.name;
    if (typeof req.body.role === 'string') patch.role = req.body.role;
    if (typeof req.body.notes === 'string') patch.notes = req.body.notes;
    if (Array.isArray(req.body.allowedRoles)) patch.allowedRoles = req.body.allowedRoles;
    const updated = await opsRepo.updateSlot(Number(req.params.opId), Number(req.params.slotId), patch);
    res.json({ op: updated });
  } catch (err) {
    console.error('Update slot error', err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

app.put('/api/ops/:id', authMiddleware, async (req, res) => {
  try {
    const isAdminUser = req.user?.role === 'admin';
    const isMissionmaker = req.user?.role === 'missionmaker';
    if (!isAdminUser && !isMissionmaker) return res.status(403).json({ error: 'Forbidden' });
    const opsRepo = await import('./repositories/ops.js');
    const existing = await opsRepo.getOpById(Number(req.params.id));
    if (!existing) return res.status(404).json({ error: 'Operation not found' });
    const patch = {};
    if (typeof req.body.name === 'string') patch.title = req.body.name;
    const payloadFields = ['date', 'time', 'serverName', 'modlist', 'modlistPlayer', 'modlistServer', 'tsAddress'];
    const hasPayloadChange = payloadFields.some((f) => typeof req.body[f] === 'string');
    if (hasPayloadChange) {
      // Merge into existing payload to avoid destroying stored fields (name, sections, etc.)
      patch.payload = { ...(existing.payload || {}) };
      if (typeof req.body.date === 'string') patch.payload.date = req.body.date;
      if (typeof req.body.time === 'string') patch.payload.time = req.body.time;
      if (typeof req.body.serverName === 'string') patch.payload.serverName = req.body.serverName;
      if (typeof req.body.modlist === 'string') patch.payload.modlist = req.body.modlist;
      if (typeof req.body.modlistPlayer === 'string') patch.payload.modlistPlayer = req.body.modlistPlayer;
      if (typeof req.body.modlistServer === 'string') patch.payload.modlistServer = req.body.modlistServer;
      if (typeof req.body.tsAddress === 'string') patch.payload.tsAddress = req.body.tsAddress;
    }
    const updated = await opsRepo.updateOp(Number(req.params.id), patch);
    res.json({ op: updated });
  } catch (err) {
    console.error('Update op error', err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

app.delete('/api/ops/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const opsRepo = await import('./repositories/ops.js');
    const op = await opsRepo.getOpById(Number(req.params.id));
    if (!op) return res.status(404).json({ error: 'Operation not found' });
    await opsRepo.deleteOp(Number(req.params.id));
    res.status(204).end();
  } catch (err) {
    console.error('Delete op error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/roles/rename', authMiddleware, requireAdmin, async (req, res) => {
  const { oldName, newName } = req.body;
  if (!oldName || !newName || oldName === newName) return res.status(400).json({ error: 'oldName and newName required' });

  const data = await getData();

  const renameInSlots = (slots) => {
    (slots || []).forEach((slot) => {
      if (slot.role === oldName) slot.role = newName;
      if (Array.isArray(slot.allowedRoles)) {
        slot.allowedRoles = slot.allowedRoles.map((r) => (r === oldName ? newName : r));
      }
    });
  };

  const renameInSections = (sections) => {
    (sections || []).forEach((section) => renameInSlots(section.slots));
  };

  data.templates.forEach((t) => renameInSections(t.sections));
  (data.ops || []).forEach((op) => renameInSections(op.sections));
  (data.recurrences || []).forEach((rec) => renameInSections(rec.sections));

  data.users.forEach((user) => {
    if (user.permissions && user.permissions[oldName] !== undefined) {
      user.permissions[newName] = user.permissions[oldName];
      delete user.permissions[oldName];
    }
  });

  (data.customRoles || []).forEach((role) => {
    if (role.name === oldName) role.name = newName;
  });

  await persistData(data);

  try {
    const rolesRepo = await import('./repositories/roles.js');
    const existing = await rolesRepo.findByName(oldName);
    if (existing) {
      await rolesRepo.updateRole(existing.id, { name: newName });
    }
  } catch (err) {
    console.error('Roles table rename sync error', err);
  }
  res.json({ ok: true });
});

// Admin: clear the configured database by running the clear-db script on the server
app.post('/api/admin/clear-db', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { execFile } = await import('child_process');
    const script = path.join(process.cwd(), 'scripts', 'clear-db.js');
    execFile(process.execPath, [script, '--force'], { cwd: process.cwd(), env: process.env, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        console.error('Clear DB script failed', err, stdout, stderr);
        return res.status(500).json({ error: 'Clear DB failed', details: stderr || (err && err.message) || String(err) });
      }
      res.json({ ok: true, out: stdout || '' });
    });
  } catch (err) {
    console.error('Clear DB spawn error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Streamed variant: run clear-db and stream stdout/stderr to the HTTP response body
app.post('/api/admin/clear-db-stream', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { spawn } = await import('child_process');
    const script = path.join(process.cwd(), 'scripts', 'clear-db.js');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    // Keep connection open while process runs
    const child = spawn(process.execPath, [script, '--force'], { cwd: process.cwd(), env: process.env });

    child.stdout.on('data', (chunk) => {
      try { res.write(String(chunk)); } catch (e) { /* ignore */ }
    });
    child.stderr.on('data', (chunk) => {
      try { res.write(String(chunk)); } catch (e) { /* ignore */ }
    });
    child.on('close', (code) => {
      try {
        res.write(`\nProcess exited with code ${code}\n`);
      } catch (e) {}
      try { res.end(); } catch (e) {}
    });
    child.on('error', (err) => {
      try { res.write(`\nProcess spawn error: ${err && err.message ? err.message : String(err)}\n`); } catch (e) {}
      try { res.end(); } catch (e) {}
    });
  } catch (err) {
    console.error('Clear DB stream spawn error', err);
    res.status(500).send('Server error');
  }
});

// Custom roles API: roles that exist independently of any template slot yet
app.get('/api/roles', async (req, res) => {
  try {
    const rolesRepo = await import('./repositories/roles.js');
    const roles = await rolesRepo.listRoles();
    res.json({ roles: roles || [] });
  } catch (err) {
    console.error('List roles error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/roles', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const rolesRepo = await import('./repositories/roles.js');
    const name = (req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Name required' });
    const exists = await rolesRepo.findByName(name);
    if (exists) return res.status(409).json({ error: 'Role already exists' });
    const role = await rolesRepo.createRole({ name });
    res.json({ role });
  } catch (err) {
    console.error('Create role error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/roles/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const rolesRepo = await import('./repositories/roles.js');
    const role = await rolesRepo.getRoleById(Number(req.params.id));
    if (!role) return res.status(404).json({ error: 'Role not found' });
    await rolesRepo.deleteRole(Number(req.params.id));
    res.status(204).end();
  } catch (err) {
    console.error('Delete role error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Ranks API: simple CRUD for rank management
app.get('/api/ranks', async (req, res) => {
  const data = await getData();
  const ranks = (data.ranks || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
  res.json({ ranks });
});

app.post('/api/ranks', authMiddleware, requireAdmin, async (req, res) => {
  const data = await getData();
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Name required' });
  const rank = {
    id: Date.now(),
    name,
    short: (req.body.short || '').trim(),
    icon: typeof req.body.icon === 'string' ? req.body.icon : null,
    order: Number(req.body.order) || ((data.ranks || []).length + 1)
  };
  data.ranks = data.ranks || [];
  data.ranks.push(rank);
  await persistData(data);
  res.json({ rank });
});

app.put('/api/ranks/:id', authMiddleware, requireAdmin, async (req, res) => {
  const data = await getData();
  const rank = (data.ranks || []).find((r) => r.id === Number(req.params.id));
  if (!rank) return res.status(404).json({ error: 'Rank not found' });
  if (typeof req.body.name === 'string') rank.name = req.body.name.trim();
  if (typeof req.body.short === 'string') rank.short = req.body.short.trim();
  if ('icon' in req.body) rank.icon = req.body.icon || null;
  if ('order' in req.body) rank.order = Number(req.body.order) || rank.order;
  await persistData(data);
  res.json({ rank });
});

app.delete('/api/ranks/:id', authMiddleware, requireAdmin, async (req, res) => {
  const data = await getData();
  const idx = (data.ranks || []).findIndex((r) => r.id === Number(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Rank not found' });
  const removed = data.ranks.splice(idx, 1)[0];
  // Clean up user references (if users stored rank by id or by name)
  data.users.forEach((u) => {
    if (u.rank === removed.id || u.rank === removed.name) u.rank = '';
  });
  await persistData(data);
  res.status(204).end();
});

// Squad types API: CRUD stored in DB (exposed to admins for edit)
app.get('/api/squad-types', async (req, res) => {
  const data = await getData();
  const squadTypes = Array.isArray(data.squadTypes) ? data.squadTypes : [];
  res.json({ squadTypes });
});

app.post('/api/squad-types', authMiddleware, requireAdmin, async (req, res) => {
  const data = await getData();
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Name required' });
  const st = { id: Date.now(), name, icon: typeof req.body.icon === 'string' ? req.body.icon : null };
  data.squadTypes = data.squadTypes || [];
  data.squadTypes.push(st);
  await persistData(data);
  res.json({ squadType: st });
});

app.put('/api/squad-types/:id', authMiddleware, requireAdmin, async (req, res) => {
  const data = await getData();
  const st = (data.squadTypes || []).find((s) => s.id === Number(req.params.id));
  if (!st) return res.status(404).json({ error: 'Squad type not found' });
  if (typeof req.body.name === 'string') st.name = req.body.name.trim();
  if ('icon' in req.body) st.icon = req.body.icon || null;
  await persistData(data);
  res.json({ squadType: st });
});

app.delete('/api/squad-types/:id', authMiddleware, requireAdmin, async (req, res) => {
  const data = await getData();
  const idx = (data.squadTypes || []).findIndex((s) => s.id === Number(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Squad type not found' });
  data.squadTypes.splice(idx, 1);
  await persistData(data);
  res.status(204).end();
});

app.delete('/api/recurrences/:id', authMiddleware, requireAdmin, async (req, res) => {
  const data = await getData();
  const recurrenceIndex = (data.recurrences || []).findIndex((recurrence) => recurrence.id === Number(req.params.id));
  if (recurrenceIndex === -1) return res.status(404).json({ error: 'Recurrence not found' });
  data.recurrences.splice(recurrenceIndex, 1);
  await persistData(data);
  res.status(204).end();
});

app.put('/api/recurrences/:id', authMiddleware, requireAdmin, async (req, res) => {
  const data = await getData();
  const recurrence = (data.recurrences || []).find((entry) => entry.id === Number(req.params.id));
  if (!recurrence) return res.status(404).json({ error: 'Recurrence not found' });

  if (typeof req.body.name === 'string') recurrence.name = req.body.name;
  if (typeof req.body.recurrence === 'string') recurrence.recurrence = req.body.recurrence;
  if (typeof req.body.time === 'string') recurrence.time = req.body.time;
  if (typeof req.body.startDate === 'string') recurrence.startDate = req.body.startDate;
  if ('recurrenceEndDate' in req.body) recurrence.repeatUntil = req.body.recurrenceEndDate || null;
  if ('weeklyDays' in req.body) recurrence.weeklyDays = normalizeDays(req.body.weeklyDays);
  if ('monthlyDay' in req.body) recurrence.monthlyDay = req.body.monthlyDay || null;

  const baseDateTime = `${recurrence.startDate}T${recurrence.time || '00:00'}:00`;
  const base = new Date(baseDateTime);
  recurrence.nextDateTime = base > new Date() ? base.toISOString() : getNextRecurrenceDate(baseDateTime, recurrence);
  if (recurrence.repeatUntil && recurrence.nextDateTime && new Date(recurrence.repeatUntil) < new Date(recurrence.nextDateTime)) {
    recurrence.nextDateTime = null;
  }

  await persistData(data);
  res.json({ recurrence });
});


app.delete('/api/templates/:id', authMiddleware, requireAdmin, (req, res) => {
  (async () => {
    try {
      const tplRepo = await import('./repositories/templates.js');
      const t = await tplRepo.getTemplateById(Number(req.params.id));
      if (!t) return res.status(404).json({ error: 'Template not found' });
      await tplRepo.deleteTemplate(Number(req.params.id));
      res.status(204).end();
    } catch (err) {
      console.error('Delete template error', err);
      res.status(500).json({ error: 'Server error' });
    }
  })();
});

app.post('/api/templates/:templateId/sections', authMiddleware, requireAdmin, (req, res) => {
  (async () => {
    try {
      console.debug('POST /api/templates/:templateId/sections', { templateId: req.params.templateId, body: req.body });
      const tplRepo = await import('./repositories/templates.js');
      const template = await tplRepo.getTemplateById(Number(req.params.templateId));
      if (!template) return res.status(404).json({ error: 'Template not found' });
      const section = {
        id: Date.now(),
        title: req.body.title || 'New section',
        lrChannel: 1,
        srChannel: (template.data.sections || []).length + 1,
        marker: req.body.marker || null,
        markerIconUrl: req.body.markerIconUrl || null,
        slots: []
      };
      template.data.sections = template.data.sections || [];
      template.data.sections.push(section);
      const updated = await tplRepo.updateTemplate(template.id, { data: template.data });
      res.json({ section });
    } catch (err) {
      console.error('Add section error', err && err.stack ? err.stack : err);
      res.status(500).json({ error: err.message || 'Server error' });
    }
  })();
});

function isValidChannel(value) {
  const num = Number(value);
  return Number.isInteger(num) && num >= 0 && num <= 99;
}

app.put('/api/templates/:templateId/sections/:sectionId', authMiddleware, requireAdmin, async (req, res) => {
    try {
      const tplRepo = await import('./repositories/templates.js');
      const template = await tplRepo.getTemplateById(Number(req.params.templateId));
      if (!template) return res.status(404).json({ error: 'Template not found' });
      const section = (template.data.sections || []).find((item) => item.id === Number(req.params.sectionId));
      if (!section) return res.status(404).json({ error: 'Section not found' });
      if (typeof req.body.title === 'string' && req.body.title.trim()) section.title = req.body.title.trim();
      if ('lrChannel' in req.body) { if (!isValidChannel(req.body.lrChannel)) return res.status(400).json({ error: 'lrChannel must be between 0 and 99' }); section.lrChannel = Number(req.body.lrChannel); }
      if ('srChannel' in req.body) { if (!isValidChannel(req.body.srChannel)) return res.status(400).json({ error: 'srChannel must be between 0 and 99' }); section.srChannel = Number(req.body.srChannel); }
      if ('marker' in req.body) { if (req.body.marker === null) section.marker = null; else if (typeof req.body.marker === 'string') section.marker = req.body.marker.trim(); else return res.status(400).json({ error: 'marker must be a string or null' }); }
      if ('markerIconUrl' in req.body) { if (req.body.markerIconUrl === null) section.markerIconUrl = null; else if (typeof req.body.markerIconUrl === 'string') section.markerIconUrl = req.body.markerIconUrl.trim(); else return res.status(400).json({ error: 'markerIconUrl must be a string or null' }); }
      await tplRepo.updateTemplate(template.id, { data: template.data });
      res.json({ section });
    } catch (err) {
      console.error('Update section error', err);
      res.status(500).json({ error: 'Server error' });
    }
});

app.put('/api/ops/:opId/sections/:sectionId', authMiddleware, requireAdmin, async (req, res) => {
  const data = await getData();
  const op = findOp(data, req.params.opId);
  if (!op) return res.status(404).json({ error: 'Operation not found' });

  const section = (op.sections || []).find((item) => item.id === Number(req.params.sectionId));
  if (!section) return res.status(404).json({ error: 'Section not found' });

  if ('lrChannel' in req.body) {
    if (!isValidChannel(req.body.lrChannel)) return res.status(400).json({ error: 'lrChannel must be between 0 and 99' });
    section.lrChannel = Number(req.body.lrChannel);
  }
  if ('srChannel' in req.body) {
    if (!isValidChannel(req.body.srChannel)) return res.status(400).json({ error: 'srChannel must be between 0 and 99' });
    section.srChannel = Number(req.body.srChannel);
  }
  if ('marker' in req.body) {
    if (req.body.marker === null) section.marker = null;
    else if (typeof req.body.marker === 'string') section.marker = req.body.marker.trim();
    else return res.status(400).json({ error: 'marker must be a string or null' });
  }
  if ('markerIconUrl' in req.body) {
    if (req.body.markerIconUrl === null) section.markerIconUrl = null;
    else if (typeof req.body.markerIconUrl === 'string') section.markerIconUrl = req.body.markerIconUrl.trim();
    else return res.status(400).json({ error: 'markerIconUrl must be a string or null' });
  }

  await persistData(data);
  res.json({ op });
});

app.post('/api/ops/:opId/sections', authMiddleware, async (req, res) => {
  try {
    const isAdminUser = req.user?.role === 'admin';
    const isMissionmaker = req.user?.role === 'missionmaker';
    if (!isAdminUser && !isMissionmaker) return res.status(403).json({ error: 'Forbidden' });
    const opsRepo = await import('./repositories/ops.js');
    const op = await opsRepo.addSection(Number(req.params.opId), req.body.title || null);
    if (!op) return res.status(404).json({ error: 'Operation not found' });
    res.json({ op });
  } catch (err) {
    console.error('Add op section error', err && err.stack ? err.stack : err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

app.delete('/api/ops/:opId/sections/:sectionId', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const opsRepo = await import('./repositories/ops.js');
    const op = await opsRepo.getOpById(Number(req.params.opId));
    if (!op) return res.status(404).json({ error: 'Operation not found' });
    const sections = op.payload.sections || [];
    const idx = sections.findIndex((s) => s.id === Number(req.params.sectionId));
    if (idx === -1) return res.status(404).json({ error: 'Section not found' });
    sections.splice(idx, 1);
    op.payload.sections = sections;
    await opsRepo.updateOp(Number(req.params.opId), { payload: op.payload });
    const updated = await opsRepo.getOpById(Number(req.params.opId));
    res.json({ op: updated });
  } catch (err) {
    console.error('Delete op section error', err && err.stack ? err.stack : err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

app.delete('/api/templates/:templateId/sections/:sectionId', authMiddleware, requireAdmin, async (req, res) => {
  console.debug('DELETE /api/templates/:templateId/sections/:sectionId', { templateId: req.params.templateId, sectionId: req.params.sectionId });
  const data = await getData();
  const template = findTemplate(data, req.params.templateId);
  if (!template) return res.status(404).json({ error: 'Template not found' });

  const sectionIndex = template.sections.findIndex((item) => item.id === Number(req.params.sectionId));
  if (sectionIndex === -1) return res.status(404).json({ error: 'Section not found' });

  template.sections.splice(sectionIndex, 1);
  try {
    await persistData(data);
    res.status(204).end();
  } catch (err) {
    console.error('Delete section persist error', err && err.stack ? err.stack : err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

app.put('/api/templates/:templateId/sections/:sectionId/slots/reorder', authMiddleware, requireAdmin, async (req, res) => {
  const data = await getData();
  const template = findTemplate(data, req.params.templateId);
  if (!template) return res.status(404).json({ error: 'Template not found' });

  const section = template.sections.find((item) => item.id === Number(req.params.sectionId));
  if (!section) return res.status(404).json({ error: 'Section not found' });

  const slotIds = Array.isArray(req.body.slotIds) ? req.body.slotIds.map(Number) : null;
  if (!slotIds) return res.status(400).json({ error: 'slotIds must be an array' });

  const currentIds = section.slots.map((slot) => Number(slot.id));
  const uniqueSlotIds = new Set(slotIds);
  if (
    slotIds.length !== currentIds.length
    || uniqueSlotIds.size !== slotIds.length
    || currentIds.some((id) => !uniqueSlotIds.has(id))
  ) {
    return res.status(400).json({ error: 'slotIds do not match section slots' });
  }

  const slotMap = new Map(section.slots.map((slot) => [Number(slot.id), slot]));
  section.slots = slotIds.map((slotId) => slotMap.get(slotId));

  await persistData(data);
  res.json({ section });
});

app.post('/api/templates/:id/slots', authMiddleware, requireAdmin, async (req, res) => {
  try {
    console.debug('POST /api/templates/:id/slots', { templateId: req.params.id, body: req.body });
    const data = await getData();
    const template = findTemplate(data, req.params.id);
    if (!template) return res.status(404).json({ error: 'Template not found' });
    const section = template.sections.find((section) => section.id === Number(req.body.sectionId));
    if (!section) return res.status(404).json({ error: 'Section not found' });

    const slot = {
      id: Date.now(),
      name: req.body.name || 'New role',
      role: req.body.role || 'Rifleman',
      allowedRoles: Array.isArray(req.body.allowedRoles) ? req.body.allowedRoles : [],
      notes: req.body.notes || '',
      assignedUserId: null
    };
    section.slots.push(slot);
    await persistData(data);
    res.json({ slot });
  } catch (err) {
    console.error('Add slot error', err && err.stack ? err.stack : err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

app.put('/api/templates/:templateId/slots/:slotId', authMiddleware, requireAdmin, async (req, res) => {
  const data = await getData();
  const template = findTemplate(data, req.params.templateId);
  if (!template) return res.status(404).json({ error: 'Template not found' });
  const slot = findSlot(template, req.params.slotId);
  if (!slot) return res.status(404).json({ error: 'Slot not found' });
  if (typeof req.body.name === 'string') slot.name = req.body.name;
  if (typeof req.body.role === 'string') slot.role = req.body.role;
  if (Array.isArray(req.body.allowedRoles)) slot.allowedRoles = req.body.allowedRoles;
  if (typeof req.body.notes === 'string') slot.notes = req.body.notes;
  await persistData(data);
  res.json({ slot });
});

app.delete('/api/templates/:templateId/slots/:slotId', authMiddleware, requireAdmin, async (req, res) => {
  const data = await getData();
  const template = findTemplate(data, req.params.templateId);
  if (!template) return res.status(404).json({ error: 'Template not found' });
  let slotRemoved = false;
  template.sections.forEach((section) => {
    const index = section.slots.findIndex((slot) => slot.id === Number(req.params.slotId));
    if (index !== -1) {
      section.slots.splice(index, 1);
      slotRemoved = true;
    }
  });
  if (!slotRemoved) return res.status(404).json({ error: 'Slot not found' });
  await persistData(data);
  res.status(204).end();
});

app.post('/api/templates/:templateId/join', authMiddleware, async (req, res) => {
  const data = await getData();
  const template = findTemplate(data, req.params.templateId);
  if (!template) return res.status(404).json({ error: 'Template not found' });
  const slot = findSlot(template, req.body.slotId);
  if (!slot) return res.status(404).json({ error: 'Slot not found' });
  if (!slot.allowedRoles.includes(req.user.role) && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'No permission for this slot' });
  }
  const existingSlot = template.sections.flatMap((section) => section.slots).find((other) => other.assignedUserId === req.user.id);
  if (existingSlot && existingSlot.id !== slot.id) {
    return res.status(409).json({ error: 'You are already signed up to another slot for this template' });
  }
  if (slot.assignedUserId && slot.assignedUserId !== req.user.id) {
    return res.status(409).json({ error: 'This slot is already taken' });
  }
  slot.assignedUserId = req.user.id;
  await persistData(data);
  res.json({ slot });
});

app.post('/api/upload', authMiddleware, requireAdmin, (req, res) => {
  console.log('Upload endpoint hit: /api/upload');
  upload.single('file')(req, res, (err) => {
    console.log('Multer callback for /api/upload invoked, err=', err && err.message ? err.message : null);
    if (err) return res.status(400).json({ error: err.message || 'Upload failed' });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    (async () => {
      try {
        const filesRepo = await import('./repositories/files.js');
        const stat = await fs.promises.stat(path.join(UPLOADS_DIR, req.file.filename));
        await filesRepo.addFile({ filename: req.file.originalname, pathname: `/uploads/${req.file.filename}`, mimetype: req.file.mimetype, size: stat.size, ownerId: req.user?.id || null, metadata: {} });
        // Respond with uploaded file URL
        console.log('Upload succeeded, responding with URL for', req.file.filename);
        res.json({ url: `/uploads/${req.file.filename}`, filename: req.file.originalname });
      } catch (err) {
        console.error('Upload file error', err);
        res.status(500).json({ error: 'Server error' });
      }
    })();
  });
});

// Allow missionmakers to upload custom marker icons for their operations/templates
app.post('/api/upload/custom-marker', authMiddleware, (req, res) => {
  if (!(req.user?.role === 'admin' || req.user?.role === 'missionmaker')) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Upload failed' });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    (async () => {
      try {
        const filesRepo = await import('./repositories/files.js');
        const stat = await fs.promises.stat(path.join(UPLOADS_DIR, req.file.filename));
        await filesRepo.addFile({ filename: req.file.originalname, pathname: `/uploads/${req.file.filename}`, mimetype: req.file.mimetype, size: stat.size, ownerId: req.user?.id || null, metadata: { marker: true } });
      } catch (e) {
        console.error('Failed to record custom-marker metadata', e);
      }
      res.json({ url: `/uploads/${req.file.filename}`, filename: req.file.originalname });
    })();
  });
});

// Allow authenticated users to upload an avatar image
app.post('/api/upload/avatar', authMiddleware, (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Upload failed' });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    // Persist avatar URL onto the user's profile
    try {
      (async () => {
        try {
          const filesRepo = await import('./repositories/files.js');
          const stat = await fs.promises.stat(path.join(UPLOADS_DIR, req.file.filename));
          await filesRepo.addFile({ filename: req.file.originalname, pathname: `/uploads/${req.file.filename}`, mimetype: req.file.mimetype, size: stat.size, ownerId: req.user.id, metadata: { avatar: true } });
        } catch (e) {
          console.error('Failed to record avatar metadata', e);
        }
        try {
          await db.query('INSERT INTO user_profiles (user_id, display_name, bio, avatar_url, settings) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE avatar_url=VALUES(avatar_url)', [req.user.id, null, null, `/uploads/${req.file.filename}`, JSON.stringify({})]);
        } catch (e) {
          console.error('Failed to update user profile with avatar', e);
        }
      })();
    } catch (e) {
      // ignore persistence errors for upload but report success URL
    }
    res.json({ url: `/uploads/${req.file.filename}`, filename: req.file.originalname });
  });
});

  // Export full application data and included uploads as a single JSON payload
  app.get('/api/backup', authMiddleware, requireAdmin, async (req, res) => {
    try {
      const data = normalizeStorage(await _readData());
      // materialize any recurring ops into the data snapshot
      try { await generateRecurringOps(data); } catch (e) { console.error('Recurring generation error', e); }

      const uploads = [];
      if (fs.existsSync(UPLOADS_DIR)) {
        const files = await fs.promises.readdir(UPLOADS_DIR);
        for (const fname of files) {
          const full = path.join(UPLOADS_DIR, fname);
          try {
            const stat = await fs.promises.stat(full);
            if (!stat.isFile()) continue;
            const ext = path.extname(fname).toLowerCase();
            if (!ALLOWED_UPLOAD_EXTENSIONS.has(ext)) continue;
            const content = await fs.promises.readFile(full);
            uploads.push({ filename: fname, content: content.toString('base64') });
          } catch (e) {
            // ignore individual file errors
          }
        }
      }

      // If the data object contains no meaningful items and there are no uploads,
      // return a clear client error so the UI can present a helpful message.
      const keysToCheck = ['users','templates','ops','recurrences','campaigns','ranks','customRoles','modlists','files','backups','roles'];
      let hasAny = false;
      for (const k of keysToCheck) {
        if (Array.isArray(data[k]) && data[k].length > 0) { hasAny = true; break; }
        if (data[k] && typeof data[k] === 'object' && Object.keys(data[k]).length > 0) { hasAny = true; break; }
      }
      if (!hasAny && (!Array.isArray(uploads) || uploads.length === 0)) {
        return res.status(400).json({ error: 'No data available to export' });
      }

      res.json({ data, uploads });
    } catch (e) {
      console.error('Backup export error', e);
      res.status(500).json({ error: 'Could not prepare backup' });
    }
  });

  // Import application backup (JSON payload with `data` and optional `uploads` array)
  app.post('/api/backup/import', authMiddleware, requireAdmin, async (req, res) => {
    try {
      const payload = req.body;
      if (!payload || typeof payload !== 'object' || !payload.data) {
        return res.status(400).json({ error: 'Invalid payload' });
      }

      const selectedSections = Array.isArray(payload.selectedSections) ? payload.selectedSections : [];
      const restoreUploads = Boolean(payload.restoreUploads);
      const backupData = normalizeStorage(payload.data);
      const currentData = normalizeStorage(await getData());

      if (!selectedSections.length && !restoreUploads) {
        return res.status(400).json({ error: 'No sections selected for restore' });
      }

      // create uploads dir if missing
      if (restoreUploads && !fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

      // restore uploads (safe filenames only) and record metadata in DB
      if (restoreUploads && Array.isArray(payload.uploads)) {
        const filesRepo = await import('./repositories/files.js');
        for (const item of payload.uploads) {
          try {
            const name = path.basename(String(item.filename || ''));
            const ext = path.extname(name).toLowerCase();
            if (!name || !ALLOWED_UPLOAD_EXTENSIONS.has(ext) || typeof item.content !== 'string') continue;
            const dest = path.join(UPLOADS_DIR, name);
            fs.writeFileSync(dest, Buffer.from(item.content, 'base64'));
            try {
              const stat = fs.statSync(dest);
              await filesRepo.addFile({ filename: name, pathname: `/uploads/${name}`, mimetype: null, size: stat.size, ownerId: null, metadata: {} });
            } catch (e) {
              // ignore metadata insert errors
            }
          } catch (e) {
            // ignore individual file write errors
          }
        }
      }

      const allowedKeys = new Set(['users', 'templates', 'ops', 'recurrences', 'ranks', 'campaigns', 'slots', 'roles']);
      const nextData = { ...currentData };

      for (const key of selectedSections) {
        if (!allowedKeys.has(key)) continue;
        if (key in backupData) {
          nextData[key] = backupData[key];
        }
      }

      // Always keep current uploads unless restoreUploads is true
      await persistData(nextData);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: 'Import failed' });
    }
  });

// Return full current user object (safe)
app.get('/api/users/me', authMiddleware, async (req, res) => {
  const data = normalizeStorage(await getData());
  const user = data.users.find((u) => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const { password, ...safeUser } = user;
  res.json({ user: safeUser });
});

// Update current user's profile (rank, status, profile object)
app.put('/api/users/me', authMiddleware, async (req, res) => {
  const data = await getData();
  const user = data.users.find((u) => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (typeof req.body.rank === 'string') user.rank = req.body.rank;
  if (typeof req.body.status === 'string') user.status = req.body.status;
  // Merge profile object shallowly
  if (req.body.profile && typeof req.body.profile === 'object') {
    user.profile = { ...(user.profile || {}), ...req.body.profile };
  }

  await persistData(data);
  const { password, ...safeUser } = user;
  res.json({ user: safeUser });
});

// Serve the public init page directly so first-run setup is always reachable
app.get('/init.html', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'init.html'));
});

const distPath = path.join(process.cwd(), 'dist');

app.use(express.static(distPath));

app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

// Attempt to ensure DB initialization at startup, but do not crash server if DB is unavailable.
app.listen(PORT, async () => {
  logger.info(`Server running on http://localhost:${PORT}`);
  try {
    await ensureDbInitialized();
    logger.info('Schema check complete');
  } catch (e) {
    logger.error('Schema check failed', { err: e.message });
  }
});