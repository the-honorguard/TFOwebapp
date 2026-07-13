import React, { useState } from 'react';

/**
 * OrbatTemplate
 * - Template builder view: renders template sections in a flow/canvas layout or grid form
 * - No occupant information is present here; this view is used for editing template structure
 * - Expects a set of handler functions from the parent to perform mutations (add/delete/update)
 */
export default function OrbatTemplate({
  template,
  builderFlowMode,
  builderCompact,
  allRoles,
  nodeHeights,
  flowLinkSource,
  getCanvasSize,
  getCanvasNode,
  getTemplateFlowEdges,
  addSectionQuick,
  clearTemplateFlowEdges,
  resetTemplateCanvasLayout,
  moveCanvasDrag,
  stopCanvasDrag,
  startCanvasDrag,
  setNodeHeightRef,
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
  isAdmin,
  isMissionmaker,
  
  uploadCustomMarker
  
}) {
  const fileInputs = {};
  const triggerFileInput = (sectionId) => {
    const el = document.getElementById(`marker-upload-${sectionId}`);
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
  const [openMarkerDropdown, setOpenMarkerDropdown] = useState(null);
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
  return (
    <div>
      {/* template-level override UI removed */}
      {builderFlowMode ? (
        (() => {
          const canvasSize = getCanvasSize(template);
          const nodes = template.sections.map((section, index) => {
            const node = getCanvasNode(template.id, section.id, index);
            return {
              section,
              index,
                nodeKey: `flow-${template.id}-${section.id}`,
              x: node.x,
              y: node.y
            };
          });
          const nodeMap = new Map(nodes.map((node) => [node.section.id, node]));
          const edges = getTemplateFlowEdges(template.id, template.sections)
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
          const selectedFlowSectionId = flowLinkSource?.templateId === template.id ? flowLinkSource.sectionId : null;
          const selectedFlowSection = template.sections.find((section) => section.id === selectedFlowSectionId);

          return (
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
                </div>
                <div
                  className="orbat-canvas drag-canvas"
                  style={{ width: `${canvasSize.width}px`, height: `${canvasSize.height}px` }}
                  onMouseMove={(event) => moveCanvasDrag(event, template)}
                  onMouseUp={stopCanvasDrag}
                  onMouseLeave={stopCanvasDrag}
                >
                  <svg className="orbat-links" width={canvasSize.width} height={canvasSize.height}>
                    {edges.map((edge) => (
                      <line
                        key={edge.id}
                        x1={edge.x1}
                        y1={edge.y1}
                        x2={edge.x2}
                        y2={edge.y2}
                        className="orbat-link"
                      />
                    ))}
                  </svg>

                  {nodes.map((node) => {
                    const isSelected = selectedFlowSectionId === node.section.id;

                    return (
                      <div
                        key={node.section.id}
                        className={`orbat-node flow-node ${isSelected ? 'selected' : ''}`}
                        style={{ left: `${node.x}px`, top: `${node.y}px` }}
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
                            <button
                              type="button"
                              className="danger-x-button"
                              onClick={(e) => { e.stopPropagation(); deleteSection(template.id, node.section.id); }}
                              aria-label="Delete section"
                            >
                              ✕
                            </button>
                            {node.section.markerIconUrl ? (
                              <img src={node.section.markerIconUrl} alt="marker" className="marker-icon" />
                            ) : node.section.marker ? (
                              <span className={`marker-badge marker-${String(node.section.marker).toLowerCase().replace(/\s+/g,'-')}`}>{node.section.marker}</span>
                            ) : null}
                          </div>
                          <div className="flow-meta-row" onMouseDown={(e) => e.stopPropagation()}>
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
                            <label style={{display:'flex',alignItems:'center',gap:'0.35rem',fontSize:'0.85rem'}}>
                              Marker
                              <div style={{position:'relative',display:'inline-block'}} onMouseDown={(e) => e.stopPropagation()}>
                                <button type="button" className="secondary small" onClick={() => setOpenMarkerDropdown(openMarkerDropdown === node.section.id ? null : node.section.id)}>
                                  {node.section.markerIconUrl ? <img src={node.section.markerIconUrl} alt="marker" className="marker-icon" /> : node.section.marker ? <span className={`marker-badge marker-${String(node.section.marker).toLowerCase().replace(/\s+/g,'-')}`}>{node.section.marker}</span> : 'None'}
                                  <span style={{marginLeft:8}}>▾</span>
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
                              {canUpload ? (
                                <>
                                  <input id={`marker-upload-${node.section.id}`} style={{display:'none'}} type="file" accept=".svg,.png,.jpg,.jpeg" onChange={(e) => handleFileChange(template.id, node.section.id, e)} />
                                  <button type="button" className="secondary small" onClick={() => triggerFileInput(node.section.id)}>Upload</button>
                                </>
                              ) : null}
                            </label>
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
              {selectedFlowSection ? (
                <p className="flow-help">
                  Link source: <strong>{selectedFlowSection.title}</strong>. Now click a connector on a second section..
                </p>
              ) : (
                <p className="flow-help">Click a top/bottom connector, then click a connector on a second section.</p>
              )}
            </div>
          );
        })()
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
                              <input id={`marker-upload-panel-${section.id}`} style={{display:'none'}} type="file" accept=".svg,.png,.jpg,.jpeg" onChange={(e) => handleFileChange(template.id, section.id, e)} />
                              <button type="button" className="secondary small" onClick={() => document.getElementById(`marker-upload-panel-${section.id}`)?.click()}>Upload</button>
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
