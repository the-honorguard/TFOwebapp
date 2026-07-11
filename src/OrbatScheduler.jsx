// Editable ORBAT view for a single scheduled operation (admin scheduler detail page).
// Extracted 1:1 from App.jsx's scheduler-detail render block.
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
  users,
  updateOpSlot,
  allRoles,
  weekDayLabels,
  toggleRecurrenceWeeklyDay,
  updateRecurrence,
  recurrenceLabel,
  isAdmin,
  getCanvasSize,
  getCanvasNode,
  resolveSectionParentId,
  nodeHeights,
  setNodeHeightRef,
  moveCanvasDrag,
  stopCanvasDrag,
  startCanvasDrag,
  updateSectionParent,
  sectionStats
}) {
  const selectedRecurrence = selectedRecurrenceId ? recurrences.find((r) => r.id === selectedRecurrenceId) : null;

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

      {selectedOp.sections?.length > 0 ? (
        (() => {
          const canvasTemplate = { id: selectedOp.templateId, sections: selectedOp.sections };
          const canvasSize = getCanvasSize(canvasTemplate);
          const nodes = selectedOp.sections.map((section, index) => {
            const node = getCanvasNode(selectedOp.templateId, section.id, index);
            return {
              section,
              index,
              nodeKey: `scheduler-${selectedOp.id}-${section.id}`,
              x: node.x,
              y: node.y,
              parentId: resolveSectionParentId(selectedOp.templateId, selectedOp.sections, section.id, index)
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
                      onMouseDown={(event) => startCanvasDrag(event, selectedOp.templateId, node.section.id, node.index)}
                    >
                      <strong>{node.section.title}</strong>
                      <span className="section-count">
                        {sectionStats(node.section).occupied}/{sectionStats(node.section).total} filled
                      </span>
                      <span className="slot-meta">LR {node.section.lrChannel ?? '-'} · SR {node.section.srChannel ?? '-'}</span>
                    </div>

                    <select
                      className="orbat-parent-select"
                      value={node.parentId || ''}
                      onChange={(event) => updateSectionParent(selectedOp.templateId, node.section.id, event.target.value || null)}
                    >
                      <option value="">Top command</option>
                      {selectedOp.sections
                        .filter((section) => section.id !== node.section.id)
                        .map((section) => (
                          <option key={section.id} value={section.id}>
                            Reports to {section.title}
                          </option>
                        ))}
                    </select>

                    <div className="orbat-slot-list">
                      {node.section.slots.slice(0, 6).map((slot) => {
                        const assignedUser = users.find((user) => user.id === slot.assignedUserId);
                        return (
                          <div key={slot.id} className="orbat-slot-item">
                            <span className={`slot-badge ${assignedUser ? 'occupied' : 'free'}`}>
                              {assignedUser ? 'occupied' : 'free'}
                            </span>
                            <span className="orbat-slot-text">
                              {slot.name}{assignedUser ? ` · ${assignedUser.username}` : ''}
                            </span>
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
      ) : null}

      {selectedOp.sections?.length === 0 ? (
        <div className="empty-state">This operation has no sections. Load a template to add slots.</div>
      ) : (
        <div className="builder-grid">
          {selectedOp.sections.map((section, index) => (
            <div key={section.id} className={`builder-panel panel-${index % 5}`}>
              <div className="panel-title">
                <strong>{section.title}</strong>
                <div className="slot-meta-row">
                  <label className="slot-meta">
                    LR
                    <input
                      type="number"
                      min="0"
                      max="99"
                      className="lr-sr-input"
                      value={section.lrChannel ?? 1}
                      onChange={(e) => updateOpSectionMeta(selectedOp.id, section.id, { lrChannel: Number(e.target.value) })}
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
                      onChange={(e) => updateOpSectionMeta(selectedOp.id, section.id, { srChannel: Number(e.target.value) })}
                    />
                  </label>
                </div>
              </div>
              <div className="panel-content">
                {section.slots.length === 0 ? (
                  <p className="panel-empty">No slots in this section.</p>
                ) : (
                  section.slots.map((slot) => {
                    const assignedUser = users.find((user) => user.id === slot.assignedUserId);

                    return (
                      <div key={slot.id} className="slot-card builder-slot">
                        <div>
                          <input
                            className="slot-name-input"
                            value={slot.name}
                            placeholder="Slot name"
                            onChange={(e) => updateOpSlot(selectedOp.id, slot.id, { name: e.target.value })}
                          />
                          <textarea
                            className="slot-notes-input"
                            value={slot.notes}
                            placeholder="Place extra notes here"
                            onChange={(e) => updateOpSlot(selectedOp.id, slot.id, { notes: e.target.value })}
                          />
                          <div className="slot-meta-row">
                            <select
                              value={slot.role}
                              onChange={(e) => updateOpSlot(selectedOp.id, slot.id, { role: e.target.value })}
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
                          <span>{assignedUser ? `Occupied by ${assignedUser.username}` : 'Available'}</span>
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
