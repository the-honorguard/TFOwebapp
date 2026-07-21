import React, { useState, useRef } from 'react';
import { getOrbatNodeHeight, ORBAT_NODE_WIDTH } from './orbatLayout';

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
  removeNodeFlowEdges,
  resetTemplateCanvasLayout,
  autoLayoutTemplate,
  alignInactiveSquads,
  autoLayoutSingleSquad,
  moveCanvasDrag,
  stopCanvasDrag,
  trimCanvasTop,
  expandCanvas,
  nudgeCanvasDrag,
  prependCanvasSpace,
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
  const autoScrollRef = useRef({ frame: null, dx: 0, dy: 0 });
  const prependScrollRef = useRef(null);
  const [isPanning, setIsPanning] = useState(false);
  const [draggingSquadId, setDraggingSquadId] = useState(null);

  React.useEffect(() => {
    if (template?.id != null && typeof trimCanvasTop === 'function') {
      trimCanvasTop(template.id, template.squads || []);
    }
  }, [template?.id]);

  React.useEffect(() => () => {
    if (autoScrollRef.current.frame) cancelAnimationFrame(autoScrollRef.current.frame);
  }, []);

  React.useLayoutEffect(() => {
    const pending = prependScrollRef.current;
    const scrollEl = canvasScrollRef.current;
    if (!pending || !scrollEl) return;
    scrollEl.scrollLeft += pending.x;
    scrollEl.scrollTop += pending.y;
    prependScrollRef.current = null;
  });

  const stopCanvasAutoScroll = () => {
    if (autoScrollRef.current.frame) cancelAnimationFrame(autoScrollRef.current.frame);
    autoScrollRef.current = { frame: null, dx: 0, dy: 0 };
  };

  const runCanvasAutoScroll = () => {
    const scrollEl = canvasScrollRef.current;
    const state = autoScrollRef.current;
    if (!scrollEl || (!state.dx && !state.dy)) {
      stopCanvasAutoScroll();
      return;
    }

    const atRightEdge = state.dx > 0 && scrollEl.scrollLeft + scrollEl.clientWidth >= scrollEl.scrollWidth - 3;
    const atBottomEdge = state.dy > 0 && scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - 3;
    const atLeftEdge = state.dx < 0 && scrollEl.scrollLeft <= 2;
    const atTopEdge = state.dy < 0 && scrollEl.scrollTop <= 2;
    if ((atLeftEdge || atTopEdge) && !prependScrollRef.current && typeof prependCanvasSpace === 'function') {
      const prepend = { x: atLeftEdge ? 320 : 0, y: atTopEdge ? 280 : 0 };
      prependScrollRef.current = prepend;
      prependCanvasSpace(template.id, template.squads || [], prepend);
    }
    if ((atRightEdge || atBottomEdge) && typeof expandCanvas === 'function') {
      expandCanvas(template.id, {
        width: atRightEdge ? scrollEl.scrollWidth + 320 : scrollEl.scrollWidth,
        height: atBottomEdge ? scrollEl.scrollHeight + 280 : scrollEl.scrollHeight
      });
    }

    const previousLeft = scrollEl.scrollLeft;
    const previousTop = scrollEl.scrollTop;
    scrollEl.scrollBy(state.dx, state.dy);
    if (typeof nudgeCanvasDrag === 'function') {
      nudgeCanvasDrag(scrollEl.scrollLeft - previousLeft, scrollEl.scrollTop - previousTop);
    }
    autoScrollRef.current.frame = requestAnimationFrame(runCanvasAutoScroll);
  };

  const updateCanvasAutoScroll = (event) => {
    if (dragSnapPreview?.templateId !== template.id) {
      stopCanvasAutoScroll();
      return;
    }
    const scrollEl = canvasScrollRef.current;
    if (!scrollEl) return;
    const rect = scrollEl.getBoundingClientRect();
    const threshold = 64;
    const speedForDistance = (distance) => Math.max(5, Math.min(22, Math.round((threshold - distance) / 3)));
    let dx = 0;
    let dy = 0;
    if (event.clientX - rect.left < threshold) dx = -speedForDistance(event.clientX - rect.left);
    else if (rect.right - event.clientX < threshold) dx = speedForDistance(rect.right - event.clientX);
    if (event.clientY - rect.top < threshold) dy = -speedForDistance(event.clientY - rect.top);
    else if (rect.bottom - event.clientY < threshold) dy = speedForDistance(rect.bottom - event.clientY);

    autoScrollRef.current.dx = dx;
    autoScrollRef.current.dy = dy;
    if ((dx || dy) && !autoScrollRef.current.frame) {
      autoScrollRef.current.frame = requestAnimationFrame(runCanvasAutoScroll);
    } else if (!dx && !dy) {
      stopCanvasAutoScroll();
    }
  };

  const handleCanvasDragMove = (event) => {
    moveCanvasDrag(event, template);
    updateCanvasAutoScroll(event);
  };

  const handleCanvasDragStop = () => {
    stopCanvasAutoScroll();
    stopCanvasDrag();
    setDraggingSquadId(null);
  };

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

  const orderedSquads = [
    ...template.squads.filter((squad) => squad.active !== false),
    ...template.squads.filter((squad) => squad.active === false)
  ];
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
          const draggedSquadId = dragSnapPreview?.templateId === template.id
            ? dragSnapPreview.squadId
            : null;
          const activeNodes = nodes.filter((node) => (
            node.squad.active !== false && node.squad.id !== draggedSquadId
          ));
          const inactiveSeparatorY = Math.max(360, ...activeNodes.map((node) => (
            node.y + getOrbatNodeHeight(node.squad) + 60
          )));
          const finishCanvasDrag = () => {
            const preview = dragSnapPreview?.templateId === template.id ? dragSnapPreview : null;
            const draggedSquad = preview
              ? template.squads.find((squad) => squad.id === preview.squadId)
              : null;
            const shouldBeInactive = Boolean(preview && preview.y >= inactiveSeparatorY);
            handleCanvasDragStop();
            if (!draggedSquad) return;
            const statusChanged = (draggedSquad.active === false) !== shouldBeInactive;
            const nextSquads = template.squads.map((squad) => (
              squad.id === draggedSquad.id ? { ...squad, active: !shouldBeInactive } : squad
            ));
            if (statusChanged) updateSquadMeta(template.id, draggedSquad.id, { active: !shouldBeInactive });
            if (nextSquads.some((squad) => squad.active === false)) {
              window.setTimeout(() => alignInactiveSquads(template.id, nextSquads), 0);
            }
          };
          const edges = getTemplateFlowEdges(template.id, template.squads)
            .filter((edge) => nodeMap.has(edge.sourceId) && nodeMap.has(edge.targetId))
            .map((edge) => {
              const source = nodeMap.get(edge.sourceId);
              const target = nodeMap.get(edge.targetId);
              const sourceAnchor = edge.sourceAnchor || 'bottom';
              const targetAnchor = edge.targetAnchor || 'top';
              return {
                id: edge.id,
                x1: source.x + (ORBAT_NODE_WIDTH / 2),
                y1: sourceAnchor === 'top' ? source.y : source.y + getOrbatNodeHeight(source.squad),
                x2: target.x + (ORBAT_NODE_WIDTH / 2),
                y2: targetAnchor === 'top' ? target.y : target.y + getOrbatNodeHeight(target.squad)
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
                  <button type="button" className="secondary small" onClick={() => autoLayoutTemplate(template.id, template.squads)}>
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
                    onMouseMove={handleCanvasDragMove}
                    onMouseUp={finishCanvasDrag}
                    onMouseLeave={finishCanvasDrag}
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

                  <div className="inactive-separator" style={{ top: `${inactiveSeparatorY}px` }}>
                    <span>Inactive</span>
                  </div>

                  {dragSnapPreview && dragSnapPreview.templateId === template.id ? (
                    (() => {
                      const unit = 40;
                      const squad = template.squads.find((s) => s.id === dragSnapPreview.squadId) || {};
                      const slots = Array.isArray(squad.slots) ? squad.slots.length : 0;
                      const widthUnits = Math.max(7, 4 + slots);
                      const w = widthUnits * unit;
                      const h = getOrbatNodeHeight(squad);
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
                    const collapsedHeight = getOrbatNodeHeight(node.squad);
                    const hoverSuppressed = draggingSquadId != null || flowLinkSource?.templateId === template.id;

                    return (
                        <div
                        key={node.squad.id}
                        className={`orbat-node flow-node template-node ${openMarkerDropdown === node.squad.id ? 'marker-dropdown-open' : ''} ${hoverSuppressed ? 'hover-suppressed' : ''} ${isSelected ? 'selected' : ''} ${node.squad.active === false ? 'squad-inactive' : ''}`}
                        style={{
                          left: `${node.x}px`,
                          top: `${node.y}px`,
                          width: `${ORBAT_NODE_WIDTH}px`,
                          height: `${collapsedHeight}px`
                        }}
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
                          className="orbat-connector-remove top"
                          onClick={(event) => removeNodeFlowEdges(template.id, node.squad.id, 'top', event)}
                          aria-label={`Remove incoming hierarchy lines from ${node.squad.title}`}
                          title="Remove incoming hierarchy lines"
                        >
                          ×
                        </button>
                        <button
                          type="button"
                          className={`orbat-connector bottom clickable ${isSelected && flowLinkSource?.anchor === 'bottom' ? 'active' : ''}`}
                          onClick={(event) => handleFlowConnectorClick(template.id, node.squad.id, 'bottom', event)}
                          aria-label="Connect from bottom"
                        />
                        <button
                          type="button"
                          className="orbat-connector-remove bottom"
                          onClick={(event) => removeNodeFlowEdges(template.id, node.squad.id, 'bottom', event)}
                          aria-label={`Remove outgoing hierarchy lines from ${node.squad.title}`}
                          title="Remove outgoing hierarchy lines"
                        >
                          ×
                        </button>
                        <div
                          className="orbat-node-head"
                          onMouseDown={(event) => {
                            setDraggingSquadId(node.squad.id);
                            startCanvasDrag(event, template.id, node.squad.id, node.index);
                          }}
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
                            <button
                              type="button"
                              className={`squad-switch ${node.squad.active !== false ? 'is-active' : ''}`}
                              role="switch"
                              aria-checked={node.squad.active !== false}
                              title="Standaard actief in nieuwe operaties"
                              onMouseDown={(event) => event.stopPropagation()}
                              onClick={(event) => {
                                event.stopPropagation();
                                updateSquadMeta(template.id, node.squad.id, { active: node.squad.active === false });
                              }}
                            >
                              <span className="squad-switch-track" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              className="squad-sort-button"
                              title="Alleen deze squad automatisch positioneren"
                              aria-label="Alleen deze squad automatisch positioneren"
                              onMouseDown={(event) => event.stopPropagation()}
                              onClick={(event) => { event.stopPropagation(); autoLayoutSingleSquad(template.id, template.squads, node.squad.id); }}
                            >
                              Auto
                            </button>
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
            {orderedSquads.map((squad, index) => (
              <React.Fragment key={squad.id}>
              {squad.active === false && orderedSquads[index - 1]?.active !== false ? (
                <div className="inactive-separator form-separator"><span>Inactive</span></div>
              ) : null}
              <div className={`builder-panel panel-${index % 5} ${builderCompact ? 'compact' : ''} ${squad.active === false ? 'squad-inactive' : ''}`}>
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
                      <button
                        type="button"
                        className={`squad-switch ${squad.active !== false ? 'is-active' : ''}`}
                        role="switch"
                        aria-checked={squad.active !== false}
                        title="Standaard actief in nieuwe operaties"
                        onClick={() => updateSquadMeta(template.id, squad.id, { active: squad.active === false })}
                      >
                        <span className="squad-switch-track" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="squad-sort-button"
                        title="Alleen deze squad automatisch positioneren"
                        onClick={() => autoLayoutSingleSquad(template.id, template.squads, squad.id)}
                      >
                        Auto
                      </button>
                    </div>
                  </div>
                  <div className="slot-actions">
                    <button onClick={() => addSlot(template.id, squad.id)} className="secondary small">
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
              </React.Fragment>
            ))}
          </div>
      )}
    </div>
  );
}
