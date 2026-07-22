import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateEditorCanvasState } from './editorPersistence.js';

test('canvas positions and hierarchy follow database ids after a full template save', () => {
  const result = migrateEditorCanvasState({
    containerId: 7,
    squads: [{ id: 'draft-alpha' }, { id: 12 }],
    persistedSquads: [{ id: 101 }, { id: 102 }],
    canvasLayout: { 7: {
      'draft-alpha': { x: 440, y: 80, parentId: null },
      12: { x: 120, y: 400, parentId: 'draft-alpha' }
    } },
    flowEdges: { 7: [{ id: 'edge-1', sourceId: 'draft-alpha', targetId: 12 }] }
  });

  assert.deepEqual(result.canvasLayout[7], {
    101: { x: 440, y: 80, parentId: null },
    102: { x: 120, y: 400, parentId: 101 }
  });
  assert.deepEqual(result.flowEdges[7], [{ id: 'edge-1', sourceId: 101, targetId: 102 }]);
});
