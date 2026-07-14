import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import multer from 'multer';
import dotenv from 'dotenv';
import pool from './db.js';
import { readData as _readData, writeData as _writeData, ensureInitialized as ensureDbInitialized } from './lib/dataStore.js';

dotenv.config();

async function testDb() {
  try {
    const [rows] = await pool.query('SELECT 1 AS ok');
    console.log('DB connected:', rows);
  } catch (err) {
    console.error('DB connection error:', err.message);
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

/** Ensure the data file and containing directory exist.
 * If the data file is missing it will be initialized with a small example dataset.
 */
// Initialize DB-backed storage
async function ensureDataFile() {
  await ensureDbInitialized();
}

/** Async helper: read and normalize stored data from DB. */
async function getData() {
  const raw = await _readData();
  return normalizeStorage(raw);
}

/** Write the provided data object back to the JSON storage file. */
async function persistData(data) {
  await _writeData(data);
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
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
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
  // Map each template section into an op section, keeping lr/sr/marker defaults
  return (template.sections || []).map((section, index) => {
    const existingSection = existingSections.find((item) => item.id === section.id);

    return {
      id: section.id,
      title: section.title,
        lrChannel: section.lrChannel ?? existingSection?.lrChannel ?? 1,
        srChannel: section.srChannel ?? existingSection?.srChannel ?? (index + 1),
        marker: section.marker ?? existingSection?.marker ?? null,
        markerIconUrl: section.markerIconUrl ?? existingSection?.markerIconUrl ?? null,
      slots: (section.slots || []).map((slot) => {
        const existingSlot = existingSection?.slots?.find((item) => item.id === slot.id);

        return {
          id: slot.id,
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
  res.json({ users: safeUsers, templates: data.templates, ops: data.ops || [], campaigns: data.campaigns || [] });
});

app.get('/api/data', authMiddleware, async (req, res) => {
  const data = await getData();
  await generateRecurringOps(data);
  const safeUsers = data.users.map(({ password, ...rest }) => rest);
  res.json({ user: { id: req.user.id, username: req.user.username, role: req.user.role }, users: safeUsers, templates: data.templates, ops: data.ops || [], recurrences: data.recurrences || [], campaigns: data.campaigns || [] });
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
    const patch = { permissions: req.body.permissions || {}, rank: req.body.rank, status: req.body.status, role: req.body.role };
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
    const template = await tplRepo.getTemplateById(Number(req.body.templateId));
    if (!template) return res.status(404).json({ error: 'Template not found' });
    const recurrence = req.body.recurrence || 'none';
    const sections = buildOpSectionsFromTemplate({ sections: template.data.sections || [] });
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

app.post('/api/ops/:id/join', authMiddleware, async (req, res) => {
  try {
    const opsRepo = await import('./repositories/ops.js');
    const op = await opsRepo.getOpById(Number(req.params.id));
    if (!op) return res.status(404).json({ error: 'Operation not found' });
    const slot = op.payload.sections.flatMap((s) => s.slots).find((sl) => sl.id === Number(req.body.slotId));
    if (!slot) return res.status(404).json({ error: 'Slot not found' });
    if (!slot.allowedRoles.includes(req.user.role) && req.user.role !== 'admin') return res.status(403).json({ error: 'No permission for this slot' });
    const existingSlot = op.payload.sections.flatMap((s) => s.slots).find((other) => other.assignedUserId === req.user.id);
    if (existingSlot && existingSlot.id !== slot.id) return res.status(409).json({ error: 'You are already signed up to another slot for this operation' });
    if (slot.assignedUserId && slot.assignedUserId !== req.user.id) return res.status(409).json({ error: 'This slot is already taken' });
    const updated = await opsRepo.joinSlot(Number(req.params.id), Number(req.body.slotId), req.user.id);
    res.json({ op: updated });
  } catch (err) {
    console.error('Join slot error', err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

app.post('/api/ops/:id/signoff', authMiddleware, async (req, res) => {
  try {
    const opsRepo = await import('./repositories/ops.js');
    const updated = await opsRepo.signoffSlot(Number(req.params.id), Number(req.body.slotId), req.user.id);
    res.json({ op: updated });
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
    const patch = {};
    if (typeof req.body.name === 'string') patch.title = req.body.name;
    if (typeof req.body.date === 'string' || typeof req.body.time === 'string') patch.payload = {};
    if (typeof req.body.date === 'string') patch.payload.date = req.body.date;
    if (typeof req.body.time === 'string') patch.payload.time = req.body.time;
    if (typeof req.body.serverName === 'string') { patch.payload = patch.payload || {}; patch.payload.serverName = req.body.serverName; }
    if (typeof req.body.modlist === 'string') { patch.payload = patch.payload || {}; patch.payload.modlist = req.body.modlist; }
    if (typeof req.body.modlistPlayer === 'string') { patch.payload = patch.payload || {}; patch.payload.modlistPlayer = req.body.modlistPlayer; }
    if (typeof req.body.modlistServer === 'string') { patch.payload = patch.payload || {}; patch.payload.modlistServer = req.body.modlistServer; }
    if (typeof req.body.tsAddress === 'string') { patch.payload = patch.payload || {}; patch.payload.tsAddress = req.body.tsAddress; }
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

  await persistData(data);
  res.json({ ok: true });
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
      console.error('Add section error', err);
      res.status(500).json({ error: 'Server error' });
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

app.delete('/api/templates/:templateId/sections/:sectionId', authMiddleware, requireAdmin, async (req, res) => {
  const data = await getData();
  const template = findTemplate(data, req.params.templateId);
  if (!template) return res.status(404).json({ error: 'Template not found' });

  const sectionIndex = template.sections.findIndex((item) => item.id === Number(req.params.sectionId));
  if (sectionIndex === -1) return res.status(404).json({ error: 'Section not found' });

  template.sections.splice(sectionIndex, 1);
  await persistData(data);
  res.status(204).end();
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
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Upload failed' });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    (async () => {
      try {
        const filesRepo = await import('./repositories/files.js');
        const stat = await fs.promises.stat(path.join(UPLOADS_DIR, req.file.filename));
        await filesRepo.addFile({ filename: req.file.originalname, pathname: `/uploads/${req.file.filename}`, mimetype: req.file.mimetype, size: stat.size, ownerId: req.user?.id || null, metadata: {} });
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

      const allowedKeys = new Set(['users', 'templates', 'ops', 'recurrences', 'ranks', 'campaigns', 'slots']);
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

const distPath = path.join(process.cwd(), 'dist');

app.use(express.static(distPath));

app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
