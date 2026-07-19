import React, { useState, useRef } from 'react';

/**
 * OrbatTemplate
 * - Template builder view: renders template squads in a flow/canvas layout or grid form
 * - No occupant information is present here; this view is used for editing template structure
 * - Expects a set of handler functions from the parent to perform mutations (add/delete/update)
 */
export default function OrbatTemplate({
  template,
  builderFlowMode,
  builderCompact,
  allRoles,
  nodeHeights,
  dragSnapPreview,
  flowLinkSource,
  getCanvasSize,
  getCanvasNode,
  getTemplateFlowEdges,
  addSquadQuick,
  clearTemplateFlowEdges,
  resetTemplateCanvasLayout,
  autoLayoutTemplate,
  moveCanvasDrag,
  stopCanvasDrag,
  startCanvasDrag,
  setNodeHeightRef,
  handleFlowConnectorClick,
  updateSquadTitleLocal,
  updateSquadMeta,
  deleteSquad,
  handleSlotDragOver,
  handleSlotDrop,
  handleSlotDragStart,
  setDraggedSlot,
  updateSlot,
  flushSlotUpdate,
  deleteSlot,
  addSlot,
  isAdmin,
  isMissionmaker,
  
  uploadCustomMarker
  
  ,
  squadTypes = []
}) {
  
  const [openMarkerDropdown, setOpenMarkerDropdown] = useState(null);
  const canvasScrollRef = useRef(null);
  const panRef = useRef({ active: false, startX: 0, startY: 0, scrollLeft: 0, scrollTop: 0 });
  const [isPanning, setIsPanning] = useState(false);

  // Defensive defaults: allow opening Template Builder with no templates/demo data
  if (!template) template = { id: null, squads: [] };
  if (!Array.isArray(template.squads)) template.squads = [];

  const handleCanvasPanStart = (event) => {
    if (event.button !== 0) return;
    if (event.target.closest('.orbat-node')) return; // let node dragging handle its own mousedown
    const scrollEl = canvasScrollRef.current;
    if (!scrollEl) return;
    panRef.current = {
      active: true,
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: scrollEl.scrollLeft,
      scrollTop: scrollEl.scrollTop
    };
    setIsPanning(true);
  };

  const handleCanvasPanMove = (event) => {
    if (!panRef.current.active) return;
    const scrollEl = canvasScrollRef.current;
    if (!scrollEl) return;
    scrollEl.scrollLeft = panRef.current.scrollLeft - (event.clientX - panRef.current.startX);
    scrollEl.scrollTop = panRef.current.scrollTop - (event.clientY - panRef.current.startY);
  };

  const handleCanvasPanEnd = () => {
    if (!panRef.current.active) return;
    panRef.current.active = false;
    setIsPanning(false);
  };

  const builtins = Array.isArray(squadTypes) && squadTypes.length > 0
    ? squadTypes.map((s) => ({ label: s.name, value: s.name, icon: s.icon }))
    : [];
  return (
    <div>
      {/* template-level override UI removed */}
      {builderFlowMode ? (
        (() => {
          const canvasSize = getCanvasSize(template);
          const nodes = template.squads.map((squad, index) => {
            const node = getCanvasNode(template.id, squad.id, index);
            return {
              squad,
              index,
                nodeKey: `flow-${template.id}-${squad.id}`,
              x: node.x,
              y: node.y
            };
          });
          const nodeMap = new Map(nodes.map((node) => [node.squad.id, node]));
          const edges = getTemplateFlowEdges(template.id, template.squads)
            .filter((edge) => nodeMap.has(edge.sourceId) && nodeMap.has(edge.targetId))
            .map((edge) => {
              const source = nodeMap.get(edge.sourceId);
              const target = nodeMap.get(edge.targetId);
              const sourceAnchor = edge.sourceAnchor || 'bottom';
              const targetAnchor = edge.targetAnchor || 'top';
              return {
                id: edge.id,
                x1: source.x + 150,
                y1: sourceAnchor === 'top' ? source.y : source.y + (nodeHeights[source.nodeKey] || 124),
                x2: target.x + 150,
                y2: targetAnchor === 'top' ? target.y : target.y + (nodeHeights[target.nodeKey] || 124)
              };
            });
          const selectedFlowSquadId = flowLinkSource?.templateId === template.id ? flowLinkSource.squadId : null;
          const selectedFlowSquad = template.squads.find((squad) => squad.id === selectedFlowSquadId);

          return (
            <div className="flow-layout flow-fullscreen">
              <div className="orbat-wrapper flow-fullscreen-wrapper">
                <div className="flow-canvas-controls">
                  <button
                    type="button"
                    className="secondary small"
                    onClick={() => addSquadQuick(template.id, template.squads.length)}
                  >
                    + Squad
                  </button>
                  <button type="button" className="secondary small" onClick={() => clearTemplateFlowEdges(template.id)}>
                    Clear
                  </button>
                  <button type="button" className="secondary small" onClick={() => resetTemplateCanvasLayout(template.id)}>
                    Reset
                  </button>
                  <button type="button" className="secondary small" onClick={() => autoLayoutTemplate(template.id)}>
                    Auto-layout
                  </button>
                </div>
                <div
                  className={`orbat-canvas${isPanning ? ' panning' : ''}`}
                  ref={canvasScrollRef}
                  onMouseDown={handleCanvasPanStart}
                  onMouseMove={handleCanvasPanMove}
                  onMouseUp={handleCanvasPanEnd}
                  onMouseLeave={handleCanvasPanEnd}
                >
                  <div
                    className="flow-canvas-content drag-canvas"
                    style={{ width: `${canvasSize.width}px`, height: `${canvasSize.height}px` }}
                    onMouseMove={(event) => moveCanvasDrag(event, template)}
                    onMouseUp={stopCanvasDrag}
                    onMouseLeave={stopCanvasDrag}
                  >
                  <svg className="orbat-links" width={canvasSize.width} height={canvasSize.height}>
                    <defs>
                      <marker
                        id={`orbat-arrow-${template.id}`}
                        viewBox="0 0 10 10"
                        refX="8"
                        refY="5"
                        markerWidth="7"
                        markerHeight="7"
                        orient="auto-start-reverse"
                      >
                        <path d="M 0 0 L 10 5 L 0 10 z" className="orbat-link-arrow" />
                      </marker>
                    </defs>
                    {edges.map((edge) => (
                      <line
                        key={edge.id}
                        x1={edge.x1}
                        y1={edge.y1}
                        x2={edge.x2}
                        y2={edge.y2}
                        className="orbat-link"
                        markerEnd={`url(#orbat-arrow-${template.id})`}
                      />
                    ))}
                  </svg>

                  {dragSnapPreview && dragSnapPreview.templateId === template.id ? (
                    (() => {
                      const unit = 40;
                      const squad = template.squads.find((s) => s.id === dragSnapPreview.squadId) || {};
                      const slots = Array.isArray(squad.slots) ? squad.slots.length : 0;
                      const widthUnits = Math.max(7, 4 + slots);
                      const w = widthUnits * unit;
                      const h = nodeHeights[`flow-${template.id}-${dragSnapPreview.squadId}`] || 124;
                      return (
                        <div
                          className="flow-drag-ghost"
                          style={{ left: `${dragSnapPreview.x}px`, top: `${dragSnapPreview.y}px`, width: `${7 * unit}px`, height: `${h}px` }}
                        />
                      );
                    
                    })()
                  ) : null}

                  {nodes.map((node) => {
                    const isSelected = selectedFlowSquadId === node.squad.id;

                    return (
                        <div
                        key={node.squad.id}
                        className={`orbat-node flow-node ${isSelected ? 'selected' : ''}`}
                        style={{ left: `${node.x}px`, top: `${node.y}px`, width: `${7 * 40}px` }}
                        ref={setNodeHeightRef(node.nodeKey)}
                      >
                        <button
                          type="button"
                          className={`orbat-connector top clickable ${isSelected && flowLinkSource?.anchor === 'top' ? 'active' : ''}`}
                          onClick={(event) => handleFlowConnectorClick(template.id, node.squad.id, 'top', event)}
                          aria-label="Connect from top"
                        />
                        <button
                          type="button"
                          className={`orbat-connector bottom clickable ${isSelected && flowLinkSource?.anchor === 'bottom' ? 'active' : ''}`}
                          onClick={(event) => handleFlowConnectorClick(template.id, node.squad.id, 'bottom', event)}
                          aria-label="Connect from bottom"
                        />
                        <div
                          className="orbat-node-head"
                          onMouseDown={(event) => startCanvasDrag(event, template.id, node.squad.id, node.index)}
                        >
                          <div className="orbat-title-row">
                            <input
                              className="squad-title-input"
                              value={node.squad.title}
                              placeholder="Squad title"
                              onMouseDown={(event) => event.stopPropagation()}
                              onChange={(event) => updateSquadTitleLocal(template.id, node.squad.id, event.target.value)}
                              onBlur={(event) => updateSquadMeta(template.id, node.squad.id, { title: event.target.value })}
                            />
                            <div style={{display:'inline-block', position:'relative'}} onMouseDown={(e) => e.stopPropagation()}>
                              <button type="button" className="marker-dropdown-btn" onClick={() => setOpenMarkerDropdown(openMarkerDropdown === node.squad.id ? null : node.squad.id)}>
                                <span className="marker-dropdown-icon">
                                  {node.squad.markerIconUrl ? <img src={node.squad.markerIconUrl} alt="marker" style={{width:'100%',height:'100%',objectFit:'contain',display:'block'}} /> : node.squad.marker ? <span className={`marker-badge marker-${String(node.squad.marker).toLowerCase().replace(/\s+/g,'-')}`} style={{fontSize:'0.6rem'}}>{node.squad.marker}</span> : null}
                                </span>
                                <span className="marker-dropdown-arrow">▾</span>
                              </button>
                              {openMarkerDropdown === node.squad.id ? (
                                <div style={{position:'absolute',right:0,marginTop:6,zIndex:60,background:'var(--panel)',border:'1px solid var(--border)',borderRadius:8,padding:8,minWidth:180}}>
                                  <div style={{display:'flex',flexDirection:'column',gap:6}}>
                                    <button className="secondary small" onClick={() => { updateSquadMeta(template.id, node.squad.id, { marker: null, markerIconUrl: null }); setOpenMarkerDropdown(null); }}>None</button>
                                    {builtins.map((b) => {
                                      const iconSrc = b.icon ? (b.icon.startsWith('/') || b.icon.startsWith('http') ? b.icon : `/markers/${b.icon}`) : null;
                                      return (
                                        <button key={b.label} type="button" className="secondary small" style={{display:'flex',alignItems:'center',gap:8}} onClick={() => { updateSquadMeta(template.id, node.squad.id, { markerIconUrl: iconSrc, marker: null }); setOpenMarkerDropdown(null); }}>
                                          {iconSrc ? <img src={iconSrc} alt={b.label} style={{width:20,height:20}} /> : <span style={{width:20,height:20,display:'inline-block'}} />}
                                          {b.label}
                                        </button>
                                      );
                                    })}
                                    <div style={{borderTop:'1px solid var(--border)',paddingTop:6}}>
                                      <div style={{fontSize:12,opacity:0.8,marginBottom:6}}>Or choose type</div>
                                      {builtins.map((b) => (
                                        <button key={b.value + '-text'} className="secondary small" onClick={() => { updateSquadMeta(template.id, node.squad.id, { marker: b.value, markerIconUrl: null }); setOpenMarkerDropdown(null); }}>{b.label}</button>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              ) : null}
                            </div>
                            <button
                              type="button"
                              className="danger-x-button"
                              onClick={(e) => { e.stopPropagation(); deleteSquad(template.id, node.squad.id); }}
                              aria-label="Delete squad"
                            >
                              ✕
                            </button>
                          </div>
                          <div className="flow-meta-row" onMouseDown={(e) => e.stopPropagation()}>
                            <label style={{display:'flex',alignItems:'center',gap:'0.35rem',fontSize:'0.85rem'}}>
                              LR
                              <input
                                type="number"
                                min="0"
                                max="99"
                                className="lr-sr-input"
                                value={node.squad.lrChannel ?? 1}
                                onChange={(e) => updateSquadMeta(template.id, node.squad.id, { lrChannel: Number(e.target.value) })}
                              />
                            </label>
                            <label style={{display:'flex',alignItems:'center',gap:'0.35rem',fontSize:'0.85rem'}}>
                              SR
                              <input
                                type="number"
                                min="0"
                                max="99"
                                className="lr-sr-input"
                                value={node.squad.srChannel ?? 1}
                                onChange={(e) => updateSquadMeta(template.id, node.squad.id, { srChannel: Number(e.target.value) })}
                              />
                            </label>

                          </div>
                        </div>
                        <div className="flow-node-body" onClick={(event) => event.stopPropagation()}>
                          <div className="flow-slot-list">
                            {node.squad.slots.length === 0 ? (
                              <p className="panel-empty">No slots yet.</p>
                            ) : (
                              node.squad.slots.map((slot) => (
                                <div
                                  key={slot.id}
                                  className="flow-slot-row"
                                  onDragOver={(event) => handleSlotDragOver(template.id, node.squad.id, event)}
                                  onDrop={(event) => handleSlotDrop(template.id, node.squad.id, slot.id, event)}
                                >
                                  <button
                                    type="button"
                                    className="slot-drag-handle"
                                    draggable={!slot._pendingCreate}
                                    disabled={slot._pendingCreate}
                                    onDragStart={(event) => handleSlotDragStart(template.id, node.squad.id, slot.id, event)}
                                    onDragEnd={() => setDraggedSlot(null)}
                                    aria-label="Drag slot"
                                  >
                                    ≡
                                  </button>
                                  <input
                                    className="flow-slot-name"
                                    value={slot.name}
                                    placeholder="Slot name"
                                    onChange={(event) => updateSlot(template.id, slot.id, { name: event.target.value })}
                                    onBlur={() => flushSlotUpdate(template.id, slot.id)}
                                    disabled={slot._pendingCreate}
                                  />
                                  <select
                                    className="flow-slot-role"
                                    value={slot.role}
                                    onChange={(event) => updateSlot(template.id, slot.id, { role: event.target.value })}
                                    onBlur={() => flushSlotUpdate(template.id, slot.id)}
                                    disabled={slot._pendingCreate}
                                  >
                                    {allRoles.length > 0
                                      ? allRoles.map((roleOption) => (
                                          <option key={roleOption} value={roleOption}>
                                            {roleOption}
                                          </option>
                                        ))
                                      : ['Rifleman', 'Admin'].map((roleOption) => (
                                          <option key={roleOption} value={roleOption}>
                                            {roleOption}
                                          </option>
                                        ))}
                                  </select>
                                  <button
                                    type="button"
                                    className="danger-x-button"
                                    onClick={() => deleteSlot(template.id, slot.id)}
                                    aria-label="Delete slot"
                                    disabled={slot._pendingCreate}
                                  >
                                    x
                                  </button>
                                </div>
                              ))
                            )}
                          </div>
                          <button
                            type="button"
                            className="secondary small"
                            onClick={() => addSlot(template.id, node.squad.id)}
                            disabled={node.squad._pendingCreate}
                          >
                            + Slot
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  </div>
                </div>
              </div>
              {selectedFlowSquad ? (
                <p className="flow-help">
                  Link source: <strong>{selectedFlowSquad.title}</strong>. Now click a connector on a second squad..
                </p>
              ) : (
                <p className="flow-help">Click a top/bottom connector, then click a connector on a second squad.</p>
              )}
            </div>
          );
        })()
      ) : template.squads.length === 0 ? (
        <div className="empty-state">This template has no squads yet. Add a squad to start.</div>
      ) : (
          <div className={builderCompact ? 'builder-grid compact' : 'builder-grid'}>
            {template.squads.map((squad, index) => (
              <div key={squad.id} className={`builder-panel panel-${index % 5} ${builderCompact ? 'compact' : ''}`}>
                <div className="panel-title">
                  <div className="panel-title-text">
                    <input
                      className="squad-title-input"
                      value={squad.title}
                      placeholder="Squad title"
                      onChange={(e) => updateSquadTitleLocal(template.id, squad.id, e.target.value)}
                      onBlur={(e) => updateSquadMeta(template.id, squad.id, { title: e.target.value })}
                    />
                    <div className="slot-meta-row">
                      <label className="slot-meta">
                        LR
                        <input
                          type="number"
                          min="0"
                          max="99"
                          className="lr-sr-input"
                          value={squad.lrChannel ?? 1}
                          onChange={(e) => updateSquadMeta(template.id, squad.id, { lrChannel: Number(e.target.value) })}
                        />
                      </label>
                      <label className="slot-meta">
                        SR
                        <input
                          type="number"
                          min="0"
                          max="99"
                          className="lr-sr-input"
                          value={squad.srChannel ?? 1}
                          onChange={(e) => updateSquadMeta(template.id, squad.id, { srChannel: Number(e.target.value) })}
                        />
                      </label>

                    </div>
                  </div>
                  <div className="slot-actions">
                    <button onClick={() => addSlot(template.id, squad.id)} className="secondary small" disabled={squad._pendingCreate}>
                      Add slot
                    </button>
                  </div>
                </div>
                <div className="panel-content">
                  {squad.slots.length === 0 ? (
                    <p className="panel-empty">No slots in this squad.</p>
                  ) : (
                    squad.slots.map((slot) => (
                      <div
                        key={slot.id}
                        className={`slot-card builder-slot ${builderCompact ? 'compact' : ''}`}
                        onDragOver={(event) => handleSlotDragOver(template.id, squad.id, event)}
                        onDrop={(event) => handleSlotDrop(template.id, squad.id, slot.id, event)}
                      >
                        <div>
                          <button
                            type="button"
                            className="slot-drag-handle"
                            draggable={!slot._pendingCreate}
                            disabled={slot._pendingCreate}
                            onDragStart={(event) => handleSlotDragStart(template.id, squad.id, slot.id, event)}
                            onDragEnd={() => setDraggedSlot(null)}
                            aria-label="Drag slot"
                          >
                            ≡
                          </button>
                          <input
                            className="slot-name-input"
                            value={slot.name}
                            placeholder="Slot name"
                            onChange={(e) => updateSlot(template.id, slot.id, { name: e.target.value })}
                            onBlur={() => flushSlotUpdate(template.id, slot.id)}
                            disabled={slot._pendingCreate}
                          />
                          {!builderCompact ? (
                            <textarea
                              className="slot-notes-input"
                              value={slot.notes}
                              placeholder="Place extra notes here"
                              onChange={(e) => updateSlot(template.id, slot.id, { notes: e.target.value })}
                              onBlur={() => flushSlotUpdate(template.id, slot.id)}
                              disabled={slot._pendingCreate}
                            />
                          ) : null}
                          <div className="slot-meta-row">
                            <select
                              value={slot.role}
                              onChange={(e) => updateSlot(template.id, slot.id, { role: e.target.value })}
                              onBlur={() => flushSlotUpdate(template.id, slot.id)}
                              disabled={slot._pendingCreate}
                            >
                              {allRoles.length > 0
                                ? allRoles.map((roleOption) => (
                                    <option key={roleOption} value={roleOption}>
                                      {roleOption}
                                    </option>
                                  ))
                                : ['Rifleman', 'Admin'].map((roleOption) => (
                                    <option key={roleOption} value={roleOption}>
                                      {roleOption}
                                    </option>
                                  ))}
                            </select>
                          </div>
                        </div>
                        <div className="slot-footer">
                          <div className="slot-actions">
                            <button
                              type="button"
                              className="danger-x-button"
                              onClick={() => deleteSlot(template.id, slot.id)}
                              disabled={slot._pendingCreate}
                              aria-label="Delete slot"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
      )}
    </div>
  );
}
