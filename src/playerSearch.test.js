import test from 'node:test';
import assert from 'node:assert/strict';
import { filterPlayers } from './playerSearch.js';

const users = [
  { id: 1, username: 'AlphaOne', rank: 10, status: 'Active', role: 'member', permissions: { medic: true } },
  { id: 2, username: 'BravoTwo', rank: 20, status: 'LoA', role: 'admin', permissions: { pilot: true }, profile: { displayName: 'John Smith' } }
];
const ranks = [
  { id: 10, name: 'Private', short: 'PVT' },
  { id: 20, name: 'Sergeant', short: 'SGT' }
];
const permissionGroups = [
  { slug: 'member', name: 'Member' },
  { slug: 'admin', name: 'Administrator' }
];

test('filterPlayers matches visible player fields case-insensitively', () => {
  assert.deepEqual(filterPlayers(users, 'brav', ranks, permissionGroups).map((user) => user.id), [2]);
  assert.deepEqual(filterPlayers(users, 'sGt', ranks, permissionGroups).map((user) => user.id), [2]);
  assert.deepEqual(filterPlayers(users, 'administrator', ranks, permissionGroups).map((user) => user.id), [2]);
  assert.deepEqual(filterPlayers(users, 'medic', ranks, permissionGroups).map((user) => user.id), [1]);
  assert.deepEqual(filterPlayers(users, 'john smith', ranks, permissionGroups).map((user) => user.id), [2]);
});

test('filterPlayers restores the original list for an empty query', () => {
  assert.equal(filterPlayers(users, '   ', ranks, permissionGroups), users);
});

test('filterPlayers returns an empty list when nothing matches', () => {
  assert.deepEqual(filterPlayers(users, 'not-a-player', ranks, permissionGroups), []);
});
