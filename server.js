process.on('uncaughtException', (err) => {
  try {
    console.error('uncaughtException', err);
  } catch (e) {}
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  try {
    console.error('unhandledRejection', err);
  } catch (e) {}
  process.exit(1);
});
import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import multer from 'multer';
import dotenv from 'dotenv';
import pool, { testConnection } from './db.js';
import { readData as _readData, writeData as _writeData, ensureInitialized as ensureDbInitialized, resetDatabase, seedDemo, seedEssential, copyTemplateToDemo } from './lib/dataStore.js';
import * as permissionGroupsRepo from './repositories/permissionGroups.js';
import * as notificationsRepo from './repositories/notifications.js';
import * as trainingRepo from './repositories/training.js';
import { buildRecurringOperation, getDueOccurrenceDates, getNextRecurrenceDate, normalizeDays } from './lib/recurrence.js';
import { createRateLimiter, validatePassword } from './lib/authSecurity.js';

const PERMISSION_DEFINITIONS = [
  { key: 'view_overview', category: 'Overview', label: 'View overview' },
  { key: 'view_operations', category: 'Operations', label: 'View operation scheduler' },
  { key: 'edit_operations', category: 'Operations', label: 'Create and edit operations' },
  { key: 'assign_players', category: 'Operations', label: 'Assign other players' },
  { key: 'view_templates', category: 'Templates', label: 'View templates' },
  { key: 'edit_templates', category: 'Templates', label: 'Create and edit templates' },
  { key: 'view_campaigns', category: 'Campaigns', label: 'View campaigns' },
  { key: 'edit_campaigns', category: 'Campaigns', label: 'Create and edit campaigns' },
  { key: 'view_players', category: 'Players', label: 'View player list' },
  { key: 'edit_players', category: 'Players', label: 'Create and edit players' },
  { key: 'view_settings', category: 'Settings', label: 'View settings' },
  { key: 'edit_settings', category: 'Settings', label: 'Edit general settings' },
  { key: 'edit_roles', category: 'Settings', label: 'Edit roles' },
  { key: 'edit_ranks', category: 'Settings', label: 'Edit ranks' },
  { key: 'edit_squad_types', category: 'Settings', label: 'Edit squad types' },
  { key: 'manage_backups', category: 'System', label: 'Manage backups and database' },
  { key: 'manage_permissions', category: 'System', label: 'Manage permission groups' }
  ,{ key: 'view_training', category: 'Training', label: 'View and request training' }
  ,{ key: 'view_training_mine', category: 'Training', label: 'View My training requests' }
  ,{ key: 'view_training_queue', category: 'Training', label: 'View Drill Sergeant queue' }
  ,{ key: 'view_training_sessions', category: 'Training', label: 'View training sessions' }
  ,{ key: 'view_training_history', category: 'Training', label: 'View training history' }
  ,{ key: 'manage_training', category: 'Training', label: 'Plan and complete permitted training' }
  ,{ key: 'manage_training_admin', category: 'Training', label: 'Manage Drill Sergeants and training settings' }
];

dotenv.config({ quiet: true });

async function testDb() {
  try {
    const [rows] = await pool.query('SELECT 1 AS ok');
    console.info('DB connected', { rows });
  } catch (err) {
    console.error('DB connection error', { message: err && err.message ? err.message : String(err) });
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
const SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? null : 'tfo-development-secret');
if (!SECRET) throw new Error('JWT_SECRET is required when NODE_ENV=production');
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

const loginRateLimit = createRateLimiter({ windowMs: 15 * 60_000, max: 10 });
const signupRateLimit = createRateLimiter({ windowMs: 60 * 60_000, max: 5 });
const setupRateLimit = createRateLimiter({ windowMs: 15 * 60_000, max: 10 });

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
    console.warn('DB health check failed', { err: err && err.message ? err.message : String(err) });
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
  const tables = ['users','user_profiles','ranks','templates','ops','recurrences','campaigns','modlists','files','backups','roles','training_settings','trainer_role_rights','training_requests','training_sessions','training_participants','training_proposals','training_audit'];
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
    const tables = ['users','user_profiles','ranks','templates','ops','recurrences','campaigns','modlists','files','backups','roles','training_settings','trainer_role_rights','training_requests','training_sessions','training_participants','training_proposals','training_audit'];
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
// Avoid `/api/init-auth`: o2switch/Apache reserves or intercepts that path and
// returns HTTP 421 before the request reaches Passenger.
app.get('/api/setup-auth', setupRateLimit, initAdminAuth, (req, res) => {
  res.json({ ok: true });
});

app.post('/init', setupRateLimit, initAdminAuth, async (req, res) => {
  try {
    await ensureDbInitialized();
    return res.json({ ok: true });
  } catch (err) {
    console.error('Init error', err && err.stack ? err.stack : err);
    return res.status(500).json({ error: 'Initialization failed', details: err && err.message ? err.message : String(err) });
  }
});

// Reset database: DROP all tables and re-create schema
app.post('/init/reset', setupRateLimit, initAdminAuth, async (req, res) => {
  try {
    const wantEmpty = (req.query && req.query.empty === '1') || (req.body && req.body.empty === true);
    await resetDatabase();
    if (wantEmpty) {
      // Ensure tables exist but remove any seeded rows so DB is truly empty
      const conn = await pool.getConnection();
      try {
        await conn.query('SET FOREIGN_KEY_CHECKS = 0');
        const toClear = ['training_audit','training_proposals','training_participants','training_sessions','training_requests','trainer_role_rights','training_settings','notifications','recurrences','ops','templates','roles','permission_groups','files','modlists','backups','campaigns','ranks','user_profiles','users'];
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
app.post('/init/demo', setupRateLimit, initAdminAuth, async (req, res) => {
  try {
    const demo = await seedDemo();
    return res.json({ ok: true, ...demo });
  } catch (err) {
    const errorId = crypto.randomUUID();
    const knownCodes = new Set(['DEMO_LAYOUT_NOT_SAVED', 'DEMO_LAYOUT_SQUAD_MISMATCH']);
    const code = knownCodes.has(err?.code) ? err.code : 'DEMO_SEED_INTERNAL_ERROR';
    const status = knownCodes.has(code) ? 409 : 500;
    console.error(`Demo seed error [${errorId}] [${code}]`, err && err.stack ? err.stack : err);
    return res.status(status).json({
      ok: false,
      error: 'Demo seed failed',
      code,
      details: err && err.message ? err.message : String(err),
      ...(err?.code && !knownCodes.has(err.code) ? { causeCode: err.code } : {}),
      errorId
    });
  }
});

// Create an admin user (used by init UI). Accepts JSON { username, password }.
app.post('/init/create-admin', setupRateLimit, initAdminAuth, async (req, res) => {
  try {
    const username = 'admin';
    const { password } = req.body || {};
    if (typeof password !== 'string' || password.length === 0) {
      return res.status(400).json({ error: 'Password required' });
    }
    await ensureDbInitialized();
    await syncAdminPermissionGroup();
    const bcryptHash = bcrypt.hashSync(password, 10);
    const [rows] = await pool.query('SELECT id, password_hash FROM users WHERE username = ? LIMIT 1', [username]);
    if (Array.isArray(rows) && rows[0]) {
      const existing = rows[0];
      if (existing.password_hash === 'admin-disabled') {
        await pool.query('UPDATE users SET password_hash = ?, role = ?, status = ? WHERE id = ?', [bcryptHash, 'admin', 'Active', existing.id]);
      } else {
        await pool.query('UPDATE users SET role = ?, status = ? WHERE id = ?', ['admin', 'Active', existing.id]);
      }
      return res.json({ ok: true, id: existing.id, updated: true, permissionsSynced: true });
    }
    const [result] = await pool.query('INSERT INTO users (username, email, password_hash, role, `rank`, status, permissions) VALUES (?, ?, ?, ?, ?, ?, ?)', [username, null, bcryptHash, 'admin', '', 'Active', JSON.stringify({})]);
    return res.json({ ok: true, id: result.insertId, permissionsSynced: true });
  } catch (err) {
    console.error('Create-admin endpoint error', err && err.stack ? err.stack : err);
    return res.status(500).json({ error: 'Internal error' });
  }
});

// Import full DB payload (JSON) either via file upload (multipart/form-data) or JSON body
app.post('/init/import', setupRateLimit, initAdminAuth, upload.single('file'), async (req, res) => {
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

/** Database-independent recovery login for the complete initialization surface. */
function initAdminAuth(req, res, next) {
  const expectedUsername = process.env.INIT_ADMIN_USERNAME;
  const expectedPassword = process.env.INIT_ADMIN_PASSWORD;
  const header = String(req.headers.authorization || '');

  if (!expectedUsername || !expectedPassword) {
    return res.status(503).json({ error: 'Recovery login is not configured' });
  }

  if (header.startsWith('Basic ')) {
    try {
      const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
      const separator = decoded.indexOf(':');
      const username = separator >= 0 ? decoded.slice(0, separator) : '';
      const password = separator >= 0 ? decoded.slice(separator + 1) : '';
      const usernameMatches = username.length === expectedUsername.length
        && crypto.timingSafeEqual(Buffer.from(username), Buffer.from(expectedUsername));
      const passwordMatches = password.length === expectedPassword.length
        && crypto.timingSafeEqual(Buffer.from(password), Buffer.from(expectedPassword));
      if (usernameMatches && passwordMatches) return next();
    } catch (error) {
      // Treat malformed credentials as an authentication failure.
    }
  }

  res.set('WWW-Authenticate', 'Basic realm="TFO recovery", charset="UTF-8"');
  return res.status(401).send('Recovery login required');
}

async function getCapabilities(role) {
  if (role === 'admin') {
    return Object.fromEntries(PERMISSION_DEFINITIONS.map(({ key }) => [key, true]));
  }
  try {
    return (await permissionGroupsRepo.getPermissionGroup(role))?.permissions || {};
  } catch (error) {
    // Preserve access during first-run schema creation.
    return role === 'admin' ? Object.fromEntries(PERMISSION_DEFINITIONS.map(({ key }) => [key, true])) : {};
  }
}

app.get('/api/notifications', authMiddleware, async (req, res) => {
  try {
    const notifications = await notificationsRepo.listForUser(req.user.id, req.query.limit);
    res.json({ notifications, unreadCount: notifications.filter((item) => !item.readAt).length });
  } catch (err) {
    console.error('List notifications error', err);
    res.status(500).json({ error: 'Could not load notifications' });
  }
});

app.put('/api/notifications/read-all', authMiddleware, async (req, res) => {
  try {
    await notificationsRepo.markAllRead(req.user.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('Mark notifications read error', err);
    res.status(500).json({ error: 'Could not update notifications' });
  }
});

app.put('/api/notifications/:id/read', authMiddleware, async (req, res) => {
  try {
    const updated = await notificationsRepo.markRead(req.user.id, Number(req.params.id));
    if (!updated) return res.status(404).json({ error: 'Notification not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('Mark notification read error', err);
    res.status(500).json({ error: 'Could not update notification' });
  }
});

async function notifyOperationChange(req, op, type, message, metadata = {}) {
  try {
    await notificationsRepo.createForActiveUsers({
      actorId: req.user.id, type,
      title: op.title || op.payload?.name || 'Operation updated', message,
      entityType: 'operation', entityId: op.id, metadata
    });
  } catch (error) {
    console.error('Create operation notifications error', error);
  }
}

async function syncAdminPermissionGroup() {
  const permissions = Object.fromEntries(PERMISSION_DEFINITIONS.map(({ key }) => [key, true]));
  await pool.query(
    `INSERT INTO permission_groups (slug, name, is_system, permissions)
     VALUES ('admin', 'Admin', 1, ?)
     ON DUPLICATE KEY UPDATE name = VALUES(name), is_system = 1, permissions = VALUES(permissions)`,
    [JSON.stringify(permissions)]
  );
  return permissions;
}

function requireCapability(capability) {
  return async (req, res, next) => {
    const capabilities = await getCapabilities(req.user?.role);
    if (capabilities[capability] !== true) {
      return res.status(403).json({ error: `Missing permission: ${capability}` });
    }
    req.capabilities = capabilities;
    next();
  };
}

function findTemplate(data, id) {
  return data.templates.find((template) => template.id === Number(id));
}

function findSlot(template, slotId) {
  for (const squad of template.squads) {
    const slot = squad.slots.find((s) => s.id === Number(slotId));
    if (slot) return slot;
  }
  return null;
}

function findOp(data, id) {
  return (data.ops || []).find((op) => op.id === Number(id));
}

function findOpSlot(op, slotId) {
  for (const squad of op.squads || []) {
    const slot = (squad.slots || []).find((item) => item.id === Number(slotId));
    if (slot) return slot;
  }
  return null;
}

// Helper: build operation squads by copying template squad/slot structure

/**
 * Create a copy of the template squads suitable for an operation instance.
 * Existing squad data (like assignedUserId) can be preserved when provided.
 */
function buildOpSquadsFromTemplate(template, existingSquads = []) {
  // Create a fully independent copy of template squads/slots for an operation.
  // New ids are generated for op squads and slots; we record the original
  // template ids on `originalSquadId` / `originalSlotId` so the client can
  // map template flow edges to the operation copy if desired.
  return (template.squads || []).map((squad, index) => {
    // Try to find an existing op squad that corresponds to this template squad
    // by matching `originalSquadId` if present (preserve previous op-specific ids/assignments).
    const existingSquad = existingSquads.find((item) => item.originalSquadId === squad.id) || null;

    return {
      ...(existingSquad ? { id: existingSquad.id } : {}),
      originalSquadId: squad.id,
      title: squad.title,
      lrChannel: squad.lrChannel ?? existingSquad?.lrChannel ?? 1,
      srChannel: squad.srChannel ?? existingSquad?.srChannel ?? (index + 1),
      marker: squad.marker ?? existingSquad?.marker ?? null,
      markerIconUrl: squad.markerIconUrl ?? existingSquad?.markerIconUrl ?? null,
      active: existingSquad ? existingSquad.active !== false : squad.active !== false,
      slots: (squad.slots || []).map((slot, sIndex) => {
        const existingSlot = existingSquad?.slots?.find((item) => item.originalSlotId === slot.id) || null;
        return {
          ...(existingSlot ? { id: existingSlot.id } : {}),
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

  data.templates = (data.templates || []).map((template) => {
    const squads = template.squads || template.sections || [];
    return {
    ...template,
    squads: squads.map((squad, index) => ({
      ...squad,
      originalSquadId: squad.originalSquadId ?? squad.originalSectionId,
      marker: squad.marker ?? null,
      markerIconUrl: squad.markerIconUrl ?? null,
      active: squad.active !== false,
      lrChannel: squad.lrChannel ?? 1,
      srChannel: squad.srChannel ?? (index + 1),
      slots: (squad.slots || []).map((slot) => ({
        ...slot,
        allowedRoles: Array.isArray(slot.allowedRoles) ? slot.allowedRoles : [],
        notes: slot.notes || '',
        assignedUserId: slot.assignedUserId ?? null
      }))
    }))
  };
  });

  data.ops = (data.ops || []).map((op) => {
    const squads = op.squads || op.sections || [];
    return {
    ...op,
    serverName: op.serverName || '',
    modlist: op.modlist || '',
    modlistPlayer: op.modlistPlayer || '',
    modlistServer: op.modlistServer || '',
    tsAddress: op.tsAddress || '',
      squads: squads.map((squad, index) => ({
      ...squad,
      originalSquadId: squad.originalSquadId ?? squad.originalSectionId,
      marker: squad.marker ?? null,
      markerIconUrl: squad.markerIconUrl ?? null,
      active: squad.active !== false,
      lrChannel: squad.lrChannel ?? 1,
      srChannel: squad.srChannel ?? (index + 1)
    }))
  };
  });
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

// Generate any operations that are due according to recurrence entries.
// This is called on data load to materialize scheduled occurrences up to now.
let recurrenceGeneration = null;

function formatApiDateTime(value) {
  if (!value) return null;
  if (typeof value === 'string') return value.replace(' ', 'T').slice(0, 19);
  const pad = (part) => String(part).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
}

async function generateRecurringOps(inputData) {
  if (recurrenceGeneration) {
    await recurrenceGeneration;
    return getData();
  }

  const data = inputData || await getData();
  recurrenceGeneration = (async () => {
    normalizeStorage(data);
    const now = new Date();
    for (const recurrence of data.recurrences) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [locked] = await connection.query('SELECT id, op_id, rule, next_run FROM recurrences WHERE id = ? FOR UPDATE', [recurrence.id]);
        if (!locked[0]) { await connection.rollback(); continue; }
        const storedRule = typeof locked[0].rule === 'string' ? JSON.parse(locked[0].rule) : locked[0].rule;
        const nextRun = formatApiDateTime(locked[0].next_run) || recurrence.nextDateTime;
        const due = getDueOccurrenceDates(nextRun, storedRule, now);
        const opsRepo = await import('./repositories/ops.js');
        const root = await opsRepo.getOpById(locked[0].op_id);
        if (!root) { await connection.rollback(); continue; }
        const source = { ...storedRule, id: recurrence.id, squads: root.payload.squads || [] };
        for (const occurrence of due.dates) {
          const payload = buildRecurringOperation(source, occurrence, { id: null });
          await opsRepo.createOp({ templateId: source.templateId, title: payload.name, payload,
            scheduled_at: occurrence.replace('T', ' '), recurrenceId: recurrence.id,
            occurrenceAt: occurrence.replace('T', ' ') }, connection);
        }
        await connection.query('UPDATE recurrences SET next_run = ? WHERE id = ?', [due.nextRun ? due.nextRun.replace('T', ' ') : null, recurrence.id]);
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        if (error?.code !== 'ER_DUP_ENTRY') throw error;
      } finally {
        connection.release();
      }
    }
  })();
  try {
    await recurrenceGeneration;
    return getData();
  } finally {
    recurrenceGeneration = null;
  }
}

import * as usersRepo from './repositories/users.js';

app.post('/api/login', loginRateLimit, async (req, res) => {
  const { username, password } = req.body;
  if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  try {
    const user = await usersRepo.getUserByUsername(username);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const ok = bcrypt.compareSync(password, user.password_hash || user.password || '');
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, SECRET, { expiresIn: '8h' });
    const capabilities = await getCapabilities(user.role);
    res.json({ token, user: { id: user.id, username: user.username, role: user.role, capabilities } });
  } catch (err) {
    console.error('Login error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/signup', signupRateLimit, async (req, res) => {
  const username = (req.body.username || '').trim();
  if (!username) return res.status(400).json({ error: 'Username required' });
  const passwordError = validatePassword(req.body.password);
  if (passwordError) return res.status(400).json({ error: passwordError });
  try {
    const existing = await usersRepo.getUserByUsername(username);
    if (existing) return res.status(409).json({ error: 'User already exists' });
    const role = 'member';
    const hashed = bcrypt.hashSync(req.body.password, 10);
    const created = await usersRepo.createUser({ username, password_hash: hashed, role, rank: req.body.rank || '', status: req.body.status || 'Active', permissions: {}, email: req.body.email || null });
    // create profile if provided
    if (req.body.profile) {
      const profileSettings = req.body.profile.settings || req.body.profile;
      await pool.query('INSERT INTO user_profiles (user_id, display_name, bio, avatar_url, settings) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE display_name=VALUES(display_name), bio=VALUES(bio), avatar_url=VALUES(avatar_url), settings=VALUES(settings)', [created.id, req.body.profile.displayName || null, req.body.profile.bio || null, req.body.profile.avatarUrl || null, JSON.stringify(profileSettings)]);
    }
    try {
      const trainingSettings = await trainingRepo.getSettings();
      await trainingRepo.createRequest({ userId: created.id, roleName: trainingSettings.basicRole, source: 'signup', createdBy: created.id, notes: 'Automatically created from signup' });
    } catch (trainingError) {
      console.error('Could not create signup training request', trainingError);
    }
    const token = jwt.sign({ id: created.id, username: created.username, role: role }, SECRET, { expiresIn: '8h' });
    const userSafe = {
      id: created.id,
      username: created.username,
      role,
      rank: req.body.rank || '',
      status: req.body.status || 'Active',
      profile: req.body.profile || {},
      capabilities: await getCapabilities(role)
    };
    res.json({ token, user: userSafe });
  } catch (err) {
    console.error('Signup error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/public-data', async (req, res) => {
  let data = await getData();
  data = await generateRecurringOps(data);
  const publicUsers = data.users.map((user) => ({ id: user.id, username: user.username, role: user.role, rank: user.rank, status: user.status, avatarUrl: user.profile?.avatarUrl || null }));
  const publicTemplates = (data.templates || []).map((template) => ({ id: template.id, name: template.name }));
  res.json({ users: publicUsers, templates: publicTemplates, ops: data.ops || [], campaigns: data.campaigns || [], customRoles: [] });
});

app.get('/api/data', authMiddleware, async (req, res) => {
  let data = await getData();
  data = await generateRecurringOps(data);
  const capabilities = await getCapabilities(req.user.role);
  const safeUsers = data.users.map(({ password, ...rest }) => {
    if (capabilities.view_players === true || String(rest.id) === String(req.user.id)) return rest;
    return { id: rest.id, username: rest.username, role: rest.role, rank: rest.rank, status: rest.status, avatarUrl: rest.profile?.avatarUrl || null };
  });
  const permissionGroups = await permissionGroupsRepo.listPermissionGroups();
  const templates = capabilities.view_templates || capabilities.view_operations
    ? data.templates
    : (data.templates || []).map((template) => ({ id: template.id, name: template.name }));
  res.json({
    user: { id: req.user.id, username: req.user.username, role: req.user.role, capabilities },
    permissionGroups: capabilities.manage_permissions
      ? permissionGroups
      : (capabilities.view_players ? permissionGroups.map(({ slug, name, system }) => ({ slug, name, system })) : []),
    permissionDefinitions: capabilities.manage_permissions ? PERMISSION_DEFINITIONS : [],
    users: safeUsers,
    templates,
    ops: capabilities.view_overview || capabilities.view_operations ? (data.ops || []) : [],
    recurrences: capabilities.view_operations ? (data.recurrences || []) : [],
    campaigns: capabilities.view_campaigns ? (data.campaigns || []) : [],
    customRoles: capabilities.view_players || capabilities.view_settings ? (data.customRoles || []) : []
  });
});

app.get('/api/permission-groups', authMiddleware, requireCapability('manage_permissions'), async (req, res) => {
  res.json({ groups: await permissionGroupsRepo.listPermissionGroups(), definitions: PERMISSION_DEFINITIONS });
});

app.post('/api/permission-groups', authMiddleware, requireCapability('manage_permissions'), async (req, res) => {
  const name = String(req.body.name || '').trim();
  const slug = String(req.body.slug || name).trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-|-$/g, '');
  if (!name || !slug) return res.status(400).json({ error: 'Name required' });
  try {
    const group = await permissionGroupsRepo.createPermissionGroup({ slug, name, permissions: req.body.permissions || {} });
    res.json({ group });
  } catch (error) {
    if (error?.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Permission group already exists' });
    console.error('Create permission group error', error);
    return res.status(500).json({ error: 'Could not create permission group' });
  }
});

function threeMonthsAfter(value) {
  if (!value) return null;
  const date = new Date(value);
  date.setMonth(date.getMonth() + 3);
  return date;
}

async function trainingAccess(req) {
  const capabilities = await getCapabilities(req.user.role);
  const admin = req.user.role === 'admin' || capabilities.manage_training_admin === true;
  const currentUser = await usersRepo.getUserById(req.user.id);
  const drillSergeant = Boolean(currentUser?.is_drill_sergeant);
  const rights = admin ? null : (drillSergeant ? await trainingRepo.getTrainerRights(req.user.id) : []);
  return { capabilities, admin, rights: rights || [], trainer: admin || drillSergeant };
}

async function validTrainingRole(roleName) {
  const [[row]] = await pool.query('SELECT id FROM roles WHERE name = ? LIMIT 1', [roleName]);
  return Boolean(row);
}

function validateTrainingWindow(startsAt, endsAt) {
  const start = new Date(startsAt);
  const end = endsAt ? new Date(endsAt) : null;
  if (!startsAt || Number.isNaN(start.getTime())) return 'A valid start time is required';
  if (start <= new Date()) return 'Training must be scheduled in the future';
  if (end && (Number.isNaN(end.getTime()) || end <= start)) return 'End time must be after start time';
  return null;
}

function trainingDateForDb(value) {
  if (!value) return null;
  const local = String(value).match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::(\d{2}))?$/);
  if (local) return `${local[1]} ${local[2]}:${local[3] || '00'}`;
  return new Date(value).toISOString().slice(0, 19).replace('T', ' ');
}

async function notifyTrainingStaff({ roleName, actorId, title, message, entityId }) {
  const [rows] = await pool.query(`SELECT DISTINCT u.id FROM users u LEFT JOIN trainer_role_rights tr ON tr.user_id=u.id
    WHERE u.id<>? AND (u.role='admin' OR (u.is_drill_sergeant=1 AND tr.role_name=?))`, [actorId, roleName]);
  for (const row of rows) await notificationsRepo.createForUser({ userId: row.id, actorId, type: 'training_update', title, message, entityType: 'training', entityId, metadata: { roleName } });
}

async function notifyTrainingUser(userId, actorId, title, message, entityId, metadata = {}) {
  if (String(userId) === String(actorId)) return;
  await notificationsRepo.createForUser({ userId, actorId, type: 'training_update', title, message, entityType: 'training', entityId, metadata });
}

app.get('/api/training', authMiddleware, requireCapability('view_training'), async (req, res) => {
  try {
    const access = await trainingAccess(req);
    const requests = await trainingRepo.listRequests();
    const visibleRequests = access.admin ? requests : access.trainer
      ? requests.filter((item) => access.rights.includes(item.role_name) || String(item.user_id) === String(req.user.id))
      : requests.filter((item) => String(item.user_id) === String(req.user.id));
    const sessions = (await trainingRepo.listSessions()).filter((item) => access.admin || item.is_open || String(item.trainer_id) === String(req.user.id) || item.participantUserIds.includes(String(req.user.id)));
    const canSeeMine = access.admin || access.capabilities.view_training_mine === true;
    const canSeeQueue = access.admin || (access.trainer && access.capabilities.view_training_queue === true);
    const canSeeSessions = access.admin || access.capabilities.view_training_sessions === true;
    const canSeeHistory = access.admin || access.capabilities.view_training_history === true;
    const allowedRequests = visibleRequests.filter((item) => item.status === 'completed'
      ? canSeeHistory
      : (String(item.user_id) === String(req.user.id) ? canSeeMine : canSeeQueue));
    const [trainingRoles] = await pool.query('SELECT name FROM roles ORDER BY name');
    res.json({
      requests: allowedRequests,
      sessions: canSeeSessions ? sessions : [],
      roles: trainingRoles.map((row) => row.name),
      settings: await trainingRepo.getSettings(),
      trainerRights: access.admin ? await trainingRepo.listTrainerRights() : access.rights.map((roleName) => ({ userId: req.user.id, roleName })),
      access: { admin: access.admin, trainer: access.trainer, roles: access.rights, userId: req.user.id,
        windows: { mine: canSeeMine, queue: canSeeQueue, sessions: canSeeSessions, history: canSeeHistory, admin: access.admin } }
    });
  } catch (error) { console.error('Training overview error', error); res.status(500).json({ error: 'Could not load training' }); }
});

app.get('/api/training/requests/:id', authMiddleware, requireCapability('view_training'), async (req, res) => {
  const request = await trainingRepo.getRequest(Number(req.params.id));
  if (!request) return res.status(404).json({ error: 'Training request not found' });
  const access = await trainingAccess(req);
  const permitted = access.admin || String(request.user_id) === String(req.user.id) || (access.trainer && access.rights.includes(request.role_name));
  if (!permitted) return res.status(403).json({ error: 'Not permitted for this training role' });
  res.json({ request, proposals: await trainingRepo.listProposals(request.id), history: await trainingRepo.history(request.id) });
});

app.post('/api/training/requests', authMiddleware, requireCapability('view_training'), async (req, res) => {
  try {
    const access = await trainingAccess(req);
    const targetUserId = Number(req.body.userId || req.user.id);
    const own = String(targetUserId) === String(req.user.id);
    if (!own && !access.trainer && !access.admin) return res.status(403).json({ error: 'Only staff can request training for another player' });
    const roleName = String(req.body.roleName || '').trim();
    if (!roleName) return res.status(400).json({ error: 'Role is required' });
    if (!(await validTrainingRole(roleName))) return res.status(400).json({ error: 'Unknown training role' });
    const target = await usersRepo.getUserById(targetUserId);
    if (!target) return res.status(404).json({ error: 'Player not found' });
    const currentPermissions = typeof target.permissions === 'string' ? JSON.parse(target.permissions || '{}') : (target.permissions || {});
    if (currentPermissions[roleName] === true) return res.status(409).json({ error: 'Player already has this role qualification' });
    if (await trainingRepo.activeDuplicate(targetUserId, roleName)) return res.status(409).json({ error: 'An active request for this role already exists' });
    const lastPassed = await trainingRepo.lastPassed(targetUserId);
    const cooldownUntil = threeMonthsAfter(lastPassed);
    const override = access.admin && req.body.overrideReason;
    if (cooldownUntil && cooldownUntil > new Date() && !override) return res.status(409).json({ error: 'Player is in the three-month training cooldown', cooldownUntil });
    if (req.body.overrideReason && !access.admin) return res.status(403).json({ error: 'Only admins can override cooldown' });
    const request = await trainingRepo.createRequest({ userId: targetUserId, roleName, source: own ? 'self' : 'staff', createdBy: req.user.id, notes: req.body.notes, overrideReason: req.body.overrideReason });
    await notifyTrainingStaff({ roleName, actorId: req.user.id, title: 'New training request', message: `${target.username} requested ${roleName} training.`, entityId: request.id });
    if (!own) await notifyTrainingUser(targetUserId, req.user.id, 'Training requested', `${req.user.username} created a ${roleName} training request for you.`, request.id, { roleName });
    res.status(201).json({ request });
  } catch (error) { console.error('Create training request error', error); res.status(500).json({ error: 'Could not create training request' }); }
});

app.put('/api/training/requests/:id', authMiddleware, requireCapability('view_training'), async (req, res) => {
  const request = await trainingRepo.getRequest(Number(req.params.id));
  if (!request) return res.status(404).json({ error: 'Training request not found' });
  const access = await trainingAccess(req);
  if (!['requested','claimed','planning'].includes(request.status)) return res.status(409).json({ error: 'This request can no longer be changed' });
  const ownCancellation = req.body.action === 'cancel' && String(request.user_id) === String(req.user.id);
  if (!ownCancellation && !access.admin && !(access.trainer && access.rights.includes(request.role_name))) return res.status(403).json({ error: 'Not permitted for this training role' });
  const patch = {};
  if (req.body.action === 'claim') { patch.claimedBy = req.user.id; patch.status = 'claimed'; }
  if (req.body.action === 'release') { patch.claimedBy = null; patch.status = 'requested'; }
  if (req.body.action === 'cancel') { patch.status = 'cancelled'; patch.notes = req.body.reason || request.notes; }
  if (req.body.priority) patch.priority = req.body.priority;
  const updated = await trainingRepo.updateRequest(request.id, patch, req.user.id);
  const messages = { claim: 'Your training request was claimed.', release: 'Your training request was released back to the queue.', cancel: 'Your training request was cancelled.' };
  if (messages[req.body.action]) await notifyTrainingUser(request.user_id, req.user.id, 'Training request updated', messages[req.body.action], request.id, { action: req.body.action });
  res.json({ request: updated });
});

app.post('/api/training/requests/:id/proposals', authMiddleware, requireCapability('view_training'), async (req, res) => {
  const request = await trainingRepo.getRequest(Number(req.params.id));
  if (!request) return res.status(404).json({ error: 'Training request not found' });
  const access = await trainingAccess(req);
  if (!['requested','claimed','planning'].includes(request.status)) return res.status(409).json({ error: 'This request can no longer receive proposals' });
  if (String(request.user_id) !== String(req.user.id) && !access.admin && !(access.trainer && access.rights.includes(request.role_name))) return res.status(403).json({ error: 'Not permitted' });
  if (!req.body.startsAt) return res.status(400).json({ error: 'Start time is required' });
  const windowError = validateTrainingWindow(req.body.startsAt, req.body.endsAt);
  if (windowError) return res.status(400).json({ error: windowError });
  const id = await trainingRepo.createProposal({ requestId: request.id, proposedBy: req.user.id, startsAt: trainingDateForDb(req.body.startsAt), endsAt: trainingDateForDb(req.body.endsAt), message: req.body.message });
  if (String(request.user_id) !== String(req.user.id)) await notifyTrainingUser(request.user_id, req.user.id, 'New training date proposal', `A new date was proposed for your ${request.role_name} training.`, request.id, { proposalId: id });
  else if (request.claimed_by) await notifyTrainingUser(request.claimed_by, req.user.id, 'New training date proposal', `${request.username} proposed a date for ${request.role_name} training.`, request.id, { proposalId: id });
  else await notifyTrainingStaff({ roleName: request.role_name, actorId: req.user.id, title: 'New training date proposal', message: `${request.username} proposed a training date.`, entityId: request.id });
  res.status(201).json({ id });
});

app.post('/api/training/proposals/:id/accept', authMiddleware, requireCapability('view_training'), async (req, res) => {
  try {
    const proposal = await trainingRepo.getProposal(Number(req.params.id));
    if (!proposal) return res.status(404).json({ error: 'Proposal not found' });
    const request = await trainingRepo.getRequest(proposal.request_id);
    const access = await trainingAccess(req);
    const isPlayer = String(request.user_id) === String(req.user.id);
    const isTrainer = access.admin || (access.trainer && access.rights.includes(request.role_name));
    if (!isPlayer && !isTrainer) return res.status(403).json({ error: 'Not permitted' });
    if (String(proposal.proposed_by) === String(req.user.id)) return res.status(409).json({ error: 'The other party must accept this proposal' });
    const trainerId = isTrainer ? req.user.id : proposal.proposed_by;
    const trainerRights = await trainingRepo.getTrainerRights(trainerId);
    const proposedTrainer = await usersRepo.getUserById(trainerId);
    if (proposedTrainer?.role !== 'admin' && !trainerRights.includes(request.role_name)) return res.status(409).json({ error: 'The proposal is not linked to a qualified Drill Sergeant' });
    const windowError = validateTrainingWindow(proposal.starts_at, proposal.ends_at);
    if (windowError) return res.status(409).json({ error: windowError });
    const sessionId = await trainingRepo.acceptProposalAndSchedule({ proposalId: proposal.id, requestId: request.id, actorId: req.user.id, trainerId, roleName: request.role_name });
    await notifyTrainingUser(request.user_id, req.user.id, 'Training scheduled', `Your ${request.role_name} training has been scheduled.`, request.id, { sessionId });
    await notifyTrainingUser(trainerId, req.user.id, 'Training scheduled', `${request.username}'s ${request.role_name} training has been scheduled.`, request.id, { sessionId });
    res.json({ session: await trainingRepo.session(sessionId) });
  } catch (error) { console.error('Accept training proposal error', error); res.status(error.status || 500).json({ error: error.message || 'Could not accept proposal' }); }
});

app.post('/api/training/sessions', authMiddleware, requireCapability('view_training'), async (req, res) => {
  try {
    const access = await trainingAccess(req);
    const trainerId = Number(req.body.trainerId || req.user.id);
    const roleName = String(req.body.roleName || '').trim();
    if (!access.admin && (trainerId !== req.user.id || !access.rights.includes(roleName))) return res.status(403).json({ error: 'Missing trainer right for this role' });
    if (!roleName || !req.body.startsAt) return res.status(400).json({ error: 'Role and start time are required' });
    if (!(await validTrainingRole(roleName))) return res.status(400).json({ error: 'Unknown training role' });
    const windowError = validateTrainingWindow(req.body.startsAt, req.body.endsAt);
    if (windowError) return res.status(400).json({ error: windowError });
    const capacity = Math.max(1, Number(req.body.capacity) || 1);
    const id = await trainingRepo.createSessionWithParticipants({ ...req.body, startsAt: trainingDateForDb(req.body.startsAt), endsAt: trainingDateForDb(req.body.endsAt), trainerId, roleName, title: req.body.title || `${roleName} training`, capacity }, req.body.requestIds || []);
    const createdSession = await trainingRepo.session(id);
    for (const participant of createdSession.participants) await notifyTrainingUser(participant.userId, req.user.id, 'Training scheduled', `Your ${roleName} training has been scheduled.`, participant.requestId, { sessionId: id });
    res.status(201).json({ session: createdSession });
  } catch (error) { console.error('Create training session error', error); res.status(error.status || 500).json({ error: error.message || 'Could not create session' }); }
});

app.get('/api/training/sessions/:id', authMiddleware, requireCapability('view_training'), async (req, res) => {
  const session = await trainingRepo.session(Number(req.params.id));
  if (!session) return res.status(404).json({ error: 'Session not found' });
  const access = await trainingAccess(req);
  const participant = session.participants.some((item) => String(item.userId) === String(req.user.id));
  if (!access.admin && String(session.trainer_id) !== String(req.user.id) && !participant) return res.status(403).json({ error: 'Not permitted' });
  res.json({ session });
});

app.post('/api/training/sessions/:id/join', authMiddleware, requireCapability('view_training'), async (req, res) => {
  try {
    await trainingRepo.joinOpenSession(Number(req.params.id), Number(req.body.requestId), req.user.id);
    const joinedSession = await trainingRepo.session(Number(req.params.id));
    await notifyTrainingUser(joinedSession.trainer_id, req.user.id, 'Training session signup', `${req.user.username} joined your ${joinedSession.role_name} training session.`, Number(req.body.requestId), { sessionId: joinedSession.id });
    res.json({ session: joinedSession });
  } catch (error) { if (error?.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Already enrolled' }); res.status(error.status || 500).json({ error: error.message || 'Could not join session' }); }
});

app.post('/api/training/sessions/:sessionId/participants/:requestId/complete', authMiddleware, requireCapability('view_training'), async (req, res) => {
  try {
    const session = await trainingRepo.session(Number(req.params.sessionId));
    const access = await trainingAccess(req);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (!access.admin && (String(session.trainer_id) !== String(req.user.id) || !access.rights.includes(session.role_name))) return res.status(403).json({ error: 'Not permitted to complete this training' });
    if (!['passed','not_yet','absent'].includes(req.body.outcome)) return res.status(400).json({ error: 'Invalid outcome' });
    if (req.body.outcome === 'not_yet' && !String(req.body.notes || '').trim()) return res.status(400).json({ error: 'Notes are required when the player is not yet qualified' });
    const request = await trainingRepo.completeParticipant({ sessionId: session.id, requestId: Number(req.params.requestId), outcome: req.body.outcome, notes: req.body.notes, actorId: req.user.id });
    await notificationsRepo.createForUser({ userId: request.user_id, actorId: req.user.id, type: 'training_result', title: `${request.role_name} training`, message: `${req.body.outcome === 'passed' ? 'Training passed' : 'Training assessment recorded'}`, entityType: 'training', entityId: request.id, metadata: { outcome: req.body.outcome } });
    res.json({ ok: true });
  } catch (error) { console.error('Complete training error', error); res.status(error.status || 500).json({ error: error.message || 'Could not complete training' }); }
});

app.get('/api/training/admin', authMiddleware, requireCapability('manage_training_admin'), async (req, res) => {
  res.json({ rights: await trainingRepo.listTrainerRights(), settings: await trainingRepo.getSettings() });
});

app.put('/api/training/admin/trainers/:userId', authMiddleware, requireCapability('manage_training_admin'), async (req, res) => {
  const roles = Array.isArray(req.body.roles) ? [...new Set(req.body.roles.map((role) => String(role).trim()).filter(Boolean))] : [];
  for (const role of roles) if (!(await validTrainingRole(role))) return res.status(400).json({ error: `Unknown training role: ${role}` });
  const targetUser = await usersRepo.getUserById(Number(req.params.userId));
  if (!targetUser) return res.status(404).json({ error: 'User not found' });
  if (!targetUser.is_drill_sergeant) return res.status(409).json({ error: 'Mark this player as Drill Sergeant in the Player List first' });
  res.json({ roles: await trainingRepo.replaceTrainerRights(Number(req.params.userId), roles) });
});

app.put('/api/training/admin/settings', authMiddleware, requireCapability('manage_training_admin'), async (req, res) => {
  const basicRole = String(req.body.basicRole || '').trim();
  if (!basicRole) return res.status(400).json({ error: 'Basic training role is required' });
  if (!(await validTrainingRole(basicRole))) return res.status(400).json({ error: 'Unknown training role' });
  res.json({ settings: await trainingRepo.updateSettings({ basicRole }) });
});

app.put('/api/permission-groups/:slug', authMiddleware, requireCapability('manage_permissions'), async (req, res) => {
  const existing = await permissionGroupsRepo.getPermissionGroup(req.params.slug);
  if (!existing) return res.status(404).json({ error: 'Permission group not found' });
  const permissions = req.params.slug === 'admin'
    ? Object.fromEntries(PERMISSION_DEFINITIONS.map(({ key }) => [key, true]))
    : { ...(req.body.permissions || existing.permissions) };
  const group = await permissionGroupsRepo.updatePermissionGroup(req.params.slug, {
    name: typeof req.body.name === 'string' ? req.body.name.trim() : undefined,
    permissions
  });
  res.json({ group });
});

app.delete('/api/permission-groups/:slug', authMiddleware, requireCapability('manage_permissions'), async (req, res) => {
  const group = await permissionGroupsRepo.getPermissionGroup(req.params.slug);
  if (!group) return res.status(404).json({ error: 'Permission group not found' });
  if (group.system) return res.status(400).json({ error: 'System groups cannot be deleted' });
  const [[usage]] = await pool.query('SELECT COUNT(1) c FROM users WHERE role = ?', [req.params.slug]);
  if (usage.c > 0) return res.status(409).json({ error: 'Move users out of this group before deleting it' });
  await permissionGroupsRepo.deletePermissionGroup(req.params.slug);
  res.status(204).end();
});

app.post('/api/users', authMiddleware, requireCapability('edit_players'), async (req, res) => {
  try {
    if (!String(req.body.username || '').trim()) return res.status(400).json({ error: 'Username required' });
    const passwordError = validatePassword(req.body.password);
    if (passwordError) return res.status(400).json({ error: passwordError });
    const selectedGroup = await permissionGroupsRepo.getPermissionGroup(req.body.role || 'member');
    if (!selectedGroup) return res.status(400).json({ error: 'Unknown permission group' });
    const hashed = bcrypt.hashSync(req.body.password, 10);
    const created = await usersRepo.createUser({ username: req.body.username, email: req.body.email || null, password_hash: hashed, role: req.body.role || 'member', rank: req.body.rank || '', status: req.body.status || 'Active', permissions: req.body.permissions || {} });
    const user = await usersRepo.getUserById(created.id);
    const { password_hash, ...safeUser } = user;
    res.json({ user: safeUser });
  } catch (err) {
    console.error('Create user error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/users/:id/permissions', authMiddleware, requireCapability('edit_players'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const patch = {};
    if (req.body.permissions !== undefined) patch.permissions = req.body.permissions;
    if (req.body.rank !== undefined) patch.rank = req.body.rank;
    if (req.body.status !== undefined) patch.status = req.body.status;
    if (req.body.isDrillSergeant !== undefined) patch.isDrillSergeant = req.body.isDrillSergeant === true;
    if (req.body.role !== undefined) {
      const selectedGroup = await permissionGroupsRepo.getPermissionGroup(req.body.role);
      if (!selectedGroup) return res.status(400).json({ error: 'Unknown permission group' });
      patch.role = req.body.role;
    }
    const updated = await usersRepo.updateUser(id, patch);
    if (patch.isDrillSergeant === false) await trainingRepo.replaceTrainerRights(id, []);
    const { password_hash, ...safeUser } = updated;
    res.json({ user: safeUser });
  } catch (err) {
    console.error('Update permissions error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/users/:id', authMiddleware, requireCapability('edit_players'), async (req, res) => {
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
  const passwordError = validatePassword(newPassword);
  if (passwordError) return res.status(400).json({ error: passwordError });

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

app.post('/api/templates', authMiddleware, requireCapability('edit_templates'), (req, res) => {
  (async () => {
    try {
      const t = await (await import('./repositories/templates.js')).createTemplate({ name: req.body.name, ownerId: req.user?.id || null, data: { squads: [] } });
      res.json({ template: t });
    } catch (err) {
      console.error('Create template error', err);
      res.status(500).json({ error: 'Server error' });
    }
  })();
});

app.put('/api/templates/:id', authMiddleware, requireCapability('edit_templates'), (req, res) => {
  (async () => {
    try {
      const id = Number(req.params.id);
      const updated = await (await import('./repositories/templates.js')).updateTemplate(id, {
        name: typeof req.body.name === 'string' ? req.body.name : undefined,
        data: Array.isArray(req.body.squads) ? {
          squads: req.body.squads,
          layoutNodes: Array.isArray(req.body.layoutNodes) ? req.body.layoutNodes : [],
          flowEdges: Array.isArray(req.body.flowEdges) ? req.body.flowEdges : []
        } : undefined
      });
      if (!updated) return res.status(404).json({ error: 'Template not found' });
      const demoRequested = req.body.saveToDemo === true
        || req.body.saveToDemo === 'true'
        || req.query.saveToDemo === '1';
      const demo = demoRequested ? await copyTemplateToDemo(id) : null;
      res.json({ template: updated, demoRequested, demo });
    } catch (err) {
      console.error('Update template error', err);
      res.status(500).json({ error: 'Server error' });
    }
  })();
});

app.post('/api/templates/:id/save-to-demo', authMiddleware, requireCapability('edit_templates'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Array.isArray(req.body.squads)) {
      return res.status(400).json({ error: 'Could not copy template to demo', code: 'DEMO_COPY_SQUADS_REQUIRED', details: 'The request did not contain template squads.' });
    }
    const templatesRepo = await import('./repositories/templates.js');
    const template = await templatesRepo.updateTemplate(id, {
      name: typeof req.body.name === 'string' ? req.body.name : undefined,
      data: {
        squads: req.body.squads,
        layoutNodes: Array.isArray(req.body.layoutNodes) ? req.body.layoutNodes : [],
        flowEdges: Array.isArray(req.body.flowEdges) ? req.body.flowEdges : []
      }
    });
    if (!template) return res.status(404).json({ error: 'Could not copy template to demo', code: 'DEMO_TEMPLATE_NOT_FOUND' });
    const result = await copyTemplateToDemo(id);
    res.json({ ok: true, template, ...result });
  } catch (err) {
    const code = err?.code || 'DEMO_COPY_FAILED';
    const status = code === 'DEMO_TEMPLATE_NOT_FOUND' ? 404 : code === 'DEMO_LAYOUT_NOT_SAVED' ? 409 : 500;
    console.error(`Template demo copy error [${code}]`, err?.stack || err);
    res.status(status).json({ error: 'Could not copy template to demo', code, phase: 'save-and-copy', details: err?.message || String(err) });
  }
});

app.post('/api/templates/:id/duplicate', authMiddleware, requireCapability('edit_templates'), (req, res) => {
  (async () => {
    try {
      const tplRepo = await import('./repositories/templates.js');
      const source = await tplRepo.getTemplateById(Number(req.params.id));
      if (!source) return res.status(404).json({ error: 'Template not found' });
      const newTemplateData = {
        squads: (source.data.squads || []).map((squad) => ({
          title: squad.title,
          lrChannel: squad.lrChannel || 1,
          srChannel: squad.srChannel || 1,
          marker: squad.marker || null,
          markerIconUrl: squad.markerIconUrl || null,
          slots: (squad.slots || []).map((slot) => ({
            name: slot.name,
            role: slot.role,
            allowedRoles: Array.isArray(slot.allowedRoles) ? slot.allowedRoles : [],
            notes: slot.notes || '',
            assignedUserId: null
          }))
        }))
      };
      const name = typeof req.body.name === 'string' && req.body.name.trim() ? req.body.name.trim() : `Copy of ${source.name}`;
      const created = await tplRepo.createTemplate({ name, ownerId: req.user?.id || null, data: newTemplateData });
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

app.post('/api/campaigns', authMiddleware, requireCapability('edit_campaigns'), async (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Name required' });
  const missionmakerUserId = Number(req.body.missionmakerUserId) || null;
  if (!missionmakerUserId) return res.status(400).json({ error: 'missionmakerUserId required' });

  const campaign = { name, image: req.body.image || '', modlistPlayer: req.body.modlistPlayer || '',
    modlistServer: req.body.modlistServer || '', defaultTemplateId: req.body.defaultTemplateId ? Number(req.body.defaultTemplateId) : null, missionmakerUserId };
  const [result] = await pool.query(`INSERT INTO campaigns
    (name, owner_id, image, modlist_player, modlist_server, default_template_id, data) VALUES (?, ?, ?, ?, ?, ?, JSON_OBJECT())`,
  [campaign.name, campaign.missionmakerUserId, campaign.image, campaign.modlistPlayer, campaign.modlistServer, campaign.defaultTemplateId]);
  campaign.id = result.insertId;
  res.json({ campaign });
});

app.put('/api/campaigns/:id', authMiddleware, requireCapability('edit_campaigns'), async (req, res) => {
  const data = await getData();
  const campaign = (data.campaigns || []).find((c) => c.id === Number(req.params.id));
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

  if (typeof req.body.name === 'string') campaign.name = req.body.name.trim();
  if ('image' in req.body) campaign.image = req.body.image || '';
  if ('modlistPlayer' in req.body) campaign.modlistPlayer = req.body.modlistPlayer || '';
  if ('modlistServer' in req.body) campaign.modlistServer = req.body.modlistServer || '';
  if ('defaultTemplateId' in req.body) campaign.defaultTemplateId = req.body.defaultTemplateId ? Number(req.body.defaultTemplateId) : null;
  if ('missionmakerUserId' in req.body) campaign.missionmakerUserId = req.body.missionmakerUserId ? Number(req.body.missionmakerUserId) : null;

  await pool.query(`UPDATE campaigns SET name = ?, owner_id = ?, image = ?, modlist_player = ?, modlist_server = ?, default_template_id = ? WHERE id = ?`,
  [campaign.name, campaign.missionmakerUserId, campaign.image, campaign.modlistPlayer, campaign.modlistServer, campaign.defaultTemplateId, campaign.id]);
  res.json({ campaign });
});

app.delete('/api/campaigns/:id', authMiddleware, requireCapability('edit_campaigns'), async (req, res) => {
  const data = await getData();
  const idx = (data.campaigns || []).findIndex((c) => c.id === Number(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Campaign not found' });
  await pool.query('DELETE FROM campaigns WHERE id = ?', [data.campaigns[idx].id]);
  res.status(204).end();
});

app.post('/api/ops', authMiddleware, requireCapability('edit_operations'), async (req, res) => {
  try {
    const tplRepo = await import('./repositories/templates.js');
    const opsRepo = await import('./repositories/ops.js');
    const tplId = (req.body.templateId === null || req.body.templateId === undefined || req.body.templateId === '') ? null : Number(req.body.templateId);
    let squads = [];
    if (tplId) {
      const template = await tplRepo.getTemplateById(tplId);
      if (!template) return res.status(404).json({ error: 'Template not found' });
      squads = buildOpSquadsFromTemplate({ squads: template.data.squads || [] });
    } else {
      // No template selected: create an op with empty squads instead of throwing
      squads = [];
    }
    const recurrence = req.body.recurrence || 'none';
    const payload = {
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
      campaignId: req.body.campaignId ?? null,
      squads
    };

    if (recurrence === 'none') {
      const created = await opsRepo.createOp({ templateId: tplId, title: payload.name, payload });
      res.json({ op: created, recurrence: null });
    } else {
      const conn = await import('./db.js');
      const pool = conn.default;
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const scheduledDateTime = `${req.body.date}T${req.body.time || '00:00'}:00`;
        const scheduled = new Date(scheduledDateTime);
        if (!req.body.date || Number.isNaN(scheduled.getTime())) {
          await connection.rollback();
          return res.status(400).json({ error: 'A valid start date is required for recurrence' });
        }
        const rule = {
          recurrence,
          creationDelayHours: 6,
          name: payload.name,
          templateId: payload.templateId,
          startDate: payload.date,
          time: payload.time,
          weeklyDays: normalizeDays(req.body.weeklyDays),
          monthlyDay: req.body.monthlyDay || null,
          repeatUntil: req.body.recurrenceEndDate || null,
          serverName: payload.serverName,
          modlist: payload.modlist,
          modlistPlayer: payload.modlistPlayer,
          modlistServer: payload.modlistServer,
          tsAddress: payload.tsAddress,
          campaignId: payload.campaignId,
          absentUserIds: []
        };
        const created = await opsRepo.createOp({ templateId: tplId, title: payload.name, payload,
          scheduled_at: scheduledDateTime.replace('T', ' '), status: 'scheduled' }, connection);
        const [recurrenceResult] = await connection.query(
          'INSERT INTO recurrences (op_id, rule, next_run) VALUES (?, ?, ?)',
          [created.id, JSON.stringify(rule), scheduledDateTime.replace('T', ' ')]
        );
        const recurrenceId = recurrenceResult.insertId;
        await connection.commit();
        res.json({
          op: created,
          recurrence: { id: recurrenceId, ...rule, rule, nextRun: scheduledDateTime, nextDateTime: scheduledDateTime }
        });
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

app.post('/api/ops/:id/load-template', authMiddleware, requireCapability('edit_operations'), async (req, res) => {
  try {
    const data = await getData();
    const op = findOp(data, req.params.id);
    if (!op) return res.status(404).json({ error: 'Operation not found' });
    const templateId = req.body.templateId ? Number(req.body.templateId) : op.templateId;
    if (!templateId) return res.status(400).json({ error: 'No templateId provided' });
    const template = data.templates.find((t) => t.id === templateId);
    if (!template) return res.status(404).json({ error: 'Template not found' });
    const existingSquads = op.squads || [];
    op.squads = buildOpSquadsFromTemplate({ squads: template.squads || [] }, existingSquads);
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
    const activeSquads = op.payload.squads.filter((squad) => squad.active !== false);
    const slot = activeSquads.flatMap((s) => s.slots).find((sl) => sl.id === Number(req.body.slotId));
    if (!slot) return res.status(404).json({ error: 'Slot not found' });
    const canManageAssignments = (await getCapabilities(req.user.role)).assign_players === true;
    if (req.body.userId && !canManageAssignments) {
      return res.status(403).json({ error: 'Only admins and missionmakers can assign another player' });
    }
    const requestedUserId = req.body.userId ? Number(req.body.userId) : req.user.id;
    const targetUser = await (await import('./repositories/users.js')).getUserById(requestedUserId);
    if (!targetUser) return res.status(404).json({ error: 'Player not found' });
    const assigningAnotherPlayer = String(requestedUserId) !== String(req.user.id);
    if (req.user.role !== 'admin' || assigningAnotherPlayer) {
      let permissions = targetUser.permissions || {};
      if (typeof permissions === 'string') {
        try { permissions = JSON.parse(permissions); } catch (error) { permissions = {}; }
      }
      const requiredRoles = [...new Set([slot.role, ...(Array.isArray(slot.allowedRoles) ? slot.allowedRoles : [])].filter(Boolean))];
      const hasRequiredRole = requiredRoles.some((role) => permissions[role] === true);
      if (!hasRequiredRole) {
        return res.status(403).json({ error: `You are not qualified for the ${slot.role || 'selected'} role` });
      }
    }
    const existingSlot = op.payload.squads.flatMap((s) => s.slots).find((other) => String(other.assignedUserId) === String(requestedUserId));
    if (existingSlot && existingSlot.id !== slot.id) return res.status(409).json({ error: 'You are already signed up to another slot for this operation' });
    if (slot.assignedUserId && String(slot.assignedUserId) !== String(requestedUserId)) return res.status(409).json({ error: 'This slot is already taken' });
    await opsRepo.joinSlot(Number(req.params.id), Number(req.body.slotId), requestedUserId);
    // Return the op in the same normalized shape as /api/public-data (squads at top-level)
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
    console.log('[server] POST /api/ops/:id/signoff', { opId: req.params.id, slotId: req.body.slotId, user: req.user?.id, force: req.body.force === true });
    const opsRepo = await import('./repositories/ops.js');
    let assignedUserId = req.user.id;
    if (req.body.force === true) {
      const canManageAssignments = (await getCapabilities(req.user.role)).assign_players === true;
      if (!canManageAssignments) return res.status(403).json({ error: 'Missing permission: assign_players' });
      const op = await opsRepo.getOpById(Number(req.params.id));
      if (!op) return res.status(404).json({ error: 'Operation not found' });
      const slot = (op.payload.squads || []).flatMap((squad) => squad.slots || []).find((item) => item.id === Number(req.body.slotId));
      if (!slot) return res.status(404).json({ error: 'Slot not found' });
      if (!slot.assignedUserId) return res.status(409).json({ error: 'Slot is already free' });
      assignedUserId = slot.assignedUserId;
    }
    await opsRepo.signoffSlot(Number(req.params.id), Number(req.body.slotId), assignedUserId);
    // Return normalized op shape so client UI receives `squads` at top-level
    const dataAfter = await getData();
    const opAfter = findOp(dataAfter, Number(req.params.id));
    console.log('[server] signoff result', { opId: opAfter?.id });
    res.json({ op: opAfter });
  } catch (err) {
    console.error('Signoff slot error', err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

app.put('/api/ops/:id/absence', authMiddleware, async (req, res) => {
  try {
    if (typeof req.body.absent !== 'boolean') return res.status(400).json({ error: 'absent must be a boolean' });
    const opsRepo = await import('./repositories/ops.js');
    const existing = await opsRepo.getOpById(Number(req.params.id));
    if (!existing) return res.status(404).json({ error: 'Operation not found' });
    await opsRepo.setPlayerAbsent(Number(req.params.id), req.user.id, req.body.absent);
    const dataAfter = await getData();
    res.json({ op: findOp(dataAfter, Number(req.params.id)) });
  } catch (err) {
    console.error('Operation absence error', err);
    res.status(500).json({ error: err.message || 'Could not update absence' });
  }
});

app.put('/api/ops/:opId/squads/:squadId', authMiddleware, requireCapability('edit_operations'), async (req, res) => {
  try {
    const opsRepo = await import('./repositories/ops.js');
    const patch = {};
    if ('lrChannel' in req.body) { if (!isValidChannel(req.body.lrChannel)) return res.status(400).json({ error: 'lrChannel must be between 0 and 99' }); patch.lrChannel = Number(req.body.lrChannel); }
    if ('srChannel' in req.body) { if (!isValidChannel(req.body.srChannel)) return res.status(400).json({ error: 'srChannel must be between 0 and 99' }); patch.srChannel = Number(req.body.srChannel); }
    if ('marker' in req.body) {
      if (req.body.marker === null) patch.marker = null;
      else if (typeof req.body.marker === 'string') patch.marker = req.body.marker.trim();
      else return res.status(400).json({ error: 'marker must be a string or null' });
    }
    if ('markerIconUrl' in req.body) {
      if (req.body.markerIconUrl === null) patch.markerIconUrl = null;
      else if (typeof req.body.markerIconUrl === 'string') patch.markerIconUrl = req.body.markerIconUrl.trim();
      else return res.status(400).json({ error: 'markerIconUrl must be a string or null' });
    }
    if ('active' in req.body) {
      if (typeof req.body.active !== 'boolean') return res.status(400).json({ error: 'active must be a boolean' });
      patch.active = req.body.active;
    }
    const updated = await opsRepo.updateSquad(Number(req.params.opId), Number(req.params.squadId), patch);
    const changedLabels = [];
    if ('active' in patch) changedLabels.push(patch.active ? 'activated' : 'deactivated');
    if ('lrChannel' in patch || 'srChannel' in patch) changedLabels.push('radio settings updated');
    if ('marker' in patch || 'markerIconUrl' in patch) changedLabels.push('marker updated');
    if (changedLabels.length) {
      const squad = updated.payload?.squads?.find((item) => item.id === Number(req.params.squadId));
      await notifyOperationChange(req, updated, 'squad_changed', `Squad ${squad?.title || ''} changed: ${changedLabels.join(', ')}.`, { squadId: Number(req.params.squadId) });
    }
    res.json({ op: updated });
  } catch (err) {
    console.error('Update op squad error', err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

app.put('/api/ops/:opId/slots/:slotId', authMiddleware, requireCapability('edit_operations'), async (req, res) => {
  try {
    const opsRepo = await import('./repositories/ops.js');
    const patch = {};
    if (typeof req.body.name === 'string') patch.name = req.body.name;
    if (typeof req.body.role === 'string') patch.role = req.body.role;
    if (typeof req.body.notes === 'string') patch.notes = req.body.notes;
    if (Array.isArray(req.body.allowedRoles)) patch.allowedRoles = req.body.allowedRoles;
    const updated = await opsRepo.updateSlot(Number(req.params.opId), Number(req.params.slotId), patch);
    if (Object.keys(patch).length) {
      const slot = (updated.payload?.squads || []).flatMap((squad) => squad.slots || []).find((item) => item.id === Number(req.params.slotId));
      await notifyOperationChange(req, updated, 'squad_changed', `A squad position was updated${slot?.name ? `: ${slot.name}` : ''}.`, { slotId: Number(req.params.slotId) });
    }
    res.json({ op: updated });
  } catch (err) {
    console.error('Update slot error', err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

app.put('/api/ops/:id', authMiddleware, requireCapability('edit_operations'), async (req, res) => {
  try {
    const opsRepo = await import('./repositories/ops.js');
    const existing = await opsRepo.getOpById(Number(req.params.id));
    if (!existing) return res.status(404).json({ error: 'Operation not found' });
    const patch = {};
    if (typeof req.body.name === 'string') patch.title = req.body.name;
    const payloadFields = ['date', 'time', 'serverName', 'modlist', 'modlistPlayer', 'modlistServer', 'tsAddress', 'campaignId'];
    const hasPayloadChange = payloadFields.some((f) => typeof req.body[f] === 'string' || (f === 'campaignId' && (typeof req.body[f] === 'number' || req.body[f] === null))) || Array.isArray(req.body.squads);
    if (hasPayloadChange) {
      // Merge into existing payload to avoid destroying stored fields (name, squads, etc.)
      patch.payload = { ...(existing.payload || {}) };
      if (typeof req.body.date === 'string') patch.payload.date = req.body.date;
      if (typeof req.body.time === 'string') patch.payload.time = req.body.time;
      if (typeof req.body.serverName === 'string') patch.payload.serverName = req.body.serverName;
      if (typeof req.body.modlist === 'string') patch.payload.modlist = req.body.modlist;
      if (typeof req.body.modlistPlayer === 'string') patch.payload.modlistPlayer = req.body.modlistPlayer;
      if (typeof req.body.modlistServer === 'string') patch.payload.modlistServer = req.body.modlistServer;
      if (typeof req.body.tsAddress === 'string') patch.payload.tsAddress = req.body.tsAddress;
      if (typeof req.body.campaignId === 'number' || req.body.campaignId === null) patch.payload.campaignId = req.body.campaignId;
      if (Array.isArray(req.body.squads)) {
        const assignedBySlot = new Map((existing.payload?.squads || []).flatMap((squad) => squad.slots || []).map((slot) => [String(slot.id), slot.assignedUserId ?? null]));
        patch.payload.squads = req.body.squads.map((squad) => ({
          ...squad,
          slots: (squad.slots || []).map((slot) => ({
            ...slot,
            assignedUserId: assignedBySlot.has(String(slot.id)) ? assignedBySlot.get(String(slot.id)) : (slot.assignedUserId ?? null)
          }))
        }));
      }
    }
    const updated = await opsRepo.updateOp(Number(req.params.id), patch);
    const changes = [];
    if (typeof req.body.modlist === 'string' && req.body.modlist !== (existing.payload?.modlist || '')) changes.push('modlist');
    if (typeof req.body.modlistPlayer === 'string' && req.body.modlistPlayer !== (existing.payload?.modlistPlayer || '')) changes.push('player modlist');
    if (typeof req.body.modlistServer === 'string' && req.body.modlistServer !== (existing.payload?.modlistServer || '')) changes.push('server modlist');
    if (typeof req.body.date === 'string' && req.body.date !== (existing.payload?.date || '')) changes.push('date');
    if (typeof req.body.time === 'string' && req.body.time !== (existing.payload?.time || '')) changes.push('time');
    if (typeof req.body.serverName === 'string' && req.body.serverName !== (existing.payload?.serverName || '')) changes.push('server');
    if (typeof req.body.tsAddress === 'string' && req.body.tsAddress !== (existing.payload?.tsAddress || '')) changes.push('TeamSpeak address');
    if (Array.isArray(req.body.squads)) changes.push('squad layout');
    if (changes.length) {
      const type = changes.some((item) => item.includes('modlist')) ? 'modlist_changed' : 'operation_changed';
      await notifyOperationChange(req, updated, type, `The missionmaker updated the ${changes.join(', ')}.`, { changes });
    }
    res.json({ op: updated });
  } catch (err) {
    console.error('Update op error', err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

app.delete('/api/ops/:id', authMiddleware, requireCapability('edit_operations'), async (req, res) => {
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

app.put('/api/roles/rename', authMiddleware, requireCapability('edit_roles'), async (req, res) => {
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

  const renameInSquads = (squads) => {
    (squads || []).forEach((squad) => renameInSlots(squad.slots));
  };

  data.templates.forEach((t) => renameInSquads(t.squads));
  (data.ops || []).forEach((op) => renameInSquads(op.squads));
  (data.recurrences || []).forEach((rec) => renameInSquads(rec.squads));

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
app.post('/api/admin/clear-db', authMiddleware, requireCapability('manage_backups'), async (req, res) => {
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
app.post('/api/admin/clear-db-stream', authMiddleware, requireCapability('manage_backups'), async (req, res) => {
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

app.post('/api/roles', authMiddleware, requireCapability('edit_roles'), async (req, res) => {
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

app.delete('/api/roles/:id', authMiddleware, requireCapability('edit_roles'), async (req, res) => {
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

app.post('/api/ranks', authMiddleware, requireCapability('edit_ranks'), async (req, res) => {
  const data = await getData();
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Name required' });
  const rank = {
    name,
    short: (req.body.short || '').trim(),
    icon: typeof req.body.icon === 'string' ? req.body.icon : null,
    order: Number(req.body.order) || ((data.ranks || []).length + 1)
  };
  const [result] = await pool.query('INSERT INTO ranks (name, abbreviation, order_index, icon) VALUES (?, ?, ?, ?)', [rank.name, rank.short, rank.order, rank.icon]);
  rank.id = result.insertId;
  res.json({ rank });
});

app.put('/api/ranks/:id', authMiddleware, requireCapability('edit_ranks'), async (req, res) => {
  const data = await getData();
  const rank = (data.ranks || []).find((r) => r.id === Number(req.params.id));
  if (!rank) return res.status(404).json({ error: 'Rank not found' });
  if (typeof req.body.name === 'string') rank.name = req.body.name.trim();
  if (typeof req.body.short === 'string') rank.short = req.body.short.trim();
  if ('icon' in req.body) rank.icon = req.body.icon || null;
  if ('order' in req.body) rank.order = Number(req.body.order) || rank.order;
  await pool.query('UPDATE ranks SET name = ?, abbreviation = ?, order_index = ?, icon = ? WHERE id = ?', [rank.name, rank.short, rank.order, rank.icon, rank.id]);
  res.json({ rank });
});

app.delete('/api/ranks/:id', authMiddleware, requireCapability('edit_ranks'), async (req, res) => {
  const data = await getData();
  const idx = (data.ranks || []).findIndex((r) => r.id === Number(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Rank not found' });
  const removed = data.ranks[idx];
  // Clean up user references (if users stored rank by id or by name)
  await pool.query('UPDATE users SET `rank` = NULL WHERE `rank` IN (?, ?)', [String(removed.id), removed.name]);
  await pool.query('DELETE FROM ranks WHERE id = ?', [removed.id]);
  res.status(204).end();
});

// Squad types API: CRUD stored in DB (exposed to admins for edit)
app.get('/api/squad-types', async (req, res) => {
  const data = await getData();
  const squadTypes = Array.isArray(data.squadTypes) ? data.squadTypes : [];
  res.json({ squadTypes });
});

app.post('/api/squad-types', authMiddleware, requireCapability('edit_squad_types'), async (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Name required' });
  const st = { name, icon: typeof req.body.icon === 'string' ? req.body.icon : null };
  const [result] = await pool.query('INSERT INTO squad_types (name, icon) VALUES (?, ?)', [st.name, st.icon]);
  st.id = result.insertId;
  res.json({ squadType: st });
});

app.put('/api/squad-types/:id', authMiddleware, requireCapability('edit_squad_types'), async (req, res) => {
  const data = await getData();
  const st = (data.squadTypes || []).find((s) => s.id === Number(req.params.id));
  if (!st) return res.status(404).json({ error: 'Squad type not found' });
  if (typeof req.body.name === 'string') st.name = req.body.name.trim();
  if ('icon' in req.body) st.icon = req.body.icon || null;
  await pool.query('UPDATE squad_types SET name = ?, icon = ? WHERE id = ?', [st.name, st.icon, st.id]);
  res.json({ squadType: st });
});

app.delete('/api/squad-types/:id', authMiddleware, requireCapability('edit_squad_types'), async (req, res) => {
  const data = await getData();
  const idx = (data.squadTypes || []).findIndex((s) => s.id === Number(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Squad type not found' });
  await pool.query('DELETE FROM squad_types WHERE id = ?', [data.squadTypes[idx].id]);
  res.status(204).end();
});

app.delete('/api/recurrences/:id', authMiddleware, requireCapability('edit_operations'), async (req, res) => {
  const data = await getData();
  const recurrenceIndex = (data.recurrences || []).findIndex((recurrence) => recurrence.id === Number(req.params.id));
  if (recurrenceIndex === -1) return res.status(404).json({ error: 'Recurrence not found' });
  data.recurrences.splice(recurrenceIndex, 1);
  await persistData(data);
  res.status(204).end();
});

app.put('/api/recurrences/:id', authMiddleware, requireCapability('edit_operations'), async (req, res) => {
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
  if (typeof req.body.serverName === 'string') recurrence.serverName = req.body.serverName;
  if (typeof req.body.modlist === 'string') recurrence.modlist = req.body.modlist;
  if (typeof req.body.modlistPlayer === 'string') recurrence.modlistPlayer = req.body.modlistPlayer;
  if (typeof req.body.modlistServer === 'string') recurrence.modlistServer = req.body.modlistServer;
  if (typeof req.body.tsAddress === 'string') recurrence.tsAddress = req.body.tsAddress;
  if ('campaignId' in req.body) recurrence.campaignId = req.body.campaignId ?? null;
  if (Array.isArray(req.body.squads)) recurrence.squads = structuredClone(req.body.squads);

  const baseDateTime = `${recurrence.startDate}T${recurrence.time || '00:00'}:00`;
  const base = new Date(baseDateTime);
  recurrence.nextDateTime = base > new Date() ? base.toISOString() : getNextRecurrenceDate(baseDateTime, recurrence);
  if (recurrence.repeatUntil && recurrence.nextDateTime && new Date(recurrence.repeatUntil) < new Date(recurrence.nextDateTime)) {
    recurrence.nextDateTime = null;
  }

  await persistData(data);
  res.json({ recurrence });
});

app.put('/api/recurrences/:id/absence', authMiddleware, async (req, res) => {
  try {
    if (typeof req.body.absent !== 'boolean') return res.status(400).json({ error: 'absent must be a boolean' });
    const [rows] = await pool.query('SELECT id, op_id, rule, next_run FROM recurrences WHERE id = ?', [Number(req.params.id)]);
    if (!rows[0]) return res.status(404).json({ error: 'Recurrence not found' });
    let rule = rows[0].rule || {};
    if (typeof rule === 'string') { try { rule = JSON.parse(rule); } catch { rule = {}; } }
    if (req.body.absent) await pool.query('INSERT IGNORE INTO recurrence_absences (recurrence_id, user_id) VALUES (?, ?)', [rows[0].id, req.user.id]);
    else await pool.query('DELETE FROM recurrence_absences WHERE recurrence_id = ? AND user_id = ?', [rows[0].id, req.user.id]);
    const [absences] = await pool.query('SELECT user_id FROM recurrence_absences WHERE recurrence_id = ? ORDER BY user_id', [rows[0].id]);
    rule.absentUserIds = absences.map((row) => row.user_id);
    res.json({ recurrence: { id: rows[0].id, opId: rows[0].op_id, rule, absentUserIds: rule.absentUserIds, nextRun: rows[0].next_run } });
  } catch (err) {
    console.error('Recurring operation absence error', err);
    res.status(500).json({ error: err.message || 'Could not update recurring absence' });
  }
});


app.delete('/api/templates/:id', authMiddleware, requireCapability('edit_templates'), (req, res) => {
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

app.post('/api/templates/:templateId/squads', authMiddleware, requireCapability('edit_templates'), (req, res) => {
  (async () => {
    try {
      console.debug('POST /api/templates/:templateId/squads', { templateId: req.params.templateId, body: req.body });
      const tplRepo = await import('./repositories/templates.js');
      const templateId = Number(req.params.templateId);
      const template = await tplRepo.getTemplateById(templateId);
      if (!template) return res.status(404).json({ error: 'Template not found' });
      const squad = await tplRepo.addSquad(templateId, {
        title: req.body.title || 'New squad',
        lrChannel: 1,
        srChannel: (template.data.squads || []).length + 1,
        marker: req.body.marker || null,
        markerIconUrl: req.body.markerIconUrl || null,
        slots: []
      });
      res.json({ squad });
    } catch (err) {
      console.error('Add squad error', err && err.stack ? err.stack : err);
      res.status(500).json({ error: err.message || 'Server error' });
    }
  })();
});

function isValidChannel(value) {
  const num = Number(value);
  return Number.isInteger(num) && num >= 0 && num <= 99;
}

app.put('/api/templates/:templateId/squads/:squadId', authMiddleware, requireCapability('edit_templates'), async (req, res) => {
    try {
      const tplRepo = await import('./repositories/templates.js');
      const template = await tplRepo.getTemplateById(Number(req.params.templateId));
      if (!template) return res.status(404).json({ error: 'Template not found' });
      let squad = (template.data.squads || []).find((item) => item.id === Number(req.params.squadId));
      if (!squad) return res.status(404).json({ error: 'Squad not found' });
      if (typeof req.body.title === 'string' && req.body.title.trim()) squad.title = req.body.title.trim();
      if ('lrChannel' in req.body) { if (!isValidChannel(req.body.lrChannel)) return res.status(400).json({ error: 'lrChannel must be between 0 and 99' }); squad.lrChannel = Number(req.body.lrChannel); }
      if ('srChannel' in req.body) { if (!isValidChannel(req.body.srChannel)) return res.status(400).json({ error: 'srChannel must be between 0 and 99' }); squad.srChannel = Number(req.body.srChannel); }
      if ('marker' in req.body) { if (req.body.marker === null) squad.marker = null; else if (typeof req.body.marker === 'string') squad.marker = req.body.marker.trim(); else return res.status(400).json({ error: 'marker must be a string or null' }); }
      if ('markerIconUrl' in req.body) { if (req.body.markerIconUrl === null) squad.markerIconUrl = null; else if (typeof req.body.markerIconUrl === 'string') squad.markerIconUrl = req.body.markerIconUrl.trim(); else return res.status(400).json({ error: 'markerIconUrl must be a string or null' }); }
      if ('active' in req.body) { if (typeof req.body.active !== 'boolean') return res.status(400).json({ error: 'active must be a boolean' }); squad.active = req.body.active; }
      squad = await tplRepo.updateSquad(template.id, squad.id, squad);
      res.json({ squad });
    } catch (err) {
      console.error('Update squad error', err);
      res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/ops/:opId/squads', authMiddleware, requireCapability('edit_operations'), async (req, res) => {
  try {
    const opsRepo = await import('./repositories/ops.js');
    const op = await opsRepo.addSquad(Number(req.params.opId), req.body.title || null);
    if (!op) return res.status(404).json({ error: 'Operation not found' });
    res.json({ op });
  } catch (err) {
    console.error('Add op squad error', err && err.stack ? err.stack : err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

app.delete('/api/ops/:opId/squads/:squadId', authMiddleware, requireCapability('edit_operations'), async (req, res) => {
  try {
    const opsRepo = await import('./repositories/ops.js');
    const op = await opsRepo.getOpById(Number(req.params.opId));
    if (!op) return res.status(404).json({ error: 'Operation not found' });
    const squads = op.payload.squads || [];
    const idx = squads.findIndex((s) => s.id === Number(req.params.squadId));
    if (idx === -1) return res.status(404).json({ error: 'Squad not found' });
    squads.splice(idx, 1);
    op.payload.squads = squads;
    await opsRepo.updateOp(Number(req.params.opId), { payload: op.payload });
    const updated = await opsRepo.getOpById(Number(req.params.opId));
    res.json({ op: updated });
  } catch (err) {
    console.error('Delete op squad error', err && err.stack ? err.stack : err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

app.delete('/api/templates/:templateId/squads/:squadId', authMiddleware, requireCapability('edit_templates'), async (req, res) => {
  console.debug('DELETE /api/templates/:templateId/squads/:squadId', { templateId: req.params.templateId, squadId: req.params.squadId });
  const tplRepo = await import('./repositories/templates.js');
  const templateId = Number(req.params.templateId);
  const template = await tplRepo.getTemplateById(templateId);
  if (!template) return res.status(404).json({ error: 'Template not found' });

  const squadIndex = template.data.squads.findIndex((item) => item.id === Number(req.params.squadId));
  if (squadIndex === -1) return res.status(404).json({ error: 'Squad not found' });

  try {
    await tplRepo.deleteSquad(templateId, Number(req.params.squadId));
    res.status(204).end();
  } catch (err) {
    console.error('Delete squad persist error', err && err.stack ? err.stack : err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

app.put('/api/templates/:templateId/squads/:squadId/slots/reorder', authMiddleware, requireCapability('edit_templates'), async (req, res) => {
  const tplRepo = await import('./repositories/templates.js');
  const templateId = Number(req.params.templateId);
  const template = await tplRepo.getTemplateById(templateId);
  if (!template) return res.status(404).json({ error: 'Template not found' });

  const squad = template.data.squads.find((item) => item.id === Number(req.params.squadId));
  if (!squad) return res.status(404).json({ error: 'Squad not found' });

  const slotIds = Array.isArray(req.body.slotIds) ? req.body.slotIds.map(Number) : null;
  if (!slotIds) return res.status(400).json({ error: 'slotIds must be an array' });

  const currentIds = squad.slots.map((slot) => Number(slot.id));
  const uniqueSlotIds = new Set(slotIds);
  if (
    slotIds.length !== currentIds.length
    || uniqueSlotIds.size !== slotIds.length
    || currentIds.some((id) => !uniqueSlotIds.has(id))
  ) {
    return res.status(400).json({ error: 'slotIds do not match squad slots' });
  }

  const slotMap = new Map(squad.slots.map((slot) => [Number(slot.id), slot]));
  await tplRepo.reorderSlots(templateId, squad.id, slotIds);
  const updated = await tplRepo.getTemplateById(templateId);
  res.json({ squad: updated.data.squads.find((item) => item.id === squad.id) });
});

app.post('/api/templates/:id/slots', authMiddleware, requireCapability('edit_templates'), async (req, res) => {
  try {
    console.debug('POST /api/templates/:id/slots', { templateId: req.params.id, body: req.body });
    const tplRepo = await import('./repositories/templates.js');
    const templateId = Number(req.params.id);
    const template = await tplRepo.getTemplateById(templateId);
    if (!template) return res.status(404).json({ error: 'Template not found' });
    const squad = template.data.squads.find((squad) => squad.id === Number(req.body.squadId));
    if (!squad) return res.status(404).json({ error: 'Squad not found' });

    const slot = await tplRepo.addSlot(templateId, squad.id, {
      name: req.body.name || 'New role',
      role: req.body.role || 'Rifleman',
      allowedRoles: Array.isArray(req.body.allowedRoles) ? req.body.allowedRoles : [],
      notes: req.body.notes || '',
      assignedUserId: null
    });
    res.json({ slot });
  } catch (err) {
    console.error('Add slot error', err && err.stack ? err.stack : err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

app.put('/api/templates/:templateId/slots/:slotId', authMiddleware, requireCapability('edit_templates'), async (req, res) => {
  const tplRepo = await import('./repositories/templates.js');
  const templateId = Number(req.params.templateId);
  const template = await tplRepo.getTemplateById(templateId);
  if (!template) return res.status(404).json({ error: 'Template not found' });
  const slot = findSlot({ squads: template.data.squads }, req.params.slotId);
  if (!slot) return res.status(404).json({ error: 'Slot not found' });
  if (typeof req.body.name === 'string') slot.name = req.body.name;
  if (typeof req.body.role === 'string') slot.role = req.body.role;
  if (Array.isArray(req.body.allowedRoles)) slot.allowedRoles = req.body.allowedRoles;
  if (typeof req.body.notes === 'string') slot.notes = req.body.notes;
  await tplRepo.updateSlot(templateId, slot.id, slot);
  res.json({ slot });
});

app.delete('/api/templates/:templateId/slots/:slotId', authMiddleware, requireCapability('edit_templates'), async (req, res) => {
  const tplRepo = await import('./repositories/templates.js');
  const templateId = Number(req.params.templateId);
  const template = await tplRepo.getTemplateById(templateId);
  if (!template) return res.status(404).json({ error: 'Template not found' });
  let slotRemoved = false;
  template.data.squads.forEach((squad) => {
    const index = squad.slots.findIndex((slot) => slot.id === Number(req.params.slotId));
    if (index !== -1) {
      slotRemoved = true;
    }
  });
  if (!slotRemoved) return res.status(404).json({ error: 'Slot not found' });
  await tplRepo.deleteSlot(templateId, Number(req.params.slotId));
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
  const existingSlot = template.squads.flatMap((squad) => squad.slots).find((other) => other.assignedUserId === req.user.id);
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

app.post('/api/upload', authMiddleware, requireCapability('edit_settings'), (req, res) => {
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
app.post('/api/upload/custom-marker', authMiddleware, requireCapability('edit_operations'), (req, res) => {
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
          await pool.query('INSERT INTO user_profiles (user_id, display_name, bio, avatar_url, settings) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE avatar_url=VALUES(avatar_url)', [req.user.id, null, null, `/uploads/${req.file.filename}`, JSON.stringify({})]);
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
  app.get('/api/backup', authMiddleware, requireCapability('manage_backups'), async (req, res) => {
    try {
      const data = normalizeStorage(await _readData());
      const trainingTables = ['training_settings','trainer_role_rights','training_requests','training_sessions','training_participants','training_proposals','training_audit'];
      data.training = {};
      for (const table of trainingTables) {
        const [rows] = await pool.query(`SELECT * FROM \`${table}\``);
        data.training[table] = rows;
      }
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
  app.post('/api/backup/import', authMiddleware, requireCapability('manage_backups'), async (req, res) => {
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

      const allowedKeys = new Set(['users', 'templates', 'ops', 'recurrences', 'ranks', 'campaigns', 'slots', 'roles', 'training']);
      const nextData = { ...currentData };

      for (const key of selectedSections) {
        if (!allowedKeys.has(key)) continue;
        if (key in backupData) {
          nextData[key] = backupData[key];
        }
      }

      // Always keep current uploads unless restoreUploads is true
      await persistData(nextData);
      if (selectedSections.includes('training') && backupData.training && typeof backupData.training === 'object') {
        const trainingTables = ['training_settings','trainer_role_rights','training_requests','training_sessions','training_participants','training_proposals','training_audit'];
        const deleteOrder = [...trainingTables].reverse();
        const jsonColumns = { training_audit: ['details'] };
        const conn = await pool.getConnection();
        try {
          await conn.beginTransaction();
          for (const table of deleteOrder) await conn.query(`DELETE FROM \`${table}\``);
          for (const table of trainingTables) {
            const rows = Array.isArray(backupData.training[table]) ? backupData.training[table] : [];
            for (const source of rows) {
              const row = { ...source };
              for (const column of jsonColumns[table] || []) if (row[column] != null && typeof row[column] !== 'string') row[column] = JSON.stringify(row[column]);
              await conn.query(`INSERT INTO \`${table}\` SET ?`, [row]);
            }
          }
          await conn.commit();
        } catch (error) {
          await conn.rollback();
          throw error;
        } finally { conn.release(); }
      }
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

// Setup and database administration are available only to authorized accounts.
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
  console.info(`Server running on http://localhost:${PORT}`);
  try {
    await ensureDbInitialized();
    console.info('Schema check complete');
    await generateRecurringOps();
    const recurrenceTimer = setInterval(() => {
      generateRecurringOps().catch((error) => console.error('Recurring operation generation failed', { err: error.message }));
    }, 30_000);
    recurrenceTimer.unref();
  } catch (e) {
    console.error('Schema check failed', { err: e.message });
  }
});
