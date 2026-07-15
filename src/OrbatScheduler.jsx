import React, { useState, useRef } from 'react';

/**
 * OrbatScheduler
 * - Editable ORBAT view for one scheduled operation (scheduler detail page).
 * - Reuses the same canvas/form rendering logic as the Template Builder.
 * - Receives a large set of handlers and helpers from `App` so the scheduler
 *   can operate on the selected operation's template sections and slots.
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
  updateOpSectionMeta,
  campaigns,
  users,
  updateOpSlot,
  allRoles,
  weekDayLabels,
  toggleRecurrenceWeeklyDay,
  updateRecurrence,
  recurrenceLabel,
  isAdmin,
  isMissionmaker,
  uploadCustomMarker,
  getCanvasSize,
  getCanvasNode,
  resolveSectionParentId,
  getTemplateFlowEdges,
  nodeHeights,
  setNodeHeightRef,
  moveCanvasDrag,
  stopCanvasDrag,
  startCanvasDrag,
  updateSectionParent,
  sectionStats
  ,
  auth,
  joinOpSlot,
  signOffOpSlot,
  setShowLoginPanel,
  flowLinkSource,
  addSectionQuick,
  clearTemplateFlowEdges,
  resetTemplateCanvasLayout,
  handleFlowConnectorClick,
  updateSectionTitleLocal,
  updateSectionMeta,
  deleteSection,
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
}) {
  const [builderFlowMode, setBuilderFlowMode] = useState(true); // exact copy of OrbatTemplate's own Flow/Form toggle, local to the scheduler
  const builderCompact = false;
  const selectedRecurrence = selectedRecurrenceId ? recurrences.find((r) => r.id === selectedRecurrenceId) : null;
  const [openMarkerDropdown, setOpenMarkerDropdown] = useState(null);
  const canvasScrollRef = useRef(null);
  const panRef = useRef({ active: false, startX: 0, startY: 0, scrollLeft: 0, scrollTop: 0 });
  const [isPanning, setIsPanning] = useState(false);

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
  // current sections (which come from selectedOp.templateId).
  const template = { id: selectedOp.templateId, sections: selectedOp.sections || [] };
  const fileInputs = {};
  const triggerFileInput = (sectionId) => {
    const el = document.getElementById(`scheduler-marker-upload-${sectionId}`);
    if (el) el.click();
  };
  const handleFileChange = async (templateId, sectionId, e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const url = await uploadCustomMarker(file);
      await updateSectionMeta(templateId, sectionId, { markerIconUrl: url });
    } catch (err) {
      alert(err.message || 'Upload failed');
    }
  };
  const canUpload = Boolean(isAdmin || isMissionmaker);
  const builtins = [
    { label: 'Infantry', value: 'Infantry', file: 'infantry' },
    { label: 'Armor', value: 'Armor', file: 'armor' },
    { label: 'Artillery', value: 'Artillery', file: 'artillery' },
    { label: 'HQ', value: 'HQ', file: 'hq' },
    { label: 'Logistics', value: 'Logistics', file: 'logistics' },
    { label: 'Medic', value: 'Medic', file: 'medic' },
    { label: 'Recon', value: 'Recon', file: 'recon' },
    { label: 'Engineer', value: 'Engineer', file: 'engineer' }
  ];

  // Precompute canvas nodes/edges when showing the ORBAT canvas to avoid IIFE in JSX.
  // Reuses the exact same flow edges (getTemplateFlowEdges) the admin drew in the Template Builder,
  // so the scheduler ORBAT is a faithful copy of the template's canvas, not the simple parent-tree overview.
  let canvasSize;
  let nodes = [];
  let nodeMap = new Map();
  let links = [];
  if (builderFlowMode && template.sections.length > 0) {
    canvasSize = getCanvasSize(template);
    nodes = template.sections.map((section, index) => {
      const node = getCanvasNode(template.id, section.id, index);
      return {
        section,
        index,
        nodeKey: `flow-${template.id}-${section.id}`,
        x: node.x,
        y: node.y
      };
    });
    nodeMap = new Map(nodes.map((node) => [node.section.id, node]));
    links = getTemplateFlowEdges(template.id, template.sections)
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
  }
  const selectedFlowSectionId = flowLinkSource?.templateId === template.id ? flowLinkSource.sectionId : null;
  const selectedFlowSection = template.sections.find((section) => section.id === selectedFlowSectionId);

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
            <button type="button" className={builderFlowMode ? '' : 'secondary small'} onClick={() => setBuilderFlowMode(true)}>Flow mode</button>
            <button type="button" className={!builderFlowMode ? '' : 'secondary small'} onClick={() => setBuilderFlowMode(false)}>Form mode</button>
          </div>
        </div>
      </div>

      <div className="role-add-form" style={{marginBottom:'1rem'}}>
        <input
          placeholder="Server name (optional)"
          value={selectedOp.serverName || ''}
          onChange={(e) => updateOpMeta(selectedOp.id, { serverName: e.target.value })}
        />
        <input
          placeholder="TS3 address (optional)"
          value={selectedOp.tsAddress || ''}
          onChange={(e) => updateOpMeta(selectedOp.id, { tsAddress: e.target.value })}
        />
        <select value={selectedOp.campaignId || ''} onChange={(e) => updateOpMeta(selectedOp.id, { campaignId: e.target.value ? Number(e.target.value) : null })}>
          <option value="">No campaign</option>
          {(campaigns || []).map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
      <div className="modlist-dropzone-row">
        <div
          className="modlist-dropzone"
          onDragOver={handleModlistDragOver}
          onDrop={(e) => handleModlistDrop(selectedOp.id, 'player', e)}
        >
          Drag &amp; drop a player modlist file here
        </div>
        <div
          className="modlist-dropzone"
          onDragOver={handleModlistDragOver}
          onDrop={(e) => handleModlistDrop(selectedOp.id, 'server', e)}
        >
          Drag &amp; drop a server modlist file here
        </div>
      </div>

      {/* template-level override UI removed */}
      {builderFlowMode ? (
        <div className="flow-layout flow-fullscreen">
          <div className="orbat-wrapper flow-fullscreen-wrapper">
            <div className="flow-canvas-controls">
              <button
                type="button"
                className="secondary small"
                onClick={() => addSectionQuick(template.id, template.sections.length)}
              >
                + Section
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

              {dragSnapPreview && dragSnapPreview.templateId === template.id ? (
                (() => {
                  const h = nodeHeights[`flow-${template.id}-${dragSnapPreview.sectionId}`] || 124;
                  return (
                    <div
                      className="flow-drag-ghost"
                      style={{ left: `${dragSnapPreview.x}px`, top: `${dragSnapPreview.y}px`, width: `${7 * 40}px`, height: `${h}px` }}
                    />
                  );
                })()
              ) : null}

              {nodes.map((node) => {
                const isSelected = selectedFlowSectionId === node.section.id;

                return (
                  <div
                    key={node.section.id}
                    className={`orbat-node flow-node ${isSelected ? 'selected' : ''}`}
                    style={{ left: `${node.x}px`, top: `${node.y}px`, width: `${7 * 40}px` }}
                    ref={setNodeHeightRef(node.nodeKey)}
                  >
                    <button
                      type="button"
                      className={`orbat-connector top clickable ${isSelected && flowLinkSource?.anchor === 'top' ? 'active' : ''}`}
                      onClick={(event) => handleFlowConnectorClick(template.id, node.section.id, 'top', event)}
                      aria-label="Connect from top"
                    />
                    <button
                      type="button"
                      className={`orbat-connector bottom clickable ${isSelected && flowLinkSource?.anchor === 'bottom' ? 'active' : ''}`}
                      onClick={(event) => handleFlowConnectorClick(template.id, node.section.id, 'bottom', event)}
                      aria-label="Connect from bottom"
                    />
                    <div
                      className="orbat-node-head"
                      onMouseDown={(event) => startCanvasDrag(event, template.id, node.section.id, node.index)}
                    >
                      <div className="orbat-title-row">
                        <input
                          className="section-title-input"
                          value={node.section.title}
                          placeholder="Section title"
                          onMouseDown={(event) => event.stopPropagation()}
                          onChange={(event) => updateSectionTitleLocal(template.id, node.section.id, event.target.value)}
                          onBlur={(event) => updateSectionMeta(template.id, node.section.id, { title: event.target.value })}
                        />
                        <div style={{display:'inline-block', position:'relative'}} onMouseDown={(e) => e.stopPropagation()}>
                          <button type="button" className="marker-dropdown-btn" onClick={() => setOpenMarkerDropdown(openMarkerDropdown === node.section.id ? null : node.section.id)}>
                            <span className="marker-dropdown-icon">
                              {node.section.markerIconUrl ? <img src={node.section.markerIconUrl} alt="marker" style={{width:'100%',height:'100%',objectFit:'contain',display:'block'}} /> : node.section.marker ? <span className={`marker-badge marker-${String(node.section.marker).toLowerCase().replace(/\s+/g,'-')}`} style={{fontSize:'0.6rem'}}>{node.section.marker}</span> : null}
                            </span>
                            <span className="marker-dropdown-arrow">▾</span>
                          </button>
                          {openMarkerDropdown === node.section.id ? (
                            <div style={{position:'absolute',right:0,marginTop:6,zIndex:60,background:'var(--panel)',border:'1px solid var(--border)',borderRadius:8,padding:8,minWidth:180}}>
                              <div style={{display:'flex',flexDirection:'column',gap:6}}>
                                <button className="secondary small" onClick={() => { updateSectionMeta(template.id, node.section.id, { marker: null, markerIconUrl: null }); setOpenMarkerDropdown(null); }}>None</button>
                                {builtins.map((b) => (
                                  <button key={b.file} type="button" className="secondary small" style={{display:'flex',alignItems:'center',gap:8}} onClick={() => { updateSectionMeta(template.id, node.section.id, { markerIconUrl: `/markers/${b.file}.svg`, marker: null }); setOpenMarkerDropdown(null); }}>
                                    <img src={`/markers/${b.file}.svg`} alt={b.label} style={{width:20,height:20}} />
                                    {b.label}
                                  </button>
                                ))}
                                <div style={{borderTop:'1px solid var(--border)',paddingTop:6}}>
                                  <div style={{fontSize:12,opacity:0.8,marginBottom:6}}>Or choose type</div>
                                  {builtins.map((b) => (
                                    <button key={b.value+'-text'} className="secondary small" onClick={() => { updateSectionMeta(template.id, node.section.id, { marker: b.value, markerIconUrl: null }); setOpenMarkerDropdown(null); }}>{b.label}</button>
                                  ))}
                                </div>
                              </div>
                            </div>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          className="danger-x-button"
                          onClick={(e) => { e.stopPropagation(); deleteSection(template.id, node.section.id); }}
                          aria-label="Delete section"
                        >
                          ✕
                        </button>
                      </div>
                      <div className="flow-meta-row" onMouseDown={(e) => e.stopPropagation()}>
                        <span className="section-count">
                          {sectionStats(node.section).occupied}/{sectionStats(node.section).total} filled
                        </span>
                        <label style={{display:'flex',alignItems:'center',gap:'0.35rem',fontSize:'0.85rem'}}>
                          LR
                          <input
                            type="number"
                            min="0"
                            max="99"
                            className="lr-sr-input"
                            value={node.section.lrChannel ?? 1}
                            onChange={(e) => updateSectionMeta(template.id, node.section.id, { lrChannel: Number(e.target.value) })}
                          />
                        </label>
                        <label style={{display:'flex',alignItems:'center',gap:'0.35rem',fontSize:'0.85rem'}}>
                          SR
                          <input
                            type="number"
                            min="0"
                            max="99"
                            className="lr-sr-input"
                            value={node.section.srChannel ?? 1}
                            onChange={(e) => updateSectionMeta(template.id, node.section.id, { srChannel: Number(e.target.value) })}
                          />
                        </label>
                        {canUpload ? (
                          <>
                            <input id={`scheduler-marker-upload-${node.section.id}`} style={{display:'none'}} type="file" accept=".svg,.png,.jpg,.jpeg" onChange={(e) => handleFileChange(template.id, node.section.id, e)} />
                            <button type="button" className="secondary small" onClick={() => triggerFileInput(node.section.id)}>Upload</button>
                          </>
                        ) : null}
                      </div>
                    </div>
                    <div className="flow-node-body" onClick={(event) => event.stopPropagation()}>
                      <div className="flow-slot-list">
                        {node.section.slots.length === 0 ? (
                          <p className="panel-empty">No slots yet.</p>
                        ) : (
                          node.section.slots.map((slot) => (
                            <div
                              key={slot.id}
                              className="flow-slot-row"
                              onDragOver={(event) => handleSlotDragOver(template.id, node.section.id, event)}
                              onDrop={(event) => handleSlotDrop(template.id, node.section.id, slot.id, event)}
                            >
                              <button
                                type="button"
                                className="slot-drag-handle"
                                draggable={!slot._pendingCreate}
                                disabled={slot._pendingCreate}
                                onDragStart={(event) => handleSlotDragStart(template.id, node.section.id, slot.id, event)}
                                onDragEnd={() => setDraggedSlot(null)}
                                aria-label="Drag slot"
                              >
                                ≡
                              </button>
                              <div style={{display:'flex',flexDirection:'column',gap:2,minWidth:0}}>
                                <input
                                  className="flow-slot-name"
                                  value={slot.name}
                                  placeholder="Slot name"
                                  onChange={(event) => updateSlot(template.id, slot.id, { name: event.target.value })}
                                  onBlur={() => flushSlotUpdate(template.id, slot.id)}
                                  disabled={slot._pendingCreate}
                                />
                                {(() => {
                                  const assignedUser = users.find((user) => user.id === slot.assignedUserId);
                                  return (
                                    <span style={{display:'flex',flexDirection:'column',gap:2,alignItems:'flex-start'}}>
                                      <span className={`slot-badge ${assignedUser ? 'occupied' : 'free'}`}>
                                        {assignedUser ? 'occupied' : 'free'}
                                      </span>
                                      {assignedUser ? <span className="orbat-slot-text" style={{maxWidth:'100%'}}>{assignedUser.username}</span> : null}
                                    </span>
                                  );
                                })()}
                              </div>
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
                        onClick={() => addSlot(template.id, node.section.id)}
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
          {selectedFlowSection ? (
            <p className="flow-help">
              Link source: <strong>{selectedFlowSection.title}</strong>. Now click a connector on a second section..
            </p>
          ) : (
            <p className="flow-help">Click a top/bottom connector, then click a connector on a second section.</p>
          )}
        </div>
      ) : template.sections.length === 0 ? (
        <div className="empty-state">This template has no sections yet. Add a section to start.</div>
      ) : (
          <div className={builderCompact ? 'builder-grid compact' : 'builder-grid'}>
            {template.sections.map((section, index) => (
              <div key={section.id} className={`builder-panel panel-${index % 5} ${builderCompact ? 'compact' : ''}`}>
                <div className="panel-title">
                  <div className="panel-title-text">
                    <input
                      className="section-title-input"
                      value={section.title}
                      placeholder="Section title"
                      onChange={(e) => updateSectionTitleLocal(template.id, section.id, e.target.value)}
                      onBlur={(e) => updateSectionMeta(template.id, section.id, { title: e.target.value })}
                    />
                    <div className="slot-meta-row">
                      <span className="section-count">
                        {sectionStats(section).occupied}/{sectionStats(section).total} filled
                      </span>
                      <label className="slot-meta">
                        LR
                        <input
                          type="number"
                          min="0"
                          max="99"
                          className="lr-sr-input"
                          value={section.lrChannel ?? 1}
                          onChange={(e) => updateSectionMeta(template.id, section.id, { lrChannel: Number(e.target.value) })}
                        />
                      </label>
                      <label className="slot-meta">
                        SR
                        <input
                          type="number"
                          min="0"
                          max="99"
                          className="lr-sr-input"
                          value={section.srChannel ?? 1}
                          onChange={(e) => updateSectionMeta(template.id, section.id, { srChannel: Number(e.target.value) })}
                        />
                      </label>
                        <label className="slot-meta">
                          Marker
                          <div style={{position:'relative',display:'inline-block'}} onMouseDown={(e) => e.stopPropagation()}>
                            <button type="button" className="secondary small" onClick={() => setOpenMarkerDropdown(openMarkerDropdown === section.id ? null : section.id)}>
                              {section.markerIconUrl ? <img src={section.markerIconUrl} alt="marker" className="marker-icon" /> : section.marker ? <span className={`marker-badge marker-${String(section.marker).toLowerCase().replace(/\s+/g,'-')}`}>{section.marker}</span> : 'None'}
                              <span style={{marginLeft:8}}>▾</span>
                            </button>
                            {openMarkerDropdown === section.id ? (
                              <div style={{position:'absolute',right:0,marginTop:6,zIndex:60,background:'var(--panel)',border:'1px solid var(--border)',borderRadius:8,padding:8,minWidth:180}}>
                                <div style={{display:'flex',flexDirection:'column',gap:6}}>
                                  <button className="secondary small" onClick={() => { updateSectionMeta(template.id, section.id, { marker: null, markerIconUrl: null }); setOpenMarkerDropdown(null); }}>None</button>
                                  {builtins.map((b) => (
                                    <button key={b.file} type="button" className="secondary small" style={{display:'flex',alignItems:'center',gap:8}} onClick={() => { updateSectionMeta(template.id, section.id, { markerIconUrl: `/markers/${b.file}.svg`, marker: null }); setOpenMarkerDropdown(null); }}>
                                      <img src={`/markers/${b.file}.svg`} alt={b.label} style={{width:20,height:20}} />
                                      {b.label}
                                    </button>
                                  ))}
                                  <div style={{borderTop:'1px solid var(--border)',paddingTop:6}}>
                                    <div style={{fontSize:12,opacity:0.8,marginBottom:6}}>Or choose type</div>
                                    {builtins.map((b) => (
                                      <button key={b.value+'-text'} className="secondary small" onClick={() => { updateSectionMeta(template.id, section.id, { marker: b.value, markerIconUrl: null }); setOpenMarkerDropdown(null); }}>{b.label}</button>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            ) : null}
                          </div>
                          {canUpload ? (
                            <>
                              <input id={`scheduler-marker-upload-panel-${section.id}`} style={{display:'none'}} type="file" accept=".svg,.png,.jpg,.jpeg" onChange={(e) => handleFileChange(template.id, section.id, e)} />
                              <button type="button" className="secondary small" onClick={() => document.getElementById(`scheduler-marker-upload-panel-${section.id}`)?.click()}>Upload</button>
                            </>
                          ) : null}
                          {section.markerIconUrl ? <img src={section.markerIconUrl} alt="marker" className="marker-icon" /> : null}
                        </label>
                    </div>
                  </div>
                  <div className="slot-actions">
                    <button onClick={() => addSlot(template.id, section.id)} className="secondary small">
                      Add slot
                    </button>
                  </div>
                </div>
                <div className="panel-content">
                  {section.slots.length === 0 ? (
                    <p className="panel-empty">No slots in this section.</p>
                  ) : (
                    section.slots.map((slot) => (
                      <div
                        key={slot.id}
                        className={`slot-card builder-slot ${builderCompact ? 'compact' : ''}`}
                        onDragOver={(event) => handleSlotDragOver(template.id, section.id, event)}
                        onDrop={(event) => handleSlotDrop(template.id, section.id, slot.id, event)}
                      >
                        <div>
                          <button
                            type="button"
                            className="slot-drag-handle"
                            draggable={!slot._pendingCreate}
                            disabled={slot._pendingCreate}
                            onDragStart={(event) => handleSlotDragStart(template.id, section.id, slot.id, event)}
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
                          <span style={{display:'flex',alignItems:'center',gap:'0.3rem'}}>
                            <span className={`slot-badge ${slot.assignedUserId ? 'occupied' : 'free'}`}>
                              {slot.assignedUserId ? 'occupied' : 'free'}
                            </span>
                            {(() => {
                              const assignedUser = users.find((user) => user.id === slot.assignedUserId);
                              return assignedUser ? <span className="orbat-slot-text">{assignedUser.username}</span> : null;
                            })()}
                          </span>
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
