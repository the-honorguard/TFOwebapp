import db from '../db.js';

export async function listOps() {
  const [rows] = await db.query('SELECT * FROM ops');
  return rows.map((r) => ({ id: r.id, templateId: r.template_id, title: r.title, payload: r.payload }));
}

export async function createOp({ id, templateId, title, payload }) {
  const [res] = await db.query('INSERT INTO ops (id, template_id, title, payload) VALUES (?, ?, ?, ?)', [id || null, templateId || null, title || null, JSON.stringify(payload || {})]);
  return { id: res.insertId || id, templateId, title, payload };
}

export async function getOpById(id) {
  const [rows] = await db.query('SELECT * FROM ops WHERE id = ?', [id]);
  if (!rows[0]) return null;
  const o = rows[0];
  let payload = {};
  try { payload = typeof o.payload === 'string' ? JSON.parse(o.payload) : o.payload || {}; } catch (e) { payload = o.payload || {}; }
  return { id: o.id, templateId: o.template_id, title: o.title || o.name, ownerId: o.owner_id, scheduled_at: o.scheduled_at, timezone: o.timezone, recurrence: o.recurrence, payload, status: o.status };
}

export async function updateOp(id, patch) {
  const fields = [];
  const values = [];
  if ('title' in patch) { fields.push('title = ?'); values.push(patch.title); }
  if ('templateId' in patch) { fields.push('template_id = ?'); values.push(patch.templateId); }
  if ('scheduled_at' in patch) { fields.push('scheduled_at = ?'); values.push(patch.scheduled_at); }
  if ('timezone' in patch) { fields.push('timezone = ?'); values.push(patch.timezone); }
  if ('recurrence' in patch) { fields.push('recurrence = ?'); values.push(JSON.stringify(patch.recurrence || null)); }
  if ('status' in patch) { fields.push('status = ?'); values.push(patch.status); }
  if ('payload' in patch) { fields.push('payload = ?'); values.push(JSON.stringify(patch.payload || {})); }
  if (fields.length === 0) return getOpById(id);
  values.push(id);
  await db.query(`UPDATE ops SET ${fields.join(', ')} WHERE id = ?`, values);
  return getOpById(id);
}

export async function deleteOp(id) {
  await db.query('DELETE FROM recurrences WHERE op_id = ?', [id]);
  await db.query('DELETE FROM ops WHERE id = ?', [id]);
  return true;
}

async function _savePayload(id, payload) {
  await db.query('UPDATE ops SET payload = ? WHERE id = ?', [JSON.stringify(payload), id]);
}

export async function joinSlot(opId, slotId, userId) {
  const op = await getOpById(opId);
  if (!op) throw new Error('Op not found');
  const sections = op.payload.sections || [];
  let changed = false;
  for (const section of sections) {
    for (const slot of section.slots || []) {
      if (slot.id === Number(slotId)) {
        if (slot.assignedUserId && slot.assignedUserId !== userId) throw new Error('Slot taken');
        slot.assignedUserId = userId;
        changed = true;
        break;
      }
    }
    if (changed) break;
  }
  if (!changed) throw new Error('Slot not found');
  op.payload.sections = sections;
  await _savePayload(opId, op.payload);
  return getOpById(opId);
}

export async function signoffSlot(opId, slotId, userId) {
  const op = await getOpById(opId);
  if (!op) throw new Error('Op not found');
  const sections = op.payload.sections || [];
  let changed = false;
  for (const section of sections) {
    for (const slot of section.slots || []) {
      if (slot.id === Number(slotId)) {
        if (slot.assignedUserId !== userId) throw new Error('Not assigned');
        slot.assignedUserId = null;
        changed = true;
        break;
      }
    }
    if (changed) break;
  }
  if (!changed) throw new Error('Slot not found');
  op.payload.sections = sections;
  await _savePayload(opId, op.payload);
  return getOpById(opId);
}

export async function updateSection(opId, sectionId, patch) {
  const op = await getOpById(opId);
  if (!op) throw new Error('Op not found');
  const sections = op.payload.sections || [];
  const section = sections.find((s) => s.id === Number(sectionId));
  if (!section) throw new Error('Section not found');
  if ('lrChannel' in patch) section.lrChannel = patch.lrChannel;
  if ('srChannel' in patch) section.srChannel = patch.srChannel;
  if ('marker' in patch) section.marker = patch.marker;
  if ('markerIconUrl' in patch) section.markerIconUrl = patch.markerIconUrl;
  await _savePayload(opId, op.payload);
  return getOpById(opId);
}

export async function addSection(opId, title) {
  const op = await getOpById(opId);
  if (!op) throw new Error('Op not found');
  const sections = op.payload.sections || [];
  const section = {
    id: Date.now(),
    title: title || `Section ${sections.length + 1}`,
    lrChannel: 1,
    srChannel: sections.length + 1,
    marker: null,
    markerIconUrl: null,
    slots: []
  };
  sections.push(section);
  op.payload.sections = sections;
  await _savePayload(opId, op.payload);
  return getOpById(opId);
}

export async function updateSlot(opId, slotId, patch) {
  const op = await getOpById(opId);
  if (!op) throw new Error('Op not found');
  const sections = op.payload.sections || [];
  let target = null;
  for (const section of sections) {
    const slot = (section.slots || []).find((s) => s.id === Number(slotId));
    if (slot) { target = slot; break; }
  }
  if (!target) throw new Error('Slot not found');
  if ('name' in patch) target.name = patch.name;
  if ('role' in patch) target.role = patch.role;
  if ('notes' in patch) target.notes = patch.notes;
  if ('allowedRoles' in patch) target.allowedRoles = patch.allowedRoles;
  await _savePayload(opId, op.payload);
  return getOpById(opId);
}
