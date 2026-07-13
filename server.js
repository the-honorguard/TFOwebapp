import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import multer from 'multer';

/*
 * server.js - minimal backend for development and local storage
 * - Provides basic REST endpoints under `/api/*` for users, templates, ops and recurrences
 * - Stores data in `data/app-data.json` (created automatically on first run)
 * - Simple token-based auth (JWT) and role checks are implemented for admin/missionmaker paths
 */
const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;
const SECRET = 'tfo-secret';
const DATA_FILE = path.join(process.cwd(), 'data', 'app-data.json');
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
const ALLOWED_UPLOAD_EXTENSIONS = new Set(['.html', '.htm', '.txt', '.json', '.svg', '.png', '.jpg', '.jpeg', '.gif']);

const RANKS_BASE_URL = 'https://raw.githubusercontent.com/task-force-omega/mkdocs/main/docs/assets/images/Ranks/small50';

const DEFAULT_RANKS = [
  { id: 1,  name: 'Recruit',                short: 'RCT.',  order: 1,  icon: `${RANKS_BASE_URL}/RCT.png` },
  { id: 2,  name: 'Private',                short: 'PVT.',  order: 2,  icon: `${RANKS_BASE_URL}/PVTBlack.png` },
  { id: 3,  name: 'Private First Class',    short: 'PFC.',  order: 3,  icon: `${RANKS_BASE_URL}/PFCBlack.png` },
  { id: 4,  name: 'Specialist First Class', short: 'SPC1.', order: 4,  icon: `${RANKS_BASE_URL}/SPC1Black.png` },
  { id: 5,  name: 'Specialist Second Class',short: 'SPC2.', order: 5,  icon: `${RANKS_BASE_URL}/SPC2Black.png` },
  { id: 6,  name: 'Specialist Third Class', short: 'SPC3.', order: 6,  icon: `${RANKS_BASE_URL}/SPC3Black.png` },
  { id: 7,  name: 'Master Specialist',      short: 'MSP.',  order: 7,  icon: `${RANKS_BASE_URL}/MSPBlack.png` },
  { id: 8,  name: 'Corporal',               short: 'CPL.',  order: 8,  icon: `${RANKS_BASE_URL}/CPLBlack.png` },
  { id: 9,  name: 'Sergeant',               short: 'SGT.',  order: 9,  icon: `${RANKS_BASE_URL}/SGTBlack.png` },
  { id: 10, name: 'Staff Sergeant',         short: 'SSG.',  order: 10, icon: `${RANKS_BASE_URL}/SSGBlack.png` },
  { id: 11, name: 'Master Sergeant',        short: 'MSG.',  order: 11, icon: `${RANKS_BASE_URL}/MSGBlack.png` },
  { id: 12, name: 'Second Lieutenant',      short: '2LT.',  order: 12, icon: `${RANKS_BASE_URL}/2LT.png` },
  { id: 13, name: 'First Lieutenant',       short: '1LT.',  order: 13, icon: `${RANKS_BASE_URL}/1LT.png` },
  { id: 14, name: 'Captain',                short: 'CPT.',  order: 14, icon: `${RANKS_BASE_URL}/CPT.png` },
  { id: 15, name: 'Major',                  short: 'MAJ.',  order: 15, icon: `${RANKS_BASE_URL}/MAJ.png` },
];

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
function ensureDataFile() {
  if (!fs.existsSync(path.dirname(DATA_FILE))) {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    const initial = {
      users: [
        { id: 1, username: 'admin', password: bcrypt.hashSync('admin123', 10), role: 'admin' }
      ],
      templates: [
        {
          id: 1,
          name: 'Example mission',
          sections: [
            {
              id: 101,
              title: 'Missionmaker/HQ',
              slots: [
                { id: 1001, name: 'HQ', role: 'HQ', allowedRoles: ['admin', 'member'], notes: 'Callsign: HQ', assignedUserId: null },
                { id: 1002, name: 'Co-Zeus', role: 'HQ', allowedRoles: ['admin', 'member'], notes: '', assignedUserId: null }
              ]
            },
            {
              id: 102,
              title: 'Platoon Element',
              slots: [
                { id: 1003, name: 'PLT leader', role: 'Plt leader', allowedRoles: ['member'], notes: 'SR channel: 1', assignedUserId: null },
                { id: 1004, name: 'Grenadier 60mm', role: 'Grenadier', allowedRoles: ['member'], notes: '', assignedUserId: null }
              ]
            },
            {
              id: 103,
              title: 'Infantry Squad Alpha',
              slots: [
                { id: 1005, name: 'SQL', role: 'Teamlead', allowedRoles: ['member'], notes: '', assignedUserId: null },
                { id: 1006, name: 'Medic', role: 'Medic', allowedRoles: ['member'], notes: '', assignedUserId: null },
                { id: 1007, name: 'Rifleman (LAT)', role: 'Rifleman', allowedRoles: ['member'], notes: '', assignedUserId: null }
              ]
            }
          ]
        }
      ],
        ops: [],
        campaigns: [],
      recurrences: [],
      ranks: DEFAULT_RANKS
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2));
  }
}

/** Read and normalize the stored data from disk. Always calls `ensureDataFile`. */
function readData() {
  ensureDataFile();
  return normalizeStorage(JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')));
}

/** Write the provided data object back to the JSON storage file. */
function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
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
  // Seed default ranks if the data file has none
  if (!data.ranks || data.ranks.length === 0) {
    data.ranks = DEFAULT_RANKS;
  }
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
function generateRecurringOps(data) {
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
  if (changed) writeData(data);
}

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const data = readData();
  const user = data.users.find((u) => u.username === username);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  const ok = bcrypt.compareSync(password, user.password);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
  const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, SECRET, { expiresIn: '8h' });
  res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
});

app.post('/api/signup', (req, res) => {
  const data = readData();
  const username = (req.body.username || '').trim();
  if (!username) return res.status(400).json({ error: 'Username required' });
  if (data.users.find((u) => u.username === username)) return res.status(409).json({ error: 'User already exists' });
  // Signup always creates a 'member' account; missionmaker must be assigned by an admin
  const role = 'member';
  const user = {
    id: Date.now(),
    username,
    password: bcrypt.hashSync(req.body.password || 'changeme', 10),
    role,
    rank: req.body.rank || '',
    status: req.body.status || 'Active',
    permissions: {},
    profile: req.body.profile || {}
  };
  data.users.push(user);
  writeData(data);
  const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, SECRET, { expiresIn: '8h' });
  const { password: _, ...safeUser } = user;
  res.json({ token, user: safeUser });
});

app.get('/api/public-data', (req, res) => {
  const data = normalizeStorage(readData());
  generateRecurringOps(data);
  const safeUsers = data.users.map(({ password, ...rest }) => rest);
  res.json({ users: safeUsers, templates: data.templates, ops: data.ops || [], campaigns: data.campaigns || [] });
});

app.get('/api/data', authMiddleware, (req, res) => {
  const data = normalizeStorage(readData());
  generateRecurringOps(data);
  const safeUsers = data.users.map(({ password, ...rest }) => rest);
  res.json({ user: { id: req.user.id, username: req.user.username, role: req.user.role }, users: safeUsers, templates: data.templates, ops: data.ops || [], recurrences: data.recurrences || [], campaigns: data.campaigns || [] });
});

app.post('/api/users', authMiddleware, requireAdmin, (req, res) => {
  const data = readData();
  const user = {
    id: Date.now(),
    username: req.body.username,
    password: bcrypt.hashSync(req.body.password || 'changeme', 10),
    role: req.body.role || 'member',
    rank: req.body.rank || '',
    status: req.body.status || 'Active',
    permissions: req.body.permissions || {}
  };
  data.users.push(user);
  writeData(data);
  const { password: _, ...safeUser } = user;
  res.json({ user: safeUser });
});

app.put('/api/users/:id/permissions', authMiddleware, requireAdmin, (req, res) => {
  const data = readData();
  const user = data.users.find((u) => u.id === Number(req.params.id));
  if (!user) return res.status(404).json({ error: 'User not found' });
  user.permissions = req.body.permissions || user.permissions || {};
  user.rank = req.body.rank ?? user.rank;
  user.status = req.body.status ?? user.status;
  user.role = req.body.role ?? user.role;
  writeData(data);
  const { password: _, ...safeUser } = user;
  res.json({ user: safeUser });
});

app.delete('/api/users/:id', authMiddleware, requireAdmin, (req, res) => {
  const data = readData();
  const userIndex = data.users.findIndex((u) => u.id === Number(req.params.id));
  if (userIndex === -1) return res.status(404).json({ error: 'User not found' });
  data.users.splice(userIndex, 1);
  writeData(data);
  res.status(204).end();
});

app.put('/api/users/me/password', authMiddleware, (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new password are required' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }

  const data = readData();
  const user = data.users.find((u) => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const ok = bcrypt.compareSync(currentPassword, user.password);
  if (!ok) return res.status(401).json({ error: 'Current password is incorrect' });

  user.password = bcrypt.hashSync(newPassword, 10);
  writeData(data);
  res.json({ ok: true });
});

app.post('/api/templates', authMiddleware, requireAdmin, (req, res) => {
  const data = readData();
  const template = { id: Date.now(), name: req.body.name, sections: [] };
  data.templates.push(template);
  writeData(data);
  res.json({ template });
});

app.put('/api/templates/:id', authMiddleware, requireAdmin, (req, res) => {
  const data = readData();
  const template = findTemplate(data, req.params.id);
  if (!template) return res.status(404).json({ error: 'Template not found' });
  if (typeof req.body.name === 'string') template.name = req.body.name;
  writeData(data);
  res.json({ template });
});

app.post('/api/templates/:id/duplicate', authMiddleware, requireAdmin, (req, res) => {
  const data = readData();
  const source = findTemplate(data, req.params.id);
  if (!source) return res.status(404).json({ error: 'Template not found' });

  const nextId = () => Date.now() + Math.floor(Math.random() * 10000);

  const newTemplate = {
    id: nextId(),
    name: typeof req.body.name === 'string' && req.body.name.trim() ? req.body.name.trim() : `Copy of ${source.name}`,
    sections: (source.sections || []).map((section) => ({
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

  data.templates.push(newTemplate);
  writeData(data);
  res.json({ template: newTemplate });
});

// Campaigns API
app.get('/api/campaigns', (req, res) => {
  const data = normalizeStorage(readData());
  res.json({ campaigns: data.campaigns || [] });
});

app.post('/api/campaigns', authMiddleware, (req, res) => {
  const data = normalizeStorage(readData());
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
  writeData(data);
  res.json({ campaign });
});

app.put('/api/campaigns/:id', authMiddleware, (req, res) => {
  const data = normalizeStorage(readData());
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

  writeData(data);
  res.json({ campaign });
});

app.delete('/api/campaigns/:id', authMiddleware, requireAdmin, (req, res) => {
  const data = normalizeStorage(readData());
  const idx = (data.campaigns || []).findIndex((c) => c.id === Number(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Campaign not found' });
  data.campaigns.splice(idx, 1);
  writeData(data);
  res.status(204).end();
});

app.post('/api/ops', authMiddleware, requireAdmin, (req, res) => {
  const data = normalizeStorage(readData());
  const template = findTemplate(data, req.body.templateId);
  if (!template) return res.status(404).json({ error: 'Template not found' });
  const recurrence = req.body.recurrence || 'none';
  const op = {
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
    sections: buildOpSectionsFromTemplate(template)
  };
  let recurrenceEntry = null;
  if (recurrence === 'none') {
    data.ops.push(op);
  } else {
    const nextDateTime = `${req.body.date}T${req.body.time || '00:00'}:00`;
    recurrenceEntry = {
      id: Date.now() + 1,
      name: op.name,
      templateId: op.templateId,
      recurrence,
      repeatUntil: req.body.recurrenceEndDate || null,
      startDate: req.body.date || '',
      time: req.body.time || '',
      weeklyDays: normalizeDays(req.body.weeklyDays),
      monthlyDay: req.body.monthlyDay || null,
      nextDateTime,
      sections: op.sections,
      createdAt: new Date().toISOString()
    };
    data.recurrences.push(recurrenceEntry);
  }
  writeData(data);
  res.json({ op: recurrence === 'none' ? op : null, recurrence: recurrenceEntry });
});

app.post('/api/ops/:id/join', authMiddleware, (req, res) => {
  const data = readData();
  const op = findOp(data, req.params.id);
  if (!op) return res.status(404).json({ error: 'Operation not found' });
  const slot = op.sections.flatMap((section) => section.slots).find((slotItem) => slotItem.id === Number(req.body.slotId));
  if (!slot) return res.status(404).json({ error: 'Slot not found' });
  if (!slot.allowedRoles.includes(req.user.role) && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'No permission for this slot' });
  }
  const existingSlot = op.sections.flatMap((section) => section.slots).find((other) => other.assignedUserId === req.user.id);
  if (existingSlot && existingSlot.id !== slot.id) {
    return res.status(409).json({ error: 'You are already signed up to another slot for this operation' });
  }
  if (slot.assignedUserId && slot.assignedUserId !== req.user.id) {
    return res.status(409).json({ error: 'This slot is already taken' });
  }
  slot.assignedUserId = req.user.id;
  writeData(data);
  res.json({ op });
});

app.post('/api/ops/:id/signoff', authMiddleware, (req, res) => {
  const data = readData();
  const op = findOp(data, req.params.id);
  if (!op) return res.status(404).json({ error: 'Operation not found' });

  const slot = op.sections.flatMap((section) => section.slots).find((slotItem) => slotItem.id === Number(req.body.slotId));
  if (!slot) return res.status(404).json({ error: 'Slot not found' });
  if (slot.assignedUserId !== req.user.id) {
    return res.status(403).json({ error: 'You are not assigned to this slot' });
  }

  slot.assignedUserId = null;
  writeData(data);
  res.json({ op });
});

app.put('/api/ops/:opId/sections/:sectionId', authMiddleware, (req, res) => {
  const data = readData();
  const op = findOp(data, req.params.opId);
  if (!op) return res.status(404).json({ error: 'Operation not found' });

  const section = (op.sections || []).find((item) => item.id === Number(req.params.sectionId));
  if (!section) return res.status(404).json({ error: 'Section not found' });

  const isAdminUser = req.user?.role === 'admin';
  const isMissionmaker = req.user?.role === 'missionmaker';

  if (!isAdminUser && !isMissionmaker) return res.status(403).json({ error: 'Forbidden' });

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

  writeData(data);
  res.json({ op });
});

app.put('/api/ops/:opId/slots/:slotId', authMiddleware, (req, res) => {
  const data = readData();
  const op = findOp(data, req.params.opId);
  if (!op) return res.status(404).json({ error: 'Operation not found' });

  const slot = findOpSlot(op, req.params.slotId);
  if (!slot) return res.status(404).json({ error: 'Slot not found' });

  const isAdminUser = req.user?.role === 'admin';
  const isMissionmaker = req.user?.role === 'missionmaker';

  if (!isAdminUser && !isMissionmaker) return res.status(403).json({ error: 'Forbidden' });

  if (typeof req.body.name === 'string') {
    slot.name = req.body.name;
  }
  if (typeof req.body.role === 'string') {
    slot.role = req.body.role;
  }
  if (typeof req.body.notes === 'string') slot.notes = req.body.notes;
  if (Array.isArray(req.body.allowedRoles)) slot.allowedRoles = req.body.allowedRoles;

  writeData(data);
  res.json({ op });
});

app.put('/api/ops/:id', authMiddleware, (req, res) => {
  const data = readData();
  const op = findOp(data, req.params.id);
  if (!op) return res.status(404).json({ error: 'Operation not found' });

  const isAdminUser = req.user?.role === 'admin';
  const isMissionmaker = req.user?.role === 'missionmaker';

  if (!isAdminUser && !isMissionmaker) return res.status(403).json({ error: 'Forbidden' });

  if (typeof req.body.name === 'string') op.name = req.body.name;
  if (typeof req.body.date === 'string') op.date = req.body.date;
  if (typeof req.body.time === 'string') op.time = req.body.time;
  if (typeof req.body.serverName === 'string') op.serverName = req.body.serverName;
  if (typeof req.body.modlist === 'string') op.modlist = req.body.modlist;
  if (typeof req.body.modlistPlayer === 'string') op.modlistPlayer = req.body.modlistPlayer;
  if (typeof req.body.modlistServer === 'string') op.modlistServer = req.body.modlistServer;
  if (typeof req.body.tsAddress === 'string') op.tsAddress = req.body.tsAddress;

  writeData(data);
  res.json({ op });
});

app.delete('/api/ops/:id', authMiddleware, requireAdmin, (req, res) => {
  const data = readData();
  const opIndex = (data.ops || []).findIndex((op) => op.id === Number(req.params.id));
  if (opIndex === -1) return res.status(404).json({ error: 'Operation not found' });
  data.ops.splice(opIndex, 1);
  writeData(data);
  res.status(204).end();
});

app.put('/api/roles/rename', authMiddleware, requireAdmin, (req, res) => {
  const { oldName, newName } = req.body;
  if (!oldName || !newName || oldName === newName) return res.status(400).json({ error: 'oldName and newName required' });

  const data = normalizeStorage(readData());

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

  writeData(data);
  res.json({ ok: true });
});

// Ranks API: simple CRUD for rank management
app.get('/api/ranks', (req, res) => {
  const data = normalizeStorage(readData());
  const ranks = (data.ranks || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
  res.json({ ranks });
});

app.post('/api/ranks', authMiddleware, requireAdmin, (req, res) => {
  const data = normalizeStorage(readData());
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
  writeData(data);
  res.json({ rank });
});

app.put('/api/ranks/:id', authMiddleware, requireAdmin, (req, res) => {
  const data = normalizeStorage(readData());
  const rank = (data.ranks || []).find((r) => r.id === Number(req.params.id));
  if (!rank) return res.status(404).json({ error: 'Rank not found' });
  if (typeof req.body.name === 'string') rank.name = req.body.name.trim();
  if (typeof req.body.short === 'string') rank.short = req.body.short.trim();
  if ('icon' in req.body) rank.icon = req.body.icon || null;
  if ('order' in req.body) rank.order = Number(req.body.order) || rank.order;
  writeData(data);
  res.json({ rank });
});

app.delete('/api/ranks/:id', authMiddleware, requireAdmin, (req, res) => {
  const data = normalizeStorage(readData());
  const idx = (data.ranks || []).findIndex((r) => r.id === Number(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Rank not found' });
  const removed = data.ranks.splice(idx, 1)[0];
  // Clean up user references (if users stored rank by id or by name)
  data.users.forEach((u) => {
    if (u.rank === removed.id || u.rank === removed.name) u.rank = '';
  });
  writeData(data);
  res.status(204).end();
});

app.delete('/api/recurrences/:id', authMiddleware, requireAdmin, (req, res) => {
  const data = normalizeStorage(readData());
  const recurrenceIndex = (data.recurrences || []).findIndex((recurrence) => recurrence.id === Number(req.params.id));
  if (recurrenceIndex === -1) return res.status(404).json({ error: 'Recurrence not found' });
  data.recurrences.splice(recurrenceIndex, 1);
  writeData(data);
  res.status(204).end();
});

app.put('/api/recurrences/:id', authMiddleware, requireAdmin, (req, res) => {
  const data = normalizeStorage(readData());
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

  writeData(data);
  res.json({ recurrence });
});


app.delete('/api/templates/:id', authMiddleware, requireAdmin, (req, res) => {
  const data = readData();
  const templateIndex = data.templates.findIndex((template) => template.id === Number(req.params.id));
  if (templateIndex === -1) return res.status(404).json({ error: 'Template not found' });
  data.templates.splice(templateIndex, 1);
  writeData(data);
  res.status(204).end();
});

app.post('/api/templates/:templateId/sections', authMiddleware, requireAdmin, (req, res) => {
  const data = readData();
  const template = findTemplate(data, req.params.templateId);
  if (!template) return res.status(404).json({ error: 'Template not found' });

  const section = {
    id: Date.now(),
    title: req.body.title || 'New section',
    lrChannel: 1,
    srChannel: template.sections.length + 1,
    marker: req.body.marker || null,
    markerIconUrl: req.body.markerIconUrl || null,
    slots: []
  };

  template.sections.push(section);
  writeData(data);
  res.json({ section });
});

function isValidChannel(value) {
  const num = Number(value);
  return Number.isInteger(num) && num >= 0 && num <= 99;
}

app.put('/api/templates/:templateId/sections/:sectionId', authMiddleware, requireAdmin, (req, res) => {
  const data = readData();
  const template = findTemplate(data, req.params.templateId);
  if (!template) return res.status(404).json({ error: 'Template not found' });

  const section = template.sections.find((item) => item.id === Number(req.params.sectionId));
  if (!section) return res.status(404).json({ error: 'Section not found' });

  if (typeof req.body.title === 'string' && req.body.title.trim()) {
    section.title = req.body.title.trim();
  }
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

  writeData(data);
  res.json({ section });
});

app.put('/api/ops/:opId/sections/:sectionId', authMiddleware, requireAdmin, (req, res) => {
  const data = readData();
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

  writeData(data);
  res.json({ op });
});

app.delete('/api/templates/:templateId/sections/:sectionId', authMiddleware, requireAdmin, (req, res) => {
  const data = readData();
  const template = findTemplate(data, req.params.templateId);
  if (!template) return res.status(404).json({ error: 'Template not found' });

  const sectionIndex = template.sections.findIndex((item) => item.id === Number(req.params.sectionId));
  if (sectionIndex === -1) return res.status(404).json({ error: 'Section not found' });

  template.sections.splice(sectionIndex, 1);
  writeData(data);
  res.status(204).end();
});

app.put('/api/templates/:templateId/sections/:sectionId/slots/reorder', authMiddleware, requireAdmin, (req, res) => {
  const data = readData();
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

  writeData(data);
  res.json({ section });
});

app.post('/api/templates/:id/slots', authMiddleware, requireAdmin, (req, res) => {
  const data = readData();
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
  writeData(data);
  res.json({ slot });
});

app.put('/api/templates/:templateId/slots/:slotId', authMiddleware, requireAdmin, (req, res) => {
  const data = readData();
  const template = findTemplate(data, req.params.templateId);
  if (!template) return res.status(404).json({ error: 'Template not found' });
  const slot = findSlot(template, req.params.slotId);
  if (!slot) return res.status(404).json({ error: 'Slot not found' });
  if (typeof req.body.name === 'string') slot.name = req.body.name;
  if (typeof req.body.role === 'string') slot.role = req.body.role;
  if (Array.isArray(req.body.allowedRoles)) slot.allowedRoles = req.body.allowedRoles;
  if (typeof req.body.notes === 'string') slot.notes = req.body.notes;
  writeData(data);
  res.json({ slot });
});

app.delete('/api/templates/:templateId/slots/:slotId', authMiddleware, requireAdmin, (req, res) => {
  const data = readData();
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
  writeData(data);
  res.status(204).end();
});

app.post('/api/templates/:templateId/join', authMiddleware, (req, res) => {
  const data = readData();
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
  writeData(data);
  res.json({ slot });
});

app.post('/api/upload', authMiddleware, requireAdmin, (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Upload failed' });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    res.json({ url: `/uploads/${req.file.filename}`, filename: req.file.originalname });
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
    res.json({ url: `/uploads/${req.file.filename}`, filename: req.file.originalname });
  });
});

// Allow authenticated users to upload an avatar image
app.post('/api/upload/avatar', authMiddleware, (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Upload failed' });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    // Persist avatar URL onto the user's profile
    try {
      const data = readData();
      const user = data.users.find((u) => u.id === req.user.id);
      if (!user) return res.status(404).json({ error: 'User not found' });
      user.profile = user.profile || {};
      user.profile.avatarUrl = `/uploads/${req.file.filename}`;
      writeData(data);
    } catch (e) {
      // ignore persistence errors for upload but report success URL
    }
    res.json({ url: `/uploads/${req.file.filename}`, filename: req.file.originalname });
  });
});

// Return full current user object (safe)
app.get('/api/users/me', authMiddleware, (req, res) => {
  const data = normalizeStorage(readData());
  const user = data.users.find((u) => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const { password, ...safeUser } = user;
  res.json({ user: safeUser });
});

// Update current user's profile (rank, status, profile object)
app.put('/api/users/me', authMiddleware, (req, res) => {
  const data = readData();
  const user = data.users.find((u) => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (typeof req.body.rank === 'string') user.rank = req.body.rank;
  if (typeof req.body.status === 'string') user.status = req.body.status;
  // Merge profile object shallowly
  if (req.body.profile && typeof req.body.profile === 'object') {
    user.profile = { ...(user.profile || {}), ...req.body.profile };
  }

  writeData(data);
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
