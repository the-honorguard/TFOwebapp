import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRecurringOperation, getDueOccurrenceDates, getNextRecurrenceDate } from './recurrence.js';

test('daily recurrence waits six hours after the current operation starts', () => {
  const beforeDelay = getDueOccurrenceDates('2026-07-20T19:00:00', { recurrence: 'daily' }, new Date('2026-07-21T00:59:59'));
  assert.deepEqual(beforeDelay, { dates: [], nextRun: '2026-07-20T19:00:00' });
  const result = getDueOccurrenceDates('2026-07-20T19:00:00', { recurrence: 'daily' }, new Date('2026-07-21T01:00:00'));
  assert.deepEqual(result, { dates: ['2026-07-21T19:00:00'], nextRun: '2026-07-21T19:00:00' });
});

test('weekly recurrence honors multiple selected weekdays', () => {
  const rule = { recurrence: 'weekly', weeklyDays: [1, 3] };
  assert.equal(getNextRecurrenceDate('2026-07-20T19:00:00', rule), '2026-07-22T19:00:00');
  assert.equal(getNextRecurrenceDate('2026-07-22T19:00:00', rule), '2026-07-27T19:00:00');
});

test('biweekly recurrence advances two weeks after the last selected weekday', () => {
  const rule = { recurrence: 'biweekly', weeklyDays: [1] };
  assert.equal(getNextRecurrenceDate('2026-07-20T19:00:00', rule), '2026-08-03T19:00:00');
});

test('monthly recurrence clamps the requested day to the target month', () => {
  assert.equal(getNextRecurrenceDate('2026-01-31T19:00:00', { recurrence: 'monthly', monthlyDay: 31 }), '2026-02-28T19:00:00');
});

test('repeatUntil prevents an operation after the end date', () => {
  const result = getDueOccurrenceDates('2026-07-20T19:00:00', { recurrence: 'daily', repeatUntil: '2026-07-20T23:59:59' }, new Date('2026-07-21T01:00:00'));
  assert.deepEqual(result, { dates: [], nextRun: null });
});

test('a generated operation copies all recurring operation data independently', () => {
  const recurrence = {
    id: 12, name: 'Friday op', templateId: 3, serverName: 'TFO', modlist: 'mods',
    modlistPlayer: 'player', modlistServer: 'server', tsAddress: 'ts.tfo', campaignId: 9,
    absentUserIds: [4], squads: [{ id: 7, title: 'Alpha', slots: [{ id: 8, assignedUserId: null }] }]
  };
  const op = buildRecurringOperation(recurrence, '2026-07-24T19:00:00', { id: 99, createdAt: '2026-07-20T10:00:00.000Z' });
  assert.deepEqual(op, {
    id: 99, name: 'Friday op', templateId: 3, date: '2026-07-24', time: '19:00',
    createdAt: '2026-07-20T10:00:00.000Z', recurrenceId: 12, absentUserIds: [4],
    serverName: 'TFO', modlist: 'mods', modlistPlayer: 'player', modlistServer: 'server',
    tsAddress: 'ts.tfo', campaignId: 9,
    squads: [{ id: 7, title: 'Alpha', slots: [{ id: 8, assignedUserId: null }] }]
  });
  op.squads[0].title = 'Changed';
  assert.equal(recurrence.squads[0].title, 'Alpha');
});
