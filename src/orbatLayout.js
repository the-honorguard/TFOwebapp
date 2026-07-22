// Keep every squad edge on the same grid lines as the canvas. The scheduler has
// the widest row, so twelve 40px cells provide enough room for all controls.
export const ORBAT_CANVAS_GRID_SIZE = 40;
export const ORBAT_NODE_WIDTH = ORBAT_CANVAS_GRID_SIZE * 12;

export const snapOrbatToGrid = (value) => (
  Math.round((Number(value) || 0) / ORBAT_CANVAS_GRID_SIZE) * ORBAT_CANVAS_GRID_SIZE
);

export const trimOrbatNodesToGrid = (nodes = []) => {
  if (!nodes.length) return [];
  const minX = Math.min(...nodes.map(({ x }) => snapOrbatToGrid(x)));
  const minY = Math.min(...nodes.map(({ y }) => snapOrbatToGrid(y)));
  const offsetX = Math.max(0, minX - ORBAT_CANVAS_GRID_SIZE);
  const offsetY = Math.max(0, minY - ORBAT_CANVAS_GRID_SIZE);
  return nodes.map((node) => ({
    ...node,
    x: Math.max(ORBAT_CANVAS_GRID_SIZE, snapOrbatToGrid(node.x) - offsetX),
    y: Math.max(ORBAT_CANVAS_GRID_SIZE, snapOrbatToGrid(node.y) - offsetY)
  }));
};

// Canvas geometry is based on squad content, never on the controls that a
// particular editor happens to render. This keeps the same squad equally sized
// in the builder, scheduler and overview without forcing every squad to one size.
export const getOrbatNodeHeight = (squad) => {
  const slotCount = Array.isArray(squad?.slots) ? squad.slots.length : 0;
  const headerHeight = 136;
  const slotRowHeight = 43;
  const footerHeight = 18;

  return headerHeight + (slotCount * slotRowHeight) + footerHeight;
};
