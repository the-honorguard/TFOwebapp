/**
 * Read-only ORBAT view used on the public/overview page for upcoming operations.
 * This component is a presentational view: it receives operation data and a set
 * of helper callbacks from the parent `App` component and renders the ORBAT canvas
 * or grid depending on `effectiveOverviewMode`.
 *
 * Props: see parameter list below (kept explicit for clarity).
 */
export default function OrbatOverview({
  op,
  users,
  auth,
  isAdmin,
  isMissionmaker,
  allRoles,
  effectiveOverviewMode,
  getTemplateName,
  getCanvasSize,
  getCanvasNode,
  resolveSectionParentId,
  nodeHeights,
  setNodeHeightRef,
  moveCanvasDrag,
  stopCanvasDrag,
  startCanvasDrag,
  updateSectionParent,
  sectionStats,
  joinOpSlot,
  signOffOpSlot,
  updateOpSlot,
  updateOpSlotDebounced,
  flushOpSlotUpdate,
  setShowLoginPanel,
  showOpInScheduler,
  campaignImage
}) {
  return (
    <section className="card">
      <div className="builder-toolbar">
        {campaignImage ? (
          <div style={{marginBottom:'0.5rem'}}>
            <img src={campaignImage} alt="Campaign" style={{maxWidth:280,maxHeight:120,objectFit:'cover',borderRadius:6}} />
          </div>
        ) : null}
        <div>
          <h4>{op.serverName || op.name}</h4>
          <p>{op.date} at {op.time} using {getTemplateName(op.templateId)}.</p>
          <p className="op-info">
            {op.serverName ? `${op.serverName}` : ''}
            {op.tsAddress ? (
              <>
                {op.serverName ? ' · ' : ''}
                <a href={`ts3server://${op.tsAddress}`}>{op.tsAddress}</a>
              </>
            ) : null}
          </p>
        </div>
        <div style={{display:'flex',gap:'0.5rem'}}>
          {(isAdmin || isMissionmaker) ? (
            <button className="secondary small" onClick={() => showOpInScheduler(op.id)}>
              Open in Operation Scheduler
            </button>
          ) : null}
        </div>
      </div>
      {op.sections?.length === 0 ? (
        <div className="empty-state">This operation has no sections.</div>
      ) : effectiveOverviewMode === 'orbat' ? (
        (() => {
          const canvasTemplate = { id: op.templateId, sections: op.sections };
          const canvasSize = getCanvasSize(canvasTemplate);
          const nodes = op.sections.map((section, index) => {
            const node = getCanvasNode(op.templateId, section.id, index);
            return {
              section,
              index,
              nodeKey: `overview-${op.id}-${section.id}`,
              x: node.x,
              y: node.y,
              parentId: resolveSectionParentId(op.templateId, op.sections, section.id, index)
            };
          });

          const nodeMap = new Map(nodes.map((node) => [node.section.id, node]));
          const links = nodes
            .filter((node) => node.parentId && nodeMap.has(node.parentId))
            .map((node) => {
              const parent = nodeMap.get(node.parentId);
              return {
                id: `${parent.section.id}-${node.section.id}`,
                x1: parent.x + 140,
                y1: parent.y + (nodeHeights[parent.nodeKey] || 172),
                x2: node.x + 140,
                y2: node.y
              };
            });

          return (
            <div className="orbat-wrapper">
              <div
                className="orbat-canvas drag-canvas"
                style={{ width: `${canvasSize.width}px`, height: `${canvasSize.height}px` }}
                onMouseMove={(event) => moveCanvasDrag(event, canvasTemplate)}
                onMouseUp={stopCanvasDrag}
                onMouseLeave={stopCanvasDrag}
              >
                <svg className="orbat-links" width={canvasSize.width} height={canvasSize.height}>
                  {links.map((link) => (
                    <line
                      key={link.id}
                      x1={link.x1}
                      y1={link.y1}
                      x2={link.x2}
                      y2={link.y2}
                      className="orbat-link"
                    />
                  ))}
                </svg>

                {/* Blueprint-style server info overlay */}
                <div className="orbat-blueprint" aria-hidden="true">
                  <h5>Server</h5>
                  <div className="blueprint-line"><strong>Name:</strong> {op.serverName || '-'}</div>
                  <div className="blueprint-line"><strong>Address:</strong> {op.tsAddress || '-'}</div>
                  <div className="blueprint-line"><strong>Date:</strong> {op.date ? `${op.date}${op.time ? ' ' + op.time : ''}` : '-'}</div>
                  <div className="blueprint-line"><strong>Campaign:</strong> {op.campaign || '-'}</div>
                  {op.modlist ? <div className="blueprint-line"><strong>Modlist:</strong> {op.modlist}</div> : null}
                  {op.modlistServer ? <div className="blueprint-line"><strong>Server Mods:</strong> {op.modlistServer}</div> : null}
                </div>
                {nodes.map((node) => (
                  <div
                    key={node.section.id}
                    className="orbat-node"
                    style={{ left: `${node.x}px`, top: `${node.y}px` }}
                    ref={setNodeHeightRef(node.nodeKey)}
                  >
                    <span className="orbat-connector top" aria-hidden="true" />
                    <span className="orbat-connector bottom" aria-hidden="true" />
                    <div
                      className="orbat-node-head"
                      onMouseDown={isAdmin ? (event) => startCanvasDrag(event, op.templateId, node.section.id, node.index) : undefined}
                    >
                      <strong>{node.section.title}</strong>
                      <span className="section-count">
                        {sectionStats(node.section).occupied}/{sectionStats(node.section).total} filled
                      </span>
                      <span className="slot-meta">LR {node.section.lrChannel ?? '-'} · SR {node.section.srChannel ?? '-'}</span>
                      {node.section.markerIconUrl ? (
                        <img src={node.section.markerIconUrl} alt="marker" className="marker-icon" />
                      ) : node.section.marker ? (
                        <span className={`marker-badge marker-${String(node.section.marker).toLowerCase().replace(/\s+/g,'-')}`}>{node.section.marker}</span>
                      ) : null}
                    </div>

                    {isAdmin ? (
                      <select
                        className="orbat-parent-select"
                        value={node.parentId || ''}
                        onChange={(event) => updateSectionParent(op.templateId, node.section.id, event.target.value || null)}
                      >
                        <option value="">Top command</option>
                        {op.sections
                          .filter((section) => section.id !== node.section.id)
                          .map((section) => (
                            <option key={section.id} value={section.id}>
                              Reports to {section.title}
                            </option>
                          ))}
                      </select>
                    ) : null}

                    <div className="orbat-slot-list">
                      {node.section.slots.slice(0, 6).map((slot) => {
                        const assignedUser = users.find((user) => user.id === slot.assignedUserId);
                        const avatarUrl = assignedUser?.profile?.avatarUrl || assignedUser?.avatarUrl || null;
                        const allowedRoles = slot.allowedRoles || [];
                        const canJoin = !assignedUser && (allowedRoles.length === 0 || allowedRoles.includes(auth?.role) || auth?.role === 'admin');
                        const isOwnSlot = Boolean(auth && slot.assignedUserId === auth.id);
                        return (
                          <div key={slot.id} className="orbat-slot-item">
                            <span className={`slot-badge ${assignedUser ? 'occupied' : 'free'}`}>
                              {assignedUser ? 'occupied' : 'free'}
                            </span>
                            <span className="orbat-slot-text">{slot.name}</span>
                            {assignedUser && avatarUrl ? (
                              <img src={avatarUrl} alt="avatar" className="slot-avatar" />
                            ) : null}
                            {isOwnSlot ? (
                              <button
                                type="button"
                                className="secondary small orbat-slot-join"
                                onClick={() => signOffOpSlot(op.id, slot.id)}
                              >
                                Sign off
                              </button>
                            ) : auth && canJoin ? (
                              <button
                                type="button"
                                className="secondary small orbat-slot-join"
                                onClick={() => joinOpSlot(op.id, slot.id)}
                              >
                                Join
                              </button>
                            ) : !auth && !assignedUser ? (
                              <button
                                type="button"
                                className="secondary small orbat-slot-join"
                                onClick={() => setShowLoginPanel(true)}
                              >
                                Login
                              </button>
                            ) : null}
                          </div>
                        );
                      })}
                      {node.section.slots.length > 6 ? (
                        <div className="orbat-slot-more">+{node.section.slots.length - 6} more slots</div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()
      ) : (
        <div className="builder-grid">
          {op.sections.map((section, index) => (
            <div key={section.id} className={`builder-panel panel-${index % 5}`}>
                <div className="panel-title">
                <strong>{section.title}</strong>
                <span className="slot-meta">LR {section.lrChannel ?? '-'} · SR {section.srChannel ?? '-'}</span>
                {section.markerIconUrl ? <img src={section.markerIconUrl} alt="marker" className="marker-icon" /> : section.marker ? <span className={`marker-badge marker-${String(section.marker).toLowerCase().replace(/\s+/g,'-')}`}>{section.marker}</span> : null}
              </div>
              <div className="panel-content">
                {section.slots.length === 0 ? (
                  <p className="panel-empty">No slots in this section.</p>
                ) : (
                      section.slots.map((slot) => {
                    const assignedUser = users.find((user) => user.id === slot.assignedUserId);
                    const avatarUrl = assignedUser?.profile?.avatarUrl || assignedUser?.avatarUrl || null;
                    const allowedRoles = slot.allowedRoles || [];
                    const canJoin = !assignedUser && (allowedRoles.length === 0 || allowedRoles.includes(auth?.role) || auth?.role === 'admin');
                    const isOwnSlot = Boolean(auth && slot.assignedUserId === auth.id);

                    return (
                      <div key={slot.id} className="slot-card">
                        <div>
                          {auth?.role === 'admin' ? (
                            <>
                              <input
                                className="slot-name-input"
                                value={slot.name}
                                placeholder="Slot name"
                                onChange={(e) => updateOpSlotDebounced(op.id, slot.id, { name: e.target.value })}
                                onBlur={() => flushOpSlotUpdate(op.id, slot.id)}
                              />
                              <textarea
                                className="slot-notes-input"
                                value={slot.notes}
                                placeholder="Place extra notes here"
                                onChange={(e) => updateOpSlotDebounced(op.id, slot.id, { notes: e.target.value })}
                                onBlur={() => flushOpSlotUpdate(op.id, slot.id)}
                              />
                              <div className="slot-meta-row">
                                <select
                                  value={slot.role}
                                  onChange={(e) => updateOpSlotDebounced(op.id, slot.id, { role: e.target.value })}
                                  onBlur={() => flushOpSlotUpdate(op.id, slot.id)}
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
                            </>
                          ) : (
                            <>
                              <strong>{slot.name}</strong>
                              <p className="slot-meta">{slot.role}</p>
                              {slot.notes ? <p className="slot-meta">{slot.notes}</p> : null}
                            </>
                          )}
                        </div>
                        {assignedUser && avatarUrl ? (
                          <div style={{ marginLeft: 12 }}>
                            <img src={avatarUrl} alt="avatar" className="slot-avatar" />
                          </div>
                        ) : null}
                        <div className="slot-footer">
                          <span>{assignedUser ? `Occupied by ${assignedUser.username}` : 'Available'}</span>
                          {isOwnSlot ? (
                            <button className="secondary small" onClick={() => signOffOpSlot(op.id, slot.id)}>
                              Sign off
                            </button>
                          ) : auth && canJoin ? (
                            <button className="secondary small" onClick={() => joinOpSlot(op.id, slot.id)}>
                              Join
                            </button>
                          ) : !auth && !assignedUser ? (
                            <button className="secondary small" onClick={() => setShowLoginPanel(true)}>
                              Login to join
                            </button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
