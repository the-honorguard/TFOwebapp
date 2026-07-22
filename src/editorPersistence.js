export function migrateEditorCanvasState({ containerId, squads, persistedSquads, canvasLayout, flowEdges }) {
  const idMap = new Map((squads || []).map((squad, index) => [
    String(squad.id),
    persistedSquads?.[index]?.id
  ]));
  const migratedLayout = {};
  Object.entries(canvasLayout?.[containerId] || {}).forEach(([squadId, node]) => {
    const persistedId = idMap.get(String(squadId)) ?? squadId;
    migratedLayout[persistedId] = {
      ...node,
      parentId: node.parentId == null ? null : (idMap.get(String(node.parentId)) ?? node.parentId)
    };
  });
  return {
    canvasLayout: { ...canvasLayout, [containerId]: migratedLayout },
    flowEdges: {
      ...flowEdges,
      [containerId]: (flowEdges?.[containerId] || []).map((edge) => ({
        ...edge,
        sourceId: idMap.get(String(edge.sourceId)) ?? edge.sourceId,
        targetId: idMap.get(String(edge.targetId)) ?? edge.targetId
      }))
    }
  };
}
