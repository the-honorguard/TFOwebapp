import { useState } from 'react';
import { getOrbatNodeHeight, ORBAT_NODE_WIDTH } from './orbatLayout';

const ARMA_3_STEAM_LAUNCH_URL = 'steam://run/107410';

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
  campaign,
  toggleOpAbsence
}) {
  const [joinedSlotFeedback, setJoinedSlotFeedback] = useState(() => new Set());
  const currentUser = auth
    ? users.find((user) => String(user.id) === String(auth.id))
    : null;
  const activeSquads = (op.squads || []).filter((squad) => squad.active !== false);
  const absentPlayers = (op.absentUserIds || [])
    .map((userId) => users.find((user) => String(user.id) === String(userId)))
    .filter(Boolean)
    .sort((a, b) => String(a.username).localeCompare(String(b.username)));
  const modlistUrl = op.modlistPlayer || op.modlist || campaign?.modlistPlayer || '';
  const ts3Url = op.tsAddress ? `ts3server://${op.tsAddress}` : '';
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
    <section className="card operation-overview-card">
      <div className="operation-details">
        {campaign?.image ? (
          <div className="operation-campaign-image">
            <img src={campaign.image} alt={campaign.name || 'Campaign'} />
          </div>
        ) : null}
        <div className="operation-details-copy">
          <h4>{op.name}</h4>
          <dl className="operation-meta">
            <div><dt>Server</dt><dd>{op.serverName || '-'}</dd></div>
            <div><dt>Date</dt><dd>{op.date || '-'}{op.time ? ` at ${op.time}` : ''}</dd></div>
            <div><dt>Template</dt><dd>{getTemplateName(op.templateId)}</dd></div>
            {campaign?.name ? <div><dt>Campaign</dt><dd>{campaign.name}</dd></div> : null}
            <div><dt>TS3</dt><dd>{op.tsAddress || '-'}</dd></div>
          </dl>
        </div>
        <div className="operation-actions">
          <a
            className="button-link secondary small"
            href={ARMA_3_STEAM_LAUNCH_URL}
            target="_blank"
            rel="noreferrer"
          >
            Start Arma 3 Launcher
          </a>
          {modlistUrl ? (
            <a className="button-link secondary small" href={modlistUrl} download>
              Download modlist
            </a>
          ) : null}
          {ts3Url ? (
            <a className="button-link secondary small" href={ts3Url} target="_blank" rel="noreferrer">Connect to TS3</a>
          ) : null}
          {(isAdmin || isMissionmaker) ? (
            <button className="secondary small" onClick={() => showOpInScheduler(op.id)}>
              Open in Operation Scheduler
            </button>
          ) : null}
          {auth ? (
            <button
              type="button"
              className={(op.absentUserIds || []).some((id) => String(id) === String(auth.id)) ? 'small btn-danger' : 'small secondary'}
              onClick={() => toggleOpAbsence(op.id)}
            >
              {(op.absentUserIds || []).some((id) => String(id) === String(auth.id)) ? 'Withdraw absence' : 'Report absent'}
            </button>
          ) : null}
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
      {activeSquads.length === 0 ? (
        <div className="empty-state">This operation has no active squads.</div>
      ) : effectiveOverviewMode === 'orbat' ? (
        (() => {
          const canvasTemplate = { id: op.id, squads: activeSquads };
          const canvasSize = getCanvasSize(canvasTemplate);
          const hierarchyEdges = getTemplateFlowEdges(op.id, activeSquads);
          const nodes = activeSquads.map((squad, index) => {
            const node = getCanvasNode(op.id, squad.id, index);
            const incomingEdge = hierarchyEdges.find((edge) => (
              edge.targetId === squad.id
              && !['left', 'right'].includes(edge.sourceAnchor)
              && !['left', 'right'].includes(edge.targetAnchor)
            ));
            const supportTargetIds = hierarchyEdges
              .filter((edge) => (
                edge.sourceId === squad.id
                && (['left', 'right'].includes(edge.sourceAnchor) || ['left', 'right'].includes(edge.targetAnchor))
              ))
              .map((edge) => edge.targetId);
            return {
              squad,
              index,
              nodeKey: `overview-${op.id}-${squad.id}`,
              x: node.x,
              y: node.y,
              parentId: incomingEdge?.sourceId || null,
              supportTargetIds
            };
          });

          const nodeMap = new Map(nodes.map((node) => [node.squad.id, node]));
          const links = hierarchyEdges
            .filter((edge) => nodeMap.has(edge.sourceId) && nodeMap.has(edge.targetId))
            .map((edge) => {
              const parent = nodeMap.get(edge.sourceId);
              const child = nodeMap.get(edge.targetId);
              const anchorPoint = (node, anchor) => {
                const height = getOrbatNodeHeight(node.squad);
                if (anchor === 'left') return { x: node.x, y: node.y + (height / 2) };
                if (anchor === 'right') return { x: node.x + ORBAT_NODE_WIDTH, y: node.y + (height / 2) };
                if (anchor === 'top') return { x: node.x + (ORBAT_NODE_WIDTH / 2), y: node.y };
                return { x: node.x + (ORBAT_NODE_WIDTH / 2), y: node.y + height };
              };
              const sourcePoint = anchorPoint(parent, edge.sourceAnchor || 'bottom');
              const targetPoint = anchorPoint(child, edge.targetAnchor || 'top');
              return {
                id: edge.id,
                x1: sourcePoint.x,
                y1: sourcePoint.y,
                x2: targetPoint.x,
                y2: targetPoint.y
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

                {nodes.map((node) => (
                  <div
                    key={node.squad.id}
                    className="orbat-node"
                    style={{ left: `${node.x}px`, top: `${node.y}px`, width: `${ORBAT_NODE_WIDTH}px`, height: `${getOrbatNodeHeight(node.squad)}px` }}
                    ref={setNodeHeightRef(node.nodeKey)}
                  >
                    <span className="orbat-connector top" aria-hidden="true" />
                    <span className="orbat-connector bottom" aria-hidden="true" />
                    <span className="orbat-connector support left" title="Gives support" aria-label="Gives support" />
                    <span className="orbat-connector support right" title="Receives support" aria-label="Receives support" />
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

                    <div className="orbat-reports-to">
                      {node.parentId
                        ? <>Reports to: <strong>{nodeMap.get(node.parentId)?.squad.title || 'Unknown squad'}</strong></>
                        : node.supportTargetIds.length
                          ? <>Supports: <strong>{node.supportTargetIds.map((squadId) => nodeMap.get(squadId)?.squad.title || 'Unknown squad').join(', ')}</strong></>
                        : <strong>Top command</strong>}
                    </div>

                    <div className="orbat-slot-list">
                      {node.squad.slots.map((slot) => {
                        const feedbackKey = `${op.id}:${slot.id}`;
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
                              <span
                                className={`slot-badge ${assignedUser ? `occupied${avatarUrl ? ' has-avatar' : ''}` : 'free'} ${joinedSlotFeedback.has(feedbackKey) ? 'show-status' : ''}`}
                                onMouseLeave={() => setJoinedSlotFeedback((current) => {
                                  if (!current.has(feedbackKey)) return current;
                                  const next = new Set(current);
                                  next.delete(feedbackKey);
                                  return next;
                                })}
                              >
                                <span className="badge-default" style={badgeStyle}>
                                  {assignedUser && avatarUrl ? (
                                    <img src={avatarUrl} alt={`${assignedUser.username} avatar`} className="slot-badge-avatar" />
                                  ) : (assignedUser ? 'Taken' : 'Free')}
                                </span>
                                {isOwnSlot ? (
                                  <button type="button" className="badge-action signoff" onClick={(event) => { event.currentTarget.blur(); signOffOpSlot(op.id, slot.id); }} title="Sign off">Sign off</button>
                                ) : auth && canJoin ? (
                                  <button type="button" className="badge-action join" onClick={(event) => {
                                    event.currentTarget.blur();
                                    setJoinedSlotFeedback((current) => new Set(current).add(feedbackKey));
                                    joinOpSlot(op.id, slot.id);
                                  }}>Join</button>
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
                <div className="panel-title-text">
                  <strong>{squad.title}</strong>
                  <span className="squad-count">
                    {squadStats(squad).occupied}/{squadStats(squad).total} filled
                  </span>
                </div>
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
