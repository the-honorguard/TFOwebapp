import test from 'node:test';
import assert from 'node:assert/strict';
import { ORBAT_CANVAS_GRID_SIZE, ORBAT_NODE_WIDTH, trimOrbatNodesToGrid } from './orbatLayout.js';

test('every squad width occupies a whole number of canvas grid cells', () => {
  assert.equal(ORBAT_NODE_WIDTH % ORBAT_CANVAS_GRID_SIZE, 0);
  assert.equal(ORBAT_NODE_WIDTH, 480);
});

test('canvas trimming keeps every squad position on the grid', () => {
  const trimmed = trimOrbatNodesToGrid([
    { id: 1, x: 133, y: 211 },
    { id: 2, x: 653, y: 477 }
  ]);

  assert.deepEqual(trimmed, [
    { id: 1, x: 40, y: 40 },
    { id: 2, x: 560, y: 320 }
  ]);
  trimmed.forEach((node) => {
    assert.equal(node.x % ORBAT_CANVAS_GRID_SIZE, 0);
    assert.equal(node.y % ORBAT_CANVAS_GRID_SIZE, 0);
  });
});
