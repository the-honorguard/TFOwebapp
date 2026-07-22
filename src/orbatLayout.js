// Keep every squad edge on the same grid lines as the canvas.
export const ORBAT_CANVAS_GRID_SIZE = 40;
export const ORBAT_NODE_WIDTH = ORBAT_CANVAS_GRID_SIZE * 11;

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
  // Includes the body padding, row gap and the add-slot button. Keeping this
  // allowance explicit prevents two-slot squads from landing exactly on a
  // grid boundary that is a few pixels shorter than their rendered content.
  const footerHeight = 38;

  // Positions already snap to the canvas grid, so the height must do the same.
  // Always round upwards: rounding to the nearest line can make the card
  // shorter than its contents and introduce an unnecessary scrollbar.
  return Math.max(
    ORBAT_CANVAS_GRID_SIZE,
    Math.ceil(
      (headerHeight + (slotCount * slotRowHeight) + footerHeight)
      / ORBAT_CANVAS_GRID_SIZE
    ) * ORBAT_CANVAS_GRID_SIZE
  );
};
