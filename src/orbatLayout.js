// Shared footprint for every ORBAT viewer. The scheduler has the widest row:
// drag handle, slot name, role, status, player assignment and delete action.
export const ORBAT_NODE_WIDTH = 460;

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
