import React, { useMemo, useState } from 'react';

export default function Roles({ allRoles = [], templates = [], customRoles = [], addRole, deleteRole, renameRole, goBack }) {
  const [newRoleName, setNewRoleName] = useState('');
  const [renamingRole, setRenamingRole] = useState(null);
  const [renameValue, setRenameValue] = useState('');

  const normalizeRoleKey = (role) => role?.trim().toLowerCase();

  const permissionColumns = useMemo(() => {
    return allRoles.filter((role) => !['member', 'admin'].includes(normalizeRoleKey(role)));
  }, [allRoles]);

  const onAddRole = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!addRole) return;
    await addRole(e);
    setNewRoleName('');
  };

  const onDeleteRole = async (role) => {
    if (!deleteRole) return;
    await deleteRole(role);
  };

  const onRenameRole = async (oldName, newName) => {
    if (!renameRole) return;
    await renameRole(oldName, newName);
    setRenamingRole(null);
  };

  return (
    <section>
      <div className="playerlist-toolbar">
        <button onClick={goBack} className="secondary small">Back to dashboard</button>
        <div>
          <h3>All roles</h3>
          <p>View all roles currently available in the system.</p>
        </div>
      </div>

      <section className="card role-add-squad">
        <h4>Add new role</h4>
        <form className="role-add-form" onSubmit={onAddRole}>
          <input
            placeholder="New role name"
            value={newRoleName}
            onChange={(e) => setNewRoleName(e.target.value)}
          />
          <button type="submit">Add</button>
        </form>
      </section>

      {allRoles.length === 0 ? (
        <p>No roles defined yet. Add slots to templates to make roles available.</p>
      ) : (
        <div className="role-grid">
          {allRoles.map((role) => {
            const assignedCount = templates.reduce((count, template) => {
              return count + (template.squads?.reduce((squadCount, squad) => {
                return squadCount + (squad.slots?.filter((slot) => slot.role === role && slot.assignedUserId).length || 0);
              }, 0) || 0);
            }, 0);
            const slotCount = templates.reduce((count, template) => {
              return count + (template.squads?.reduce((squadCount, squad) => {
                return squadCount + (squad.slots?.filter((slot) => slot.role === role).length || 0);
              }, 0) || 0);
            }, 0);
            const allowedCount = templates.reduce((count, template) => {
              return count + (template.squads?.reduce((squadCount, squad) => {
                return squadCount + (squad.slots?.filter((slot) => slot.allowedRoles?.includes(role)).length || 0);
              }, 0) || 0);
            }, 0);
            const isRemovable = customRoles.some((item) => normalizeRoleKey(item.name) === normalizeRoleKey(role));

            return (
              <div key={role} className="role-card">
                <div className="role-card-header">
                  {renamingRole === role ? (
                    <form
                      className="role-rename-form"
                      onSubmit={(e) => { e.preventDefault(); onRenameRole(role, renameValue); }}
                    >
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        className="role-rename-input"
                      />
                      <button type="submit" className="small">Save</button>
                      <button type="button" className="secondary small" onClick={() => setRenamingRole(null)}>Cancel</button>
                    </form>
                  ) : (
                    <h4>{role}</h4>
                  )}
                  <div style={{display:'flex',gap:'0.4rem'}}>
                    {renamingRole !== role ? (
                      <button
                        type="button"
                        className="secondary small"
                        onClick={() => { setRenamingRole(role); setRenameValue(role); }}
                      >
                        Rename
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="secondary small"
                      disabled={!isRemovable}
                      onClick={() => onDeleteRole(role)}
                    >
                      {isRemovable ? 'Delete' : 'System'}
                    </button>
                  </div>
                </div>
                <p>Occupied: {assignedCount}</p>
                <p>Slots: {slotCount}</p>
                <p>Allowed in: {allowedCount}</p>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
