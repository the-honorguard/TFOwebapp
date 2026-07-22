import { useEffect, useMemo, useState } from 'react';

export default function Permissions({ groups = [], definitions = [], onGroupsChanged }) {
  const [drafts, setDrafts] = useState({});
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [expandedGroups, setExpandedGroups] = useState({});

  useEffect(() => {
    setDrafts(Object.fromEntries(groups.map((group) => [group.slug, {
      name: group.name,
      permissions: { ...(group.permissions || {}) }
    }])));
  }, [groups]);

  const categories = useMemo(() => definitions.reduce((result, definition) => {
    (result[definition.category] ||= []).push(definition);
    return result;
  }, {}), [definitions]);

  const request = async (path, options = {}) => {
    const token = localStorage.getItem('token');
    const response = await fetch(path, {
      ...options,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options.headers || {}) }
    });
    const body = response.status === 204 ? {} : await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || response.statusText);
    return body;
  };

  const reload = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const data = await request('/api/permission-groups');
      onGroupsChanged?.(data.groups || [], data.definitions || []);
    } catch (error) {
      setLoadError(error.message || 'Could not load permission groups');
      throw error;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload().catch(() => {});
  // Fetch independently when the tab opens, including for sessions that were
  // established before permission groups became part of /api/data.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createGroup = async (event) => {
    event.preventDefault();
    if (!newName.trim()) return;
    try {
      await request('/api/permission-groups', { method: 'POST', body: JSON.stringify({ name: newName.trim(), permissions: {} }) });
      setNewName('');
      await reload();
    } catch (error) { alert(error.message); }
  };

  const saveGroup = async (slug) => {
    try {
      await request(`/api/permission-groups/${slug}`, { method: 'PUT', body: JSON.stringify(drafts[slug]) });
      await reload();
    } catch (error) { alert(error.message); }
  };

  const deleteGroup = async (group) => {
    if (!window.confirm(`Delete permission group ${group.name}?`)) return;
    try {
      await request(`/api/permission-groups/${group.slug}`, { method: 'DELETE' });
      await reload();
    } catch (error) { alert(error.message); }
  };

  return (
    <section className="card">
      <div className="playerlist-toolbar">
        <div>
          <h3>Permission groups</h3>
          <p>Control which parts of the application each account group may view or modify.</p>
        </div>
      </div>

      <form className="role-add-form" onSubmit={createGroup}>
        <input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="New group name" />
        <button type="submit">Create group</button>
      </form>

      {loading ? <p>Loading permission groups...</p> : null}
      {loadError ? (
        <div className="field-error">
          {loadError} <button type="button" className="secondary small" onClick={() => reload().catch(() => {})}>Retry</button>
        </div>
      ) : null}
      {!loading && !loadError && groups.length === 0 ? <p>No permission groups found.</p> : null}

      <div className="permission-group-list">
        {groups.map((group) => {
          const draft = drafts[group.slug] || { name: group.name, permissions: {} };
          const expanded = expandedGroups[group.slug] === true;
          const contentId = `permission-group-content-${group.slug}`;
          return (
            <section className="card permission-group-card" key={group.slug}>
              <div className={`permission-group-header${expanded ? '' : ' collapsed'}`}>
                <div className="permission-group-identity">
                  <label htmlFor={`permission-group-${group.slug}`}>Group name</label>
                  <div className="permission-group-name-row">
                    <input
                      id={`permission-group-${group.slug}`}
                      value={draft.name}
                      onChange={(event) => setDrafts((current) => ({ ...current, [group.slug]: { ...draft, name: event.target.value } }))}
                    />
                    <code>{group.slug}</code>
                  </div>
                </div>
                <div className="permission-group-actions">
                  <button
                    type="button"
                    className="secondary permission-group-toggle"
                    aria-expanded={expanded}
                    aria-controls={contentId}
                    onClick={() => setExpandedGroups((current) => ({
                      ...current,
                      [group.slug]: !expanded
                    }))}
                  >
                    <span aria-hidden="true">{expanded ? '▾' : '▸'}</span>
                    {expanded ? 'Hide permissions' : 'Show permissions'}
                  </button>
                  <button type="button" onClick={() => saveGroup(group.slug)}>Save changes</button>
                  {!group.system ? <button type="button" className="secondary" onClick={() => deleteGroup(group)}>Delete</button> : null}
                </div>
              </div>

              {expanded ? (
                <div className="permission-category-grid" id={contentId}>
                  {Object.entries(categories).map(([category, items]) => (
                    <fieldset className="permission-category" key={category}>
                      <legend>{category}</legend>
                      <div className="permission-category-options">
                        {items.map((definition) => {
                          const locked = group.slug === 'admin';
                          return (
                            <label className="permission-option" key={definition.key}>
                              <input
                                type="checkbox"
                                checked={locked || draft.permissions[definition.key] === true}
                                disabled={locked}
                                onChange={(event) => setDrafts((current) => ({
                                  ...current,
                                  [group.slug]: {
                                    ...draft,
                                    permissions: { ...draft.permissions, [definition.key]: event.target.checked }
                                  }
                                }))}
                              />
                              <span>{definition.label}</span>
                              {locked ? <small>Locked</small> : null}
                            </label>
                          );
                        })}
                      </div>
                    </fieldset>
                  ))}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </section>
  );
}
