import React, { useState, useRef } from 'react';
import { getOrbatNodeHeight, ORBAT_NODE_WIDTH } from './orbatLayout';
import CanvasHelp from './CanvasHelp';

/**
 * OrbatScheduler
 * - Editable ORBAT view for one scheduled operation (scheduler detail page).
 * - Reuses the same canvas/form rendering logic as the Template Builder.
 * - Receives a large set of handlers and helpers from `App` so the scheduler
 *   can operate on the selected operation's template squads and slots.
 */
export default function OrbatScheduler({
  selectedOp,
  selectedRecurrenceId,
  recurrences,
  goToSchedulerList,
  getTemplateName,
  schedulerLoadTemplateId,
  setSchedulerLoadTemplateId,
  templates,
  loadTemplateIntoOp,
  deleteRecurrence,
  deleteOp,
  updateOpMeta,
  handleModlistDragOver,
  handleModlistDrop,
  handleModlistSelect,
  campaigns,
  users,
  updateOpSlot,
  updateOpSlotDebounced,
  flushOpSlotUpdate,
  allRoles,
  weekDayLabels,
  toggleRecurrenceWeeklyDay,
  updateRecurrence,
  recurrenceLabel,
  isAdmin,
  isMissionmaker,
  getCanvasSize,
  getCanvasNode,
  resolveSquadParentId,
  getTemplateFlowEdges,
  nodeHeights,
  setNodeHeightRef,
  moveCanvasDrag,
  stopCanvasDrag,
  startCanvasDrag,
  updateSquadParent,
  squadStats,
  auth,
  joinOpSlot,
  signOffOpSlot,
  setShowLoginPanel,
  flowLinkSource,
  addOpSquad,
  clearTemplateFlowEdges,
  removeNodeFlowEdges,
  resetTemplateCanvasLayout,
  handleFlowConnectorClick,
  updateSquadTitleLocal,
  updateSquadMeta,
  updateOpSquadTitleLocal,
  updateOpSquadMeta,
  deleteSquad,
  handleSlotDragOver,
  handleSlotDrop,
  handleSlotDragStart,
  setDraggedSlot,
  updateSlot,
  flushSlotUpdate,
  deleteSlot,
  addSlot,
  dragSnapPreview,
  autoLayoutTemplate,
  alignInactiveSquads,
  autoLayoutSingleSquad,
  squadTypes = [],
  saveDraft,
  savingDraft = false,
  savedDraft = false,
  enableFormMode = true,
  canAssignPlayers: canAssignPlayersPermission = false
}) {
  const [builderFlowMode, setBuilderFlowMode] = useState(true); // exact copy of OrbatTemplate's own Flow/Form toggle, local to the scheduler
  const effectiveFlowMode = !enableFormMode || builderFlowMode;
  const builderCompact = false;
  const selectedRecurrence = selectedRecurrenceId ? recurrences.find((r) => r.id === selectedRecurrenceId) : null;
  const [openMarkerDropdown, setOpenMarkerDropdown] = useState(null);
  const canvasScrollRef = useRef(null);
  const [localServerName, setLocalServerName] = useState(selectedOp.serverName || '');
  const [localTsAddress, setLocalTsAddress] = useState(selectedOp.tsAddress || '');
  const panRef = useRef({ active: false, startX: 0, startY: 0, scrollLeft: 0, scrollTop: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [draggingSquadId, setDraggingSquadId] = useState(null);
  const canAssignPlayers = Boolean(canAssignPlayersPermission);
  const absentPlayers = (selectedOp.absentUserIds || [])
    .map((userId) => users.find((user) => String(user.id) === String(userId)))
    .filter(Boolean)
    .sort((a, b) => String(a.username).localeCompare(String(b.username)));

  const qualifiedPlayersForSlot = (slot) => {
    const requiredRoles = [...new Set([
      slot.role,
      ...(Array.isArray(slot.allowedRoles) ? slot.allowedRoles : [])
    ].filter(Boolean))];
    const assignedUserIds = new Set(
      (selectedOp.squads || []).flatMap((squad) => squad.slots || [])
        .map((operationSlot) => operationSlot.assignedUserId)
        .filter((userId) => userId != null)
        .map(String)
    );
    return users
      .filter((user) => !assignedUserIds.has(String(user.id)))
      .filter((user) => requiredRoles.some((role) => user.permissions?.[role] === true))
      .sort((a, b) => String(a.username).localeCompare(String(b.username)));
  };

  const renderAssignmentPicker = (slot) => {
    if (!canAssignPlayers || slot._pendingCreate) return null;
    const qualifiedPlayers = qualifiedPlayersForSlot(slot);
    const assignedUser = users.find((user) => String(user.id) === String(slot.assignedUserId));
    const selectablePlayers = assignedUser && !qualifiedPlayers.some((user) => String(user.id) === String(assignedUser.id))
      ? [assignedUser, ...qualifiedPlayers]
      : qualifiedPlayers;
    return (
      <select
        className={`slot-player-assignment scheduler-assignment-select ${assignedUser ? 'occupied' : 'free'}`}
        value={assignedUser ? String(assignedUser.id) : 'free'}
        aria-label={`Choose player for ${slot.name}`}
        onChange={async (event) => {
          const selectedValue = event.target.value;
          if (selectedValue === 'free') {
            if (assignedUser) await signOffOpSlot(selectedOp.id, slot.id, true);
            return;
          }
          const userId = Number(event.target.value);
          if (!userId || String(userId) === String(slot.assignedUserId)) return;
          if (assignedUser) await signOffOpSlot(selectedOp.id, slot.id, true);
          await joinOpSlot(selectedOp.id, slot.id, userId);
        }}
      >
        <option value="free">free</option>
        {selectablePlayers.length === 0 ? (
          <option value="" disabled>No qualified players</option>
        ) : selectablePlayers.map((user) => (
          <option key={user.id} value={user.id}>
            {user.username}{user.status && user.status !== 'Active' ? ` (${user.status})` : ''}
          </option>
        ))}
      </select>
    );
  };

  const handleCanvasPanStart = (event) => {
    if (event.button !== 0) return;
    if (event.target.closest('.orbat-node')) return;
    const scrollEl = canvasScrollRef.current;
    if (!scrollEl) return;
    panRef.current = { active: true, startX: event.clientX, startY: event.clientY, scrollLeft: scrollEl.scrollLeft, scrollTop: scrollEl.scrollTop };
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

  // Pseudo-template object so the copied Template Builder code can operate on this operation's
  // current squads. For the scheduler we treat the operation itself as the
  // template key (use `selectedOp.id`) so canvas layout and flow edges are
  // stored separately per-operation and do not affect the original template.
  const template = { id: selectedOp.id, squads: selectedOp.squads || [] };
  const inactiveLayoutSignature = template.squads
    .map((squad) => `${squad.id}:${squad.active !== false}:${squad.slots?.length || 0}`)
    .join('|');
  React.useEffect(() => {
    if (!template.squads.some((squad) => squad.active === false)) return undefined;
    const timer = window.setTimeout(() => alignInactiveSquads(template.id, template.squads), 0);
    return () => window.clearTimeout(timer);
  }, [selectedOp.id, inactiveLayoutSignature]);
  // keep local inputs in sync when switching ops
  React.useEffect(() => {
    setLocalServerName(selectedOp.serverName || '');
    setLocalTsAddress(selectedOp.tsAddress || '');
  }, [selectedOp.id]);
  const builtins = Array.isArray(squadTypes) && squadTypes.length > 0
    ? squadTypes.map((s) => ({ label: s.name, value: s.name, icon: s.icon }))
    : [];
  const orderedSquads = [
    ...template.squads.filter((squad) => squad.active !== false),
    ...template.squads.filter((squad) => squad.active === false)
  ];

  // Precompute canvas nodes/edges when showing the ORBAT canvas to avoid IIFE in JSX.
  // Reuses the exact same flow edges (getTemplateFlowEdges) the admin drew in the Template Builder,
  // so the scheduler ORBAT is a faithful copy of the template's canvas, not the simple parent-tree overview.
  let canvasSize = getCanvasSize(template);
  let nodes = [];
  let nodeMap = new Map();
  let links = [];
  let flowRelationships = [];
  if (effectiveFlowMode && template.squads.length > 0) {
    nodes = template.squads.map((squad, index) => {
      const node = getCanvasNode(template.id, squad.id, index);
      return {
        squad,
        index,
        nodeKey: `flow-${template.id}-${squad.id}`,
        x: node.x,
        y: node.y
      };
    });
    nodeMap = new Map(nodes.map((node) => [node.squad.id, node]));
    flowRelationships = getTemplateFlowEdges(template.id, template.squads);
    links = flowRelationships
      .filter((edge) => nodeMap.has(edge.sourceId) && nodeMap.has(edge.targetId))
      .map((edge) => {
        const source = nodeMap.get(edge.sourceId);
        const target = nodeMap.get(edge.targetId);
        const sourceAnchor = edge.sourceAnchor || 'bottom';
        const targetAnchor = edge.targetAnchor || 'top';
        const anchorPoint = (node, anchor) => {
          const height = getOrbatNodeHeight(node.squad);
          if (anchor === 'left') return { x: node.x, y: node.y + (height / 2) };
          if (anchor === 'right') return { x: node.x + ORBAT_NODE_WIDTH, y: node.y + (height / 2) };
          if (anchor === 'top') return { x: node.x + (ORBAT_NODE_WIDTH / 2), y: node.y };
          return { x: node.x + (ORBAT_NODE_WIDTH / 2), y: node.y + height };
        };
        const sourcePoint = anchorPoint(source, sourceAnchor);
        const targetPoint = anchorPoint(target, targetAnchor);
        return {
          id: edge.id,
          x1: sourcePoint.x,
          y1: sourcePoint.y,
          x2: targetPoint.x,
          y2: targetPoint.y
        };
      });
  }
  const selectedFlowSquadId = flowLinkSource?.templateId === template.id ? flowLinkSource.squadId : null;
  const selectedFlowSquad = template.squads.find((squad) => squad.id === selectedFlowSquadId);
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
    const draggedSquad = preview ? template.squads.find((squad) => squad.id === preview.squadId) : null;
    const shouldBeInactive = Boolean(preview && preview.y >= inactiveSeparatorY);
    stopCanvasDrag();
    setDraggingSquadId(null);
    if (!draggedSquad) return;
    const statusChanged = (draggedSquad.active === false) !== shouldBeInactive;
    const nextSquads = template.squads.map((squad) => (
      squad.id === draggedSquad.id ? { ...squad, active: !shouldBeInactive } : squad
    ));
    if (statusChanged) updateOpSquadMeta(selectedOp.id, draggedSquad.id, { active: !shouldBeInactive });
    if (nextSquads.some((squad) => squad.active === false)) window.setTimeout(() => alignInactiveSquads(template.id, nextSquads), 0);
  };

  return (
    <section className="card">
      <div className="builder-toolbar">
        <button className="secondary small" onClick={goToSchedulerList}>
          ← Back to operations
        </button>
        <div>
          <h3>{selectedOp.name}{selectedRecurrence ? <span className="op-list-badge" style={{marginLeft:'0.5rem'}}>Recurring</span> : null}</h3>
          <p>{selectedOp.date} at {selectedOp.time} &middot; {getTemplateName(selectedOp.templateId)}</p>
        </div>
        <div style={{display:'flex',gap:'0.5rem'}}>
          <button type="button" onClick={saveDraft} disabled={savingDraft}>
            {savingDraft ? 'Saving...' : savedDraft ? 'Saved' : 'Save'}
          </button>
          <select
            value={schedulerLoadTemplateId}
            onChange={(e) => setSchedulerLoadTemplateId(e.target.value)}
          >
            <option value="">Choose template</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
          <button
            className="secondary"
            onClick={() => loadTemplateIntoOp(selectedOp.id, Number(schedulerLoadTemplateId) || null)}
            disabled={!schedulerLoadTemplateId}
          >
            Load template
          </button>
          {selectedRecurrence
            ? <button className="secondary small" onClick={() => { deleteRecurrence(selectedRecurrence.id); goToSchedulerList(); }}>Delete</button>
            : <button className="secondary small" onClick={() => deleteOp(selectedOp.id)}>Delete</button>
          }
          {/* per-op override toggle removed */}
          <div style={{display:'flex',gap:'0.5rem',marginLeft:8}}>
            <button type="button" className={effectiveFlowMode ? '' : 'secondary small'} onClick={() => setBuilderFlowMode(true)}>Flow mode</button>
            {enableFormMode ? (
              <button type="button" className={!effectiveFlowMode ? '' : 'secondary small'} onClick={() => setBuilderFlowMode(false)}>Form mode</button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="operation-absences">
        <strong>Absent players ({absentPlayers.length})</strong>
        {absentPlayers.length ? (
          <div className="operation-absence-list">
            {absentPlayers.map((player) => <span key={player.id}>{player.username}</span>)}
          </div>
        ) : <span className="operation-absence-empty">No players have reported absent.</span>}
      </div>

      <div className="role-add-form" style={{marginBottom:'1rem'}}>
        <input
          placeholder="Server name (optional)"
          value={localServerName}
          onChange={(e) => { setLocalServerName(e.target.value); updateOpMeta(selectedOp.id, { serverName: e.target.value }); }}
        />
        <input
          placeholder="TS3 address (optional)"
          value={localTsAddress}
          onChange={(e) => { setLocalTsAddress(e.target.value); updateOpMeta(selectedOp.id, { tsAddress: e.target.value }); }}
        />
        <select value={selectedOp.campaignId || ''} onChange={(e) => updateOpMeta(selectedOp.id, { campaignId: e.target.value ? Number(e.target.value) : null })}>
          <option value="">No campaign</option>
          {(campaigns || []).map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
      <div className="modlist-dropzone-row">
        <label
          className="modlist-dropzone"
          onDragOver={handleModlistDragOver}
          onDrop={(e) => handleModlistDrop(selectedOp.id, 'player', e)}
        >
          <span>Drag &amp; drop a player modlist file here</span>
          <span className="modlist-upload-button">Choose player modlist</span>
          <input className="visually-hidden" type="file" onChange={(e) => handleModlistSelect(selectedOp.id, 'player', e)} />
        </label>
        <label
          className="modlist-dropzone"
          onDragOver={handleModlistDragOver}
          onDrop={(e) => handleModlistDrop(selectedOp.id, 'server', e)}
        >
          <span>Drag &amp; drop a server modlist file here</span>
          <span className="modlist-upload-button">Choose server modlist</span>
          <input className="visually-hidden" type="file" onChange={(e) => handleModlistSelect(selectedOp.id, 'server', e)} />
        </label>
      </div>

      {/* template-level override UI removed */}
      {effectiveFlowMode ? (
        <div className="flow-layout flow-fullscreen">
          <div className="orbat-wrapper flow-fullscreen-wrapper">
              <div className="flow-canvas-controls">
              <CanvasHelp />
              <button
                type="button"
                className="secondary small"
                onClick={() => addOpSquad(selectedOp.id, template.squads.length)}
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
                onMouseMove={(event) => moveCanvasDrag(event, template)}
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
                {links.map((edge) => (
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

              {nodes.map((node) => {
                const isSelected = selectedFlowSquadId === node.squad.id;
                const collapsedHeight = getOrbatNodeHeight(node.squad);
                const hoverSuppressed = draggingSquadId != null || flowLinkSource?.templateId === template.id;
                const supportsNames = flowRelationships
                  .filter((edge) => String(edge.sourceId) === String(node.squad.id) && ['left', 'right'].includes(edge.sourceAnchor))
                  .map((edge) => nodeMap.get(edge.targetId)?.squad.title || 'Unknown squad');
                const supportedByNames = flowRelationships
                  .filter((edge) => String(edge.targetId) === String(node.squad.id) && ['left', 'right'].includes(edge.targetAnchor))
                  .map((edge) => nodeMap.get(edge.sourceId)?.squad.title || 'Unknown squad');

                return (
                  <div
                    key={node.squad.id}
                    className={`orbat-node flow-node scheduler-node ${openMarkerDropdown === node.squad.id ? 'marker-dropdown-open' : ''} ${hoverSuppressed ? 'hover-suppressed' : ''} ${isSelected ? 'selected' : ''} ${node.squad.active === false ? 'squad-inactive' : ''}`}
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
                      className={`orbat-connector support left clickable ${isSelected && flowLinkSource?.anchor === 'left' ? 'active' : ''}`}
                      onClick={(event) => handleFlowConnectorClick(template.id, node.squad.id, 'left', event)}
                      aria-label={`${node.squad.title} gives support`}
                      title="Gives support"
                    />
                    <button
                      type="button"
                      className="orbat-connector-remove support-remove left"
                      onClick={(event) => removeNodeFlowEdges(template.id, node.squad.id, 'left', event)}
                      aria-label={`Remove left support lines from ${node.squad.title}`}
                      title="Remove left support lines"
                    >
                      ×
                    </button>
                    <button
                      type="button"
                      className={`orbat-connector support right clickable ${isSelected && flowLinkSource?.anchor === 'right' ? 'active' : ''}`}
                      onClick={(event) => handleFlowConnectorClick(template.id, node.squad.id, 'right', event)}
                      aria-label={`${node.squad.title} receives support`}
                      title="Receives support"
                    />
                    <button
                      type="button"
                      className="orbat-connector-remove support-remove right"
                      onClick={(event) => removeNodeFlowEdges(template.id, node.squad.id, 'right', event)}
                      aria-label={`Remove right support lines from ${node.squad.title}`}
                      title="Remove right support lines"
                    >
                      ×
                    </button>
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
                          onChange={(event) => updateOpSquadTitleLocal(selectedOp.id, node.squad.id, event.target.value)}
                          onBlur={(event) => updateOpSquadMeta(selectedOp.id, node.squad.id, { title: event.target.value })}
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
                                <button className="secondary small" onClick={() => { updateOpSquadMeta(selectedOp.id, node.squad.id, { marker: null, markerIconUrl: null }); setOpenMarkerDropdown(null); }}>None</button>
                                {builtins.map((b) => {
                                  const iconSrc = b.icon ? (b.icon.startsWith('/') || b.icon.startsWith('http') ? b.icon : `/markers/${b.icon}`) : null;
                                  return (
                                    <button key={b.label} type="button" className="secondary small" style={{display:'flex',alignItems:'center',gap:8}} onClick={() => { updateOpSquadMeta(selectedOp.id, node.squad.id, { markerIconUrl: iconSrc, marker: null }); setOpenMarkerDropdown(null); }}>
                                      {iconSrc ? <img src={iconSrc} alt={b.label} style={{width:20,height:20}} /> : <span style={{width:20,height:20,display:'inline-block'}} />}
                                      {b.label}
                                    </button>
                                  );
                                })}
                                <div style={{borderTop:'1px solid var(--border)',paddingTop:6}}>
                                  <div style={{fontSize:12,opacity:0.8,marginBottom:6}}>Or choose type</div>
                                  {builtins.map((b) => (
                                    <button key={b.value + '-text'} className="secondary small" onClick={() => { updateOpSquadMeta(selectedOp.id, node.squad.id, { marker: b.value, markerIconUrl: null }); setOpenMarkerDropdown(null); }}>{b.label}</button>
                                  ))}
                                </div>
                              </div>
                            </div>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          className={`squad-switch ${node.squad.active !== false ? 'is-active' : ''}`}
                          role="switch"
                          aria-checked={node.squad.active !== false}
                          aria-label={node.squad.active === false ? 'Squad activeren' : 'Squad uitschakelen'}
                          title={node.squad.active === false ? 'Squad activeren' : 'Squad uitschakelen'}
                          onMouseDown={(event) => event.stopPropagation()}
                          onClick={(event) => { event.stopPropagation(); updateOpSquadMeta(selectedOp.id, node.squad.id, { active: node.squad.active === false }); }}
                        >
                          <span className="squad-switch-track" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="squad-sort-button"
                          title="Automatically position only this squad"
                          aria-label="Automatically position only this squad"
                          onMouseDown={(event) => event.stopPropagation()}
                          onClick={(event) => { event.stopPropagation(); autoLayoutSingleSquad(template.id, template.squads, node.squad.id); }}
                        >
                          Auto
                        </button>
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
                        <span className="squad-count">
                          {squadStats(node.squad).occupied}/{squadStats(node.squad).total} filled
                        </span>
                        <label style={{display:'flex',alignItems:'center',gap:'0.35rem',fontSize:'0.85rem'}}>
                          LR
                          <input
                            type="number"
                            min="0"
                            max="99"
                            className="lr-sr-input"
                            value={node.squad.lrChannel ?? 1}
                            onChange={(e) => updateOpSquadMeta(selectedOp.id, node.squad.id, { lrChannel: Number(e.target.value) })}
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
                            onChange={(e) => updateOpSquadMeta(selectedOp.id, node.squad.id, { srChannel: Number(e.target.value) })}
                          />
                        </label>
                      </div>
                    </div>
                    {(supportsNames.length || supportedByNames.length) ? (
                      <div className="orbat-reports-to support-summary">
                        {supportsNames.length ? <span>Supports: <strong>{supportsNames.join(', ')}</strong></span> : null}
                        {supportedByNames.length ? <span>Supported by: <strong>{supportedByNames.join(', ')}</strong></span> : null}
                      </div>
                    ) : null}
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
                                onChange={(event) => updateOpSlotDebounced(selectedOp.id, slot.id, { name: event.target.value })}
                                onBlur={() => flushOpSlotUpdate(selectedOp.id, slot.id)}
                                disabled={slot._pendingCreate}
                              />
                              <select
                                className="flow-slot-role"
                                value={slot.role}
                                onChange={(event) => updateOpSlotDebounced(selectedOp.id, slot.id, { role: event.target.value })}
                                onBlur={() => flushOpSlotUpdate(selectedOp.id, slot.id)}
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
                              <span className="scheduler-slot-assign">
                                {renderAssignmentPicker(slot)}
                              </span>
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
                      onChange={(e) => updateOpSquadTitleLocal(selectedOp.id, squad.id, e.target.value)}
                      onBlur={(e) => updateOpSquadMeta(selectedOp.id, squad.id, { title: e.target.value })}
                    />
                    <div className="slot-meta-row">
                      <button
                        type="button"
                        className={`squad-switch ${squad.active !== false ? 'is-active' : ''}`}
                        role="switch"
                        aria-checked={squad.active !== false}
                        aria-label={squad.active === false ? 'Squad activeren' : 'Squad uitschakelen'}
                        title={squad.active === false ? 'Squad activeren' : 'Squad uitschakelen'}
                        onClick={() => updateOpSquadMeta(selectedOp.id, squad.id, { active: squad.active === false })}
                      >
                        <span className="squad-switch-track" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="squad-sort-button"
                        title="Automatically position only this squad"
                        onClick={() => autoLayoutSingleSquad(template.id, template.squads, squad.id)}
                      >
                        Auto
                      </button>
                      <span className="squad-count">
                        {squadStats(squad).occupied}/{squadStats(squad).total} filled
                      </span>
                      <label className="slot-meta">
                        LR
                        <input
                          type="number"
                          min="0"
                          max="99"
                          className="lr-sr-input"
                          value={squad.lrChannel ?? 1}
                          onChange={(e) => updateOpSquadMeta(selectedOp.id, squad.id, { lrChannel: Number(e.target.value) })}
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
                          onChange={(e) => updateOpSquadMeta(selectedOp.id, squad.id, { srChannel: Number(e.target.value) })}
                        />
                      </label>
                        <label className="slot-meta">
                          Marker
                          <div style={{position:'relative',display:'inline-block'}} onMouseDown={(e) => e.stopPropagation()}>
                            <button type="button" className="secondary small" onClick={() => setOpenMarkerDropdown(openMarkerDropdown === squad.id ? null : squad.id)}>
                              {squad.markerIconUrl ? <img src={squad.markerIconUrl} alt="marker" className="marker-icon" /> : squad.marker ? <span className={`marker-badge marker-${String(squad.marker).toLowerCase().replace(/\s+/g,'-')}`}>{squad.marker}</span> : 'None'}
                              <span style={{marginLeft:8}}>▾</span>
                            </button>
                            {openMarkerDropdown === squad.id ? (
                              <div style={{position:'absolute',right:0,marginTop:6,zIndex:60,background:'var(--panel)',border:'1px solid var(--border)',borderRadius:8,padding:8,minWidth:180}}>
                                <div style={{display:'flex',flexDirection:'column',gap:6}}>
                                  <button className="secondary small" onClick={() => { updateOpSquadMeta(selectedOp.id, squad.id, { marker: null, markerIconUrl: null }); setOpenMarkerDropdown(null); }}>None</button>
                                  {builtins.map((b) => {
                                    const iconSrc = b.icon ? (b.icon.startsWith('/') || b.icon.startsWith('http') ? b.icon : `/markers/${b.icon}`) : null;
                                    return (
                                      <button key={b.label} type="button" className="secondary small" style={{display:'flex',alignItems:'center',gap:8}} onClick={() => { updateOpSquadMeta(selectedOp.id, squad.id, { markerIconUrl: iconSrc, marker: null }); setOpenMarkerDropdown(null); }}>
                                        {iconSrc ? <img src={iconSrc} alt={b.label} style={{width:20,height:20}} /> : <span style={{width:20,height:20,display:'inline-block'}} />}
                                        {b.label}
                                      </button>
                                    );
                                  })}
                                  <div style={{borderTop:'1px solid var(--border)',paddingTop:6}}>
                                    <div style={{fontSize:12,opacity:0.8,marginBottom:6}}>Or choose type</div>
                                    {builtins.map((b) => (
                                      <button key={b.value + '-text'} className="secondary small" onClick={() => { updateOpSquadMeta(selectedOp.id, squad.id, { marker: b.value, markerIconUrl: null }); setOpenMarkerDropdown(null); }}>{b.label}</button>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            ) : null}
                          </div>
                          {squad.markerIconUrl ? <img src={squad.markerIconUrl} alt="marker" className="marker-icon" /> : null}
                        </label>
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
                            onChange={(e) => updateOpSlotDebounced(selectedOp.id, slot.id, { name: e.target.value })}
                            onBlur={() => flushOpSlotUpdate(selectedOp.id, slot.id)}
                            disabled={slot._pendingCreate}
                          />
                          {!builderCompact ? (
                            <textarea
                              className="slot-notes-input"
                              value={slot.notes}
                              placeholder="Place extra notes here"
                              onChange={(e) => updateOpSlotDebounced(selectedOp.id, slot.id, { notes: e.target.value })}
                              onBlur={() => flushOpSlotUpdate(selectedOp.id, slot.id)}
                              disabled={slot._pendingCreate}
                            />
                          ) : null}
                          <div className="slot-meta-row">
                            <select
                              value={slot.role}
                              onChange={(e) => updateOpSlotDebounced(selectedOp.id, slot.id, { role: e.target.value })}
                              onBlur={() => flushOpSlotUpdate(selectedOp.id, slot.id)}
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
                            {renderAssignmentPicker(slot)}
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

      {selectedRecurrence ? (
        <section className="card">
          <h4>Recurring settings</h4>
          <div className="recurring-settings-form">
            <label>
              Repeat pattern
              <select
                value={selectedRecurrence.recurrence}
                onChange={(e) => updateRecurrence(selectedRecurrence.id, { recurrence: e.target.value })}
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="biweekly">Every 2 weeks</option>
                <option value="monthly">Monthly</option>
              </select>
            </label>

            {(selectedRecurrence.recurrence === 'weekly' || selectedRecurrence.recurrence === 'biweekly') && (
              <div className="weekly-days">
                <label>Choose days:</label>
                <div className="weekday-grid">
                  {weekDayLabels.map((dayOption) => (
                    <label key={dayOption.value}>
                      <input
                        type="checkbox"
                        checked={(selectedRecurrence.weeklyDays || []).includes(dayOption.value)}
                        onChange={() => toggleRecurrenceWeeklyDay(selectedRecurrence, dayOption.value)}
                      />
                      {dayOption.label}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {selectedRecurrence.recurrence === 'monthly' ? (
              <label>
                Day of month
                <input
                  type="number"
                  min="1"
                  max="31"
                  value={selectedRecurrence.monthlyDay || ''}
                  onChange={(e) => updateRecurrence(selectedRecurrence.id, { monthlyDay: Number(e.target.value) })}
                />
              </label>
            ) : null}

            <label>
              Start date
              <input
                type="date"
                value={selectedRecurrence.startDate || ''}
                onChange={(e) => updateRecurrence(selectedRecurrence.id, { startDate: e.target.value })}
              />
            </label>

            <label>
              Time
              <input
                type="time"
                value={selectedRecurrence.time || ''}
                onChange={(e) => updateRecurrence(selectedRecurrence.id, { time: e.target.value })}
              />
            </label>

            <label>
              Repeat until (optional)
              <input
                type="date"
                value={selectedRecurrence.repeatUntil || ''}
                onChange={(e) => updateRecurrence(selectedRecurrence.id, { recurrenceEndDate: e.target.value || null })}
              />
            </label>
          </div>
          <div className="recurring-settings">
            <p><strong>Pattern:</strong> {recurrenceLabel(selectedRecurrence)}</p>
            {selectedRecurrence.nextDateTime ? <p><strong>Next occurrence:</strong> {selectedRecurrence.nextDateTime?.slice(0, 10)} {selectedRecurrence.nextDateTime?.slice(11, 16)}</p> : <p><strong>Next occurrence:</strong> None scheduled</p>}
          </div>
        </section>
      ) : null}
    </section>
  );
}
