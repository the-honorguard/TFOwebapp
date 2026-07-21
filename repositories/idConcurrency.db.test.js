import test from 'node:test';
import assert from 'node:assert/strict';

test('database-generated operation and layout IDs stay unique under concurrency', {
  skip: process.env.RUN_DB_TESTS !== '1'
}, async () => {
  const [{ default: db }, templatesRepo, opsRepo] = await Promise.all([
    import('../db.js'), import('./templates.js'), import('./ops.js')
  ]);
  const marker = `id-concurrency-${process.pid}-${Date.now()}`;
  let template;
  try {
    template = await templatesRepo.createTemplate({
      name: marker,
      data: { squads: [{ title: 'Alpha', slots: [{ name: 'Lead', role: 'SL' }] }] }
    });
    const settled = await Promise.allSettled(Array.from({ length: 100 }, (_, index) => opsRepo.createOp({
      templateId: template.id,
      title: `${marker}-${index}`,
      payload: { name: `${marker}-${index}`, squads: template.data.squads }
    })));
    const failures = settled.filter(({ status }) => status === 'rejected');
    assert.deepEqual(failures, []);

    const operations = settled.map(({ value }) => value);
    const operationIds = operations.map(({ id }) => String(id));
    const squadIds = operations.flatMap(({ payload }) => payload.squads.map(({ id }) => String(id)));
    const slotIds = operations.flatMap(({ payload }) => payload.squads.flatMap(({ slots }) => slots.map(({ id }) => String(id))));
    assert.equal(new Set(operationIds).size, operationIds.length);
    assert.equal(new Set(squadIds).size, squadIds.length);
    assert.equal(new Set(slotIds).size, slotIds.length);

    const root = operations[0];
    const [recurrenceResult] = await db.query(
      'INSERT INTO recurrences (op_id, rule, next_run) VALUES (?, ?, ?)',
      [root.id, JSON.stringify({ recurrence: 'daily' }), '2030-01-01 19:00:00']
    );
    const occurrenceAt = '2030-01-02 19:00:00';
    const duplicateAttempts = await Promise.allSettled([0, 1].map(() => opsRepo.createOp({
      templateId: template.id,
      title: `${marker}-recurring`,
      payload: { name: `${marker}-recurring`, squads: template.data.squads },
      recurrenceId: recurrenceResult.insertId,
      occurrenceAt,
      scheduled_at: occurrenceAt
    })));
    assert.equal(duplicateAttempts.filter(({ status }) => status === 'fulfilled').length, 1);
    const [occurrences] = await db.query('SELECT COUNT(*) AS count FROM ops WHERE recurrence_id = ? AND occurrence_at = ?',
      [recurrenceResult.insertId, occurrenceAt]);
    assert.equal(Number(occurrences[0].count), 1);
  } finally {
    await db.query('DELETE FROM ops WHERE title LIKE ?', [`${marker}%`]);
    if (template?.id) await db.query('DELETE FROM templates WHERE id = ?', [template.id]);
    await db.end();
  }
});
