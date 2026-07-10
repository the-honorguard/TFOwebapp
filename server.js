import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';

const app = express();
const PORT = 3000;
const SECRET = 'tfo-secret';
const DATA_FILE = path.join(process.cwd(), 'data', 'app-data.json');

app.use(cors());
app.use(express.json());

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
          name: 'Voorbeeld missie',
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
      recurrences: []
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2));
  }
}

function readData() {
  ensureDataFile();
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

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

function normalizeStorage(data) {
  data.ops = data.ops || [];
  data.recurrences = data.recurrences || [];
  return data;
}

function normalizeDays(days) {
  if (!Array.isArray(days)) return [];
  return [...new Set(days.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))].sort((a, b) => a - b);
}

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

function getNextRecurrenceDate(dateTime, recurrence) {
  if (recurrence.recurrence === 'daily') return addInterval(dateTime, 'daily');
  if (recurrence.recurrence === 'weekly' || recurrence.recurrence === 'biweekly') return getNextWeeklyDate(dateTime, recurrence);
  if (recurrence.recurrence === 'monthly') return getNextMonthlyDate(dateTime, recurrence);
  return null;
}

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

app.get('/api/data', authMiddleware, (req, res) => {
  const data = normalizeStorage(readData());
  generateRecurringOps(data);
  const safeUsers = data.users.map(({ password, ...rest }) => rest);
  res.json({ user: { id: req.user.id, username: req.user.username, role: req.user.role }, users: safeUsers, templates: data.templates, ops: data.ops || [], recurrences: data.recurrences || [] });
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

app.post('/api/templates', authMiddleware, requireAdmin, (req, res) => {
  const data = readData();
  const template = { id: Date.now(), name: req.body.name, sections: [] };
  data.templates.push(template);
  writeData(data);
  res.json({ template });
});

app.post('/api/ops', authMiddleware, requireAdmin, (req, res) => {
  const data = normalizeStorage(readData());
  const template = findTemplate(data, req.body.templateId);
  if (!template) return res.status(404).json({ error: 'Template niet gevonden' });
  const recurrence = req.body.recurrence || 'none';
  const op = {
    id: Date.now(),
    name: req.body.name || 'Nieuwe operatie',
    templateId: Number(req.body.templateId),
    date: req.body.date || '',
    time: req.body.time || '',
    createdAt: new Date().toISOString(),
    sections: template.sections.map((section) => ({
      id: section.id,
      title: section.title,
      slots: section.slots.map((slot) => ({
        id: slot.id,
        name: slot.name,
        role: slot.role,
        allowedRoles: Array.isArray(slot.allowedRoles) ? slot.allowedRoles : [],
        notes: slot.notes || '',
        assignedUserId: null
      }))
    }))
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
  const op = (data.ops || []).find((entry) => entry.id === Number(req.params.id));
  if (!op) return res.status(404).json({ error: 'Op niet gevonden' });
  const slot = op.sections.flatMap((section) => section.slots).find((slotItem) => slotItem.id === Number(req.body.slotId));
  if (!slot) return res.status(404).json({ error: 'Slot niet gevonden' });
  if (!slot.allowedRoles.includes(req.user.role) && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Geen permissie voor deze slot' });
  }
  const existingSlot = op.sections.flatMap((section) => section.slots).find((other) => other.assignedUserId === req.user.id);
  if (existingSlot && existingSlot.id !== slot.id) {
    return res.status(409).json({ error: 'Je bent al ingeschreven in een andere slot van deze operatie' });
  }
  if (slot.assignedUserId && slot.assignedUserId !== req.user.id) {
    return res.status(409).json({ error: 'Deze slot is al ingenomen' });
  }
  slot.assignedUserId = req.user.id;
  writeData(data);
  res.json({ op });
});

app.delete('/api/ops/:id', authMiddleware, requireAdmin, (req, res) => {
  const data = readData();
  const opIndex = (data.ops || []).findIndex((op) => op.id === Number(req.params.id));
  if (opIndex === -1) return res.status(404).json({ error: 'Op niet gevonden' });
  data.ops.splice(opIndex, 1);
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

app.delete('/api/templates/:id', authMiddleware, requireAdmin, (req, res) => {
  const data = readData();
  const templateIndex = data.templates.findIndex((template) => template.id === Number(req.params.id));
  if (templateIndex === -1) return res.status(404).json({ error: 'Template not found' });
  data.templates.splice(templateIndex, 1);
  writeData(data);
  res.status(204).end();
});

app.post('/api/templates/:id/slots', authMiddleware, requireAdmin, (req, res) => {
  const data = readData();
  const template = findTemplate(data, req.params.id);
  if (!template) return res.status(404).json({ error: 'Template not found' });
  const section = template.sections.find((section) => section.id === Number(req.body.sectionId));
  if (!section) return res.status(404).json({ error: 'Section not found' });
  const slot = {
    id: Date.now(),
    name: req.body.name || 'Nieuwe rol',
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
    return res.status(403).json({ error: 'Geen permissie voor deze slot' });
  }
  const existingSlot = template.sections.flatMap((section) => section.slots).find((other) => other.assignedUserId === req.user.id);
  if (existingSlot && existingSlot.id !== slot.id) {
    return res.status(409).json({ error: 'Je bent al ingeschreven in een andere slot van deze template' });
  }
  if (slot.assignedUserId && slot.assignedUserId !== req.user.id) {
    return res.status(409).json({ error: 'Deze slot is al ingenomen' });
  }
  slot.assignedUserId = req.user.id;
  writeData(data);
  res.json({ slot });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
