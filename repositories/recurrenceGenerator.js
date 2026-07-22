import db from '../db.js';
import { buildRecurringOperation, getDueOccurrenceDates } from '../lib/recurrence.js';
import { createOp, getOpById } from './ops.js';

function formatApiDateTime(value) {
  if (!value) return null;
  if (typeof value === 'string') return value.replace(' ', 'T').slice(0, 19);
  const pad = (part) => String(part).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
}

// The row lock serializes generators from every application instance. The
// unique occurrence key on ops remains a final database-level safety net.
export async function generateRecurrence(recurrenceId, now = new Date()) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      'SELECT id, op_id, rule, next_run FROM recurrences WHERE id = ? FOR UPDATE',
      [recurrenceId]
    );
    const recurrence = rows[0];
    if (!recurrence) {
      await connection.rollback();
      return [];
    }

    const rule = typeof recurrence.rule === 'string' ? JSON.parse(recurrence.rule) : recurrence.rule;
    const due = getDueOccurrenceDates(formatApiDateTime(recurrence.next_run), rule, now);
    const root = await getOpById(recurrence.op_id, connection);
    if (!root) {
      await connection.rollback();
      return [];
    }

    const source = { ...rule, id: recurrence.id, squads: root.payload.squads || [] };
    const generated = [];
    for (const occurrence of due.dates) {
      const payload = buildRecurringOperation(source, occurrence, { id: null });
      generated.push(await createOp({
        templateId: source.templateId,
        title: payload.name,
        payload,
        scheduled_at: occurrence.replace('T', ' '),
        recurrenceId: recurrence.id,
        occurrenceAt: occurrence.replace('T', ' ')
      }, connection));
    }
    await connection.query(
      'UPDATE recurrences SET next_run = ? WHERE id = ?',
      [due.nextRun ? due.nextRun.replace('T', ' ') : null, recurrence.id]
    );
    await connection.commit();
    return generated;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
