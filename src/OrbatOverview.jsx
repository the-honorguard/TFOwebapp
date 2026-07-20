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
  resolveSquadParentId,
  getTemplateFlowEdges,
  nodeHeights,
  setNodeHeightRef,
  moveCanvasDrag,
  stopCanvasDrag,
  startCanvasDrag,
  updateSquadParent,
  squadStats,
  joinOpSlot,
  signOffOpSlot,
  updateOpSlot,
  updateOpSlotDebounced,
  flushOpSlotUpdate,
  setShowLoginPanel,
  showOpInScheduler,
  campaignImage
}) {
  const currentUser = auth
    ? users.find((user) => String(user.id) === String(auth.id))
    : null;
  const activeSquads = (op.squads || []).filter((squad) => squad.active !== false);
  const canUserJoinSlot = (slot) => {
    if (!auth) return false;
    if (auth.role === 'admin') return true;
    const permissions = currentUser?.permissions || {};
    const requiredRoles = [...new Set([
      slot.role,
      ...(Array.isArray(slot.allowedRoles) ? slot.allowedRoles : [])
    ].filter(Boolean))];
    return requiredRoles.some((role) => permissions[role] === true);
  };

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
      {activeSquads.length === 0 ? (
        <div className="empty-state">This operation has no active squads.</div>
      ) : effectiveOverviewMode === 'orbat' ? (
        (() => {
          const canvasTemplate = { id: op.id, squads: activeSquads };
          const canvasSize = getCanvasSize(canvasTemplate);
          const hierarchyEdges = getTemplateFlowEdges(op.id, activeSquads);
          const nodes = activeSquads.map((squad, index) => {
            const node = getCanvasNode(op.id, squad.id, index);
            const incomingEdge = hierarchyEdges.find((edge) => edge.targetId === squad.id);
            return {
              squad,
              index,
              nodeKey: `overview-${op.id}-${squad.id}`,
              x: node.x,
              y: node.y,
              parentId: incomingEdge?.sourceId || null
            };
          });

          const nodeMap = new Map(nodes.map((node) => [node.squad.id, node]));
          const links = hierarchyEdges
            .filter((edge) => nodeMap.has(edge.sourceId) && nodeMap.has(edge.targetId))
            .map((edge) => {
              const parent = nodeMap.get(edge.sourceId);
              const child = nodeMap.get(edge.targetId);
              return {
                id: edge.id,
                x1: parent.x + 140,
                y1: parent.y + (nodeHeights[parent.nodeKey] || 172),
                x2: child.x + 140,
                y2: child.y
              };
            });

          return (
            <div className="orbat-wrapper">
              <div
                className="orbat-canvas"
                style={{ width: `${canvasSize.width}px`, height: `${canvasSize.height}px` }}
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
                    key={node.squad.id}
                    className="orbat-node"
                    style={{ left: `${node.x}px`, top: `${node.y}px` }}
                    ref={setNodeHeightRef(node.nodeKey)}
                  >
                    <span className="orbat-connector top" aria-hidden="true" />
                    <span className="orbat-connector bottom" aria-hidden="true" />
                    <div
                      className="orbat-node-head"
                    >
                      <strong>{node.squad.title}</strong>
                      <span className="squad-count">
                        {squadStats(node.squad).occupied}/{squadStats(node.squad).total} filled
                      </span>
                      <span className="slot-meta">LR {node.squad.lrChannel ?? '-'} · SR {node.squad.srChannel ?? '-'}</span>
                      {node.squad.markerIconUrl ? (
                        <img src={node.squad.markerIconUrl} alt="marker" className="marker-icon" />
                      ) : node.squad.marker ? (
                        <span className={`marker-badge marker-${String(node.squad.marker).toLowerCase().replace(/\s+/g,'-')}`}>{node.squad.marker}</span>
                      ) : null}
                    </div>

                    {isAdmin ? (
                      <select
                        className="orbat-parent-select"
                        value={node.parentId || ''}
                        onChange={(event) => updateSquadParent(op.id, node.squad.id, event.target.value || null)}
                      >
                        <option value="">Top command</option>
                        {activeSquads
                          .filter((squad) => squad.id !== node.squad.id)
                          .map((squad) => (
                            <option key={squad.id} value={squad.id}>
                              Reports to {squad.title}
                            </option>
                          ))}
                      </select>
                    ) : null}

                    <div className="orbat-slot-list">
                      {node.squad.slots.slice(0, 6).map((slot) => {
                        const assignedUser = users.find((user) => user.id === slot.assignedUserId);
                        const avatarUrl = assignedUser?.profile?.avatarUrl || assignedUser?.avatarUrl || null;
                        const canJoin = !assignedUser && canUserJoinSlot(slot);
                        const isOwnSlot = Boolean(auth && slot.assignedUserId != null && String(slot.assignedUserId) === String(auth.id));
                        const crop = assignedUser?.profile?.avatarCrop || null;
                        const bgPosition = crop ? `${crop.x}% ${crop.y}%` : 'center';
                        const bgSize = crop && crop.zoom ? `${crop.zoom * 100}%` : 'cover';
                        const badgeStyle = assignedUser && avatarUrl ? { backgroundImage: `url(${avatarUrl})`, backgroundSize: bgSize, backgroundPosition: bgPosition, backgroundRepeat: 'no-repeat' } : undefined;
                        return (
                          <div key={slot.id} className="orbat-slot-item">
                              <span className={`slot-badge ${assignedUser ? 'occupied avatar' : 'free'}`}>
                                <span className="badge-default" style={badgeStyle}>
                                  {assignedUser && avatarUrl ? (
                                    <img src={avatarUrl} alt={`${assignedUser.username} avatar`} className="slot-badge-avatar" />
                                  ) : (assignedUser ? 'Occupied' : 'Free')}
                                </span>
                                {isOwnSlot ? (
                                  <button type="button" className="badge-action signoff" onClick={() => signOffOpSlot(op.id, slot.id)} title="Sign off">Sign off</button>
                                ) : auth && canJoin ? (
                                  <button type="button" className="badge-action join" onClick={() => joinOpSlot(op.id, slot.id)}>Join</button>
                                ) : !auth && !assignedUser ? (
                                  <button type="button" className="badge-action join" onClick={() => setShowLoginPanel(true)}>Login</button>
                                ) : null}
                              </span>
                              <span className="orbat-slot-text">{slot.name}</span>
                              {assignedUser ? (
                                <span className="orbat-slot-username">{assignedUser.username}</span>
                              ) : null}
                          </div>
                        );
                      })}
                      {node.squad.slots.length > 6 ? (
                        <div className="orbat-slot-more">+{node.squad.slots.length - 6} more slots</div>
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
          {activeSquads.map((squad, index) => (
            <div key={squad.id} className={`builder-panel panel-${index % 5}`}>
                <div className="panel-title">
                <strong>{squad.title}</strong>
                <span className="slot-meta">LR {squad.lrChannel ?? '-'} · SR {squad.srChannel ?? '-'}</span>
                {squad.markerIconUrl ? <img src={squad.markerIconUrl} alt="marker" className="marker-icon" /> : squad.marker ? <span className={`marker-badge marker-${String(squad.marker).toLowerCase().replace(/\s+/g,'-')}`}>{squad.marker}</span> : null}
              </div>
              <div className="panel-content">
                {squad.slots.length === 0 ? (
                  <p className="panel-empty">No slots in this squad.</p>
                ) : (
                      squad.slots.map((slot) => {
                    const assignedUser = users.find((user) => user.id === slot.assignedUserId);
                    const avatarUrl = assignedUser?.profile?.avatarUrl || assignedUser?.avatarUrl || null;
                    const canJoin = !assignedUser && canUserJoinSlot(slot);
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
                          <div style={{ marginLeft: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <img src={avatarUrl} alt={`${assignedUser.username} avatar`} className="slot-avatar" />
                            <span className="slot-username">{assignedUser.username}</span>
                          </div>
                        ) : null}
                        <div className="slot-footer">
                          <span>{assignedUser ? `Occupied by ${assignedUser.username}` : 'Available'}</span>
                          {isOwnSlot ? (
                            <button type="button" className="secondary small" onClick={() => signOffOpSlot(op.id, slot.id)}>
                              Sign off
                            </button>
                          ) : auth && canJoin ? (
                            <button type="button" className="secondary small" onClick={() => joinOpSlot(op.id, slot.id)}>
                              Join
                            </button>
                          ) : !auth && !assignedUser ? (
                            <button type="button" className="secondary small" onClick={() => setShowLoginPanel(true)}>
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
