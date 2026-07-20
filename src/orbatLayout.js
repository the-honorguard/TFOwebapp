export const ORBAT_NODE_WIDTH = 280;
export const ORBAT_VISIBLE_SLOT_LIMIT = 6;

// Canvas geometry is based on squad content, never on the controls that a
// particular editor happens to render. This keeps the same squad equally sized
// in the builder, scheduler and overview without forcing every squad to one size.
export const getOrbatNodeHeight = (squad) => {
  const slotCount = Array.isArray(squad?.slots) ? squad.slots.length : 0;
  const visibleSlots = Math.min(slotCount, ORBAT_VISIBLE_SLOT_LIMIT);
  const headerHeight = 132;
  const slotRowHeight = 40;
  const footerHeight = slotCount > ORBAT_VISIBLE_SLOT_LIMIT ? 30 : 18;

  return headerHeight + (visibleSlots * slotRowHeight) + footerHeight;
};

// Scheduler rows contain assignment controls and need more room while open.
export const getEditorExpandedHeight = (squad) => {
  const slotCount = Array.isArray(squad?.slots) ? squad.slots.length : 0;
  return Math.min(620, Math.max(getOrbatNodeHeight(squad), 180 + (slotCount * 44)));
};
