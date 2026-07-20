import { useEffect, useState } from 'react';
import Ranks from './Ranks';
import Roles from './settings/Roles';
import Permissions from './settings/Permissions';
import TerminalModal from './TerminalModal';

const SECTION_LABELS = {
  users: 'Users',
  templates: 'Templates',
  ops: 'Operations',
  recurrences: 'Recurrences',
  ranks: 'Ranks',
  roles: 'Custom Roles',
  campaigns: 'Campaigns',
  slots: 'Template slots'
  ,training: 'Training and Drill Sergeants'
};

const getSectionLabel = (key) => SECTION_LABELS[key] || key;
const getSectionSummary = (value) => {
  if (Array.isArray(value)) return `${value.length} items`;
  if (value && typeof value === 'object') return Object.keys(value).length > 0 ? `${Object.keys(value).length} fields` : '1 item';
  return 'available';
};

export default function Settings({
  defaultOpSettings,
  setDefaultOpSettings,
  templates,
  changePassword,
  uploadCustomMarker,
  allRoles,
  exportBackup,
  importBackup,
  isAdmin = false,
  clearDb = null,
  // roles-related props
  customRoles = [],
  addRole = null,
  deleteRole = null,
  renameRole = null,
  goToDashboard = () => {},
  initialSubpage = null,
  // ranks-related props
  ranks = [],
  reloadRanks = null,
  setRanks = null,
  uploadFile = null,
  users = [],
  setUsers = null,
  can = () => false,
  permissionGroups = [],
  permissionDefinitions = [],
  onPermissionGroupsChanged = null
}) {
  const [subpage, setSubpage] = useState(() => initialSubpage || 'general');
  const [basicTrainingRole, setBasicTrainingRole] = useState('Rifleman');

  useEffect(() => {
    if (initialSubpage) setSubpage(initialSubpage);
  }, [initialSubpage]);

  useEffect(() => {
    if (!can('manage_training_admin')) return;
    const token = localStorage.getItem('token');
    fetch('/api/training/admin', { headers: { Authorization: `Bearer ${token}` } })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => { if (data?.settings?.basicRole) setBasicTrainingRole(data.settings.basicRole); })
      .catch(() => {});
  }, [can]);

  const saveBasicTrainingRole = async () => {
    const token = localStorage.getItem('token');
    const response = await fetch('/api/training/admin/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ basicRole: basicTrainingRole })
    });
    const data = await response.json();
    if (!response.ok) { alert(data.error || 'Could not save basic training role'); return; }
    alert('Basic training role saved');
  };
  const [local, setLocal] = useState({
    templateId: defaultOpSettings.templateId || '',
    time: defaultOpSettings.time || '',
    serverName: defaultOpSettings.serverName || '',
    modlist: defaultOpSettings.modlist || '',
    tsAddress: defaultOpSettings.tsAddress || '',
    recurrence: defaultOpSettings.recurrence || 'none',
    minSignupAge: defaultOpSettings.minSignupAge ?? 17,
    squadTypes: defaultOpSettings.squadTypes || [],
    defaultSlotRole: defaultOpSettings.defaultSlotRole || ''
  });
  

  useEffect(() => {
    setLocal({
      templateId: defaultOpSettings.templateId || '',
      time: defaultOpSettings.time || '',
      serverName: defaultOpSettings.serverName || '',
      modlist: defaultOpSettings.modlist || '',
      tsAddress: defaultOpSettings.tsAddress || '',
      recurrence: defaultOpSettings.recurrence || 'none',
      minSignupAge: defaultOpSettings.minSignupAge ?? 17,
      squadTypes: defaultOpSettings.squadTypes || [],
      defaultSlotRole: defaultOpSettings.defaultSlotRole || ''
    });
  }, [defaultOpSettings]);

  // Load squad types from server (DB-backed list)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch('/api/squad-types');
        if (!res.ok) return;
        const j = await res.json();
        if (!mounted) return;
        setLocal((s) => ({ ...s, squadTypes: Array.isArray(j.squadTypes) ? j.squadTypes : [] }));
      } catch (err) {
        // ignore
      }
    })();
    return () => { mounted = false; };
  }, []);

  const save = (e) => {
    e.preventDefault();
    setDefaultOpSettings({
      templateId: local.templateId || null,
      time: local.time || '',
      serverName: local.serverName || '',
      modlist: local.modlist || '',
      tsAddress: local.tsAddress || '',
      recurrence: local.recurrence || 'none',
      minSignupAge: Number(local.minSignupAge) || 17,
      squadTypes: Array.isArray(local.squadTypes) ? local.squadTypes : [],
      defaultSlotRole: local.defaultSlotRole || ''
    });
    alert('Default settings saved');
  };

  const AVAILABLE_MARKERS = [
    'armor.svg',
    'artillery.svg',
    'engineer.svg',
    'hq.svg',
    'infantry.svg',
    'logistics.svg',
    'medic.svg',
    'recon.svg'
  ];
  

  

  // Confirmation modal + streaming terminal state
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmInput, setConfirmInput] = useState('');
  const [termOpen, setTermOpen] = useState(false);
  const [termContent, setTermContent] = useState('');
  const [termFinished, setTermFinished] = useState(false);

  const appendTerm = (text) => setTermContent((t) => t + String(text));

  const startClearDbStream = async () => {
    const token = localStorage.getItem('token');
    if (!token) { alert('Login required'); return; }
    setTermContent('');
    setTermFinished(false);
    setTermOpen(true);
    try {
      const res = await fetch('/api/admin/clear-db-stream', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        const txt = await res.text();
        appendTerm('\nServer error: ' + (txt || `HTTP ${res.status}`));
        setTermFinished(true);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        appendTerm(decoder.decode(value));
      }
      appendTerm('\n-- stream closed --\n');
    } catch (e) {
      appendTerm('\nNetwork error: ' + (e.message || e));
    } finally {
      setTermFinished(true);
    }
  };

  return (
    <div>
      <div className="settings-subnav" style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <button className={subpage === 'general' ? 'tab active' : 'tab'} onClick={() => setSubpage('general')}>General</button>
        {can('edit_ranks') ? <button className={subpage === 'ranks' ? 'tab active' : 'tab'} onClick={() => setSubpage('ranks')}>Ranks</button> : null}
        {can('edit_squad_types') ? <button className={subpage === 'squadtypes' ? 'tab active' : 'tab'} onClick={() => setSubpage('squadtypes')}>Squad types</button> : null}
        {can('edit_roles') ? <button className={subpage === 'roles' ? 'tab active' : 'tab'} onClick={() => setSubpage('roles')}>Roles</button> : null}
        {can('manage_permissions') ? <button className={subpage === 'permissions' ? 'tab active' : 'tab'} onClick={() => setSubpage('permissions')}>Permissions</button> : null}
      </div>

      {subpage === 'general' && (
        <section className="card">
          <h3>Default values for new operations</h3>

          <form onSubmit={save}>
            <fieldset disabled={!can('edit_settings')} style={{ border: 0, padding: 0, margin: 0 }}>
        <div className="form-row">
          <label>Template</label>
          <select
            value={local.templateId || ''}
            onChange={(e) => setLocal((s) => ({ ...s, templateId: e.target.value }))}
          >
            <option value="">-- None --</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>

        <div className="form-row">
          <label>Time</label>
          <input value={local.time} onChange={(e) => setLocal((s) => ({ ...s, time: e.target.value }))} />
        </div>

        <div className="form-row">
          <label>Server name</label>
          <input value={local.serverName} onChange={(e) => setLocal((s) => ({ ...s, serverName: e.target.value }))} />
        </div>

        <div className="form-row">
          <label>Modlist</label>
          <input value={local.modlist} onChange={(e) => setLocal((s) => ({ ...s, modlist: e.target.value }))} />
        </div>

        <div className="form-row">
          <label>TS address</label>
          <input value={local.tsAddress} onChange={(e) => setLocal((s) => ({ ...s, tsAddress: e.target.value }))} />
        </div>

        <div className="form-row">
          <label>Recurrence</label>
          <select value={local.recurrence} onChange={(e) => setLocal((s) => ({ ...s, recurrence: e.target.value }))}>
            <option value="none">None</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="biweekly">Biweekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>

        <div className="form-row">
          <label>Minimum signup age</label>
          <input type="number" min="13" max="120" value={local.minSignupAge} onChange={(e) => setLocal((s) => ({ ...s, minSignupAge: e.target.value }))} />
        </div>

        <div className="form-row">
          <small>Users must be older than this age to complete signup; signup will validate integer age and reject younger users.</small>
        </div>

        <div className="form-row">
          <label>Default role for new slots</label>
          <select value={local.defaultSlotRole || ''} onChange={(e) => setLocal((s) => ({ ...s, defaultSlotRole: e.target.value }))}>
            <option value="">-- None --</option>
            {(allRoles || []).map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>

        <div className="form-row">
          <button type="submit">Save</button>
        </div>
            </fieldset>
      </form>

      {can('manage_training_admin') ? <section className="card" style={{ marginTop: '1.5rem' }}>
        <h3>Training settings</h3>
        <div className="form-row">
          <label>Basic training role for new members</label>
          <select value={basicTrainingRole} onChange={(event) => setBasicTrainingRole(event.target.value)}>
            {(allRoles || []).map((role) => <option key={role} value={role}>{role}</option>)}
          </select>
        </div>
        <button type="button" onClick={saveBasicTrainingRole}>Save training settings</button>
      </section> : null}

      
      

      <section className="card" style={{ marginTop: '1.5rem' }}>
        <h3>Change password</h3>
        <ChangePasswordForm changePassword={changePassword} />
      </section>

      <section className="card" style={{ marginTop: '1.5rem' }}>
        <h3>Backups & setup</h3>
        <div className="form-row" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" onClick={() => { window.location.href = '/init.html'; }}>Open Setup & Backups</button>
        </div>
        <div className="form-row">
          <small>Backup/restore functionality moved to the Setup page. Click the button to open the setup UI (includes export, demo import, reset and import features).</small>
        </div>
      </section>

      
    </section>
    )}

      {subpage === 'squadtypes' && (
        <section className="card">
          <h3>Squad types</h3>

          <div className="form-row">
            <button type="button" onClick={async () => {
              try {
                const token = localStorage.getItem('token');
                const res = await fetch('/api/squad-types', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ name: '', icon: `/markers/${AVAILABLE_MARKERS[0]}` }) });
                if (!res.ok) { const j = await res.json().catch(() => ({})); alert('Add failed: ' + (j && j.error ? j.error : res.statusText)); return; }
                const j = await res.json();
                setLocal((s) => ({ ...s, squadTypes: [...(s.squadTypes || []), j.squadType] }));
              } catch (err) { alert('Add failed: ' + (err && err.message ? err.message : err)); }
            }}>Add squad type</button>
          </div>

          {(local.squadTypes || []).map((st, idx) => {
            const inputId = `squad-icon-${st.id || idx}`;
            const src = st.icon ? (st.icon.startsWith('/') ? st.icon : `/markers/${st.icon}`) : null;
            return (
              <div key={st.id || idx} className="form-row" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <label style={{ minWidth: 38 }}>Type</label>
                <input value={st.name} onChange={async (e) => {
                    const name = e.target.value;
                    setLocal((s) => { const next = (s.squadTypes || []).slice(); next[idx] = { ...next[idx], name }; return { ...s, squadTypes: next }; });
                    try {
                      if (!st.id) return;
                      const token = localStorage.getItem('token');
                      await fetch(`/api/squad-types/${st.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ name }) });
                    } catch (err) { /* ignore */ }
                }} placeholder="Name" style={{ flex: '1 1 200px', maxWidth: 320 }} />
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const f = e.dataTransfer.files && e.dataTransfer.files[0];
                    if (f) (async () => {
                      try {
                        if (!uploadCustomMarker) { alert('Upload not available'); return; }
                        const url = await uploadCustomMarker(f);
                        if (!url) return;
                        setLocal((s) => { const next = (s.squadTypes || []).slice(); next[idx] = { ...next[idx], icon: url }; return { ...s, squadTypes: next }; });
                        if (st.id) {
                          const token = localStorage.getItem('token');
                          await fetch(`/api/squad-types/${st.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ icon: url }) });
                        }
                      } catch (err) { alert('Upload failed: ' + (err && err.message ? err.message : err)); }
                    })();
                  }}
                  style={{ width: 56, height: 56, border: '2px dashed #666', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', overflow: 'hidden' }}
                  title="Drop an image file here or click to choose"
                  onClick={() => document.getElementById(inputId)?.click()}
                >
                  {src ? (
                    <img src={src} alt="icon" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: 28, height: 28, background: '#333', borderRadius: 4 }} />
                  )}
                </div>
                <input id={inputId} type="file" accept=".svg,.png,.jpg,.jpeg,.gif" style={{ display: 'none' }} onChange={async (e) => { const f = e.target.files && e.target.files[0]; if (!f) return; try { if (!uploadCustomMarker) { alert('Upload not available'); return; } const url = await uploadCustomMarker(f); if (url) { setLocal((s) => { const next = (s.squadTypes || []).slice(); next[idx] = { ...next[idx], icon: url }; return { ...s, squadTypes: next }; }); if (st.id) { const token = localStorage.getItem('token'); await fetch(`/api/squad-types/${st.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ icon: url }) }); } } } catch (err) { alert('Upload failed: ' + (err && err.message ? err.message : err)); } }} />
                <button type="button" onClick={async () => {
                  if (!st.id) {
                    // local-only entry: remove locally
                    setLocal((s) => ({ ...s, squadTypes: (s.squadTypes || []).filter((_, i) => i !== idx) }));
                    return;
                  }
                  try {
                    const token = localStorage.getItem('token');
                    const res = await fetch(`/api/squad-types/${st.id}`, { method: 'DELETE', headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
                    if (!res.ok) { const j = await res.json().catch(() => ({})); alert('Delete failed: ' + (j && j.error ? j.error : res.statusText)); return; }
                    setLocal((s) => ({ ...s, squadTypes: (s.squadTypes || []).filter((_, i) => i !== idx) }));
                  } catch (err) { alert('Delete failed: ' + (err && err.message ? err.message : err)); }
                }} style={{ marginLeft: 8 }}>Remove</button>
              </div>
            );
          })}

          <div className="form-row">
            <small>Define squad type names and their default map icon. These values will be used as defaults for new operations.</small>
          </div>
        </section>
      )}

      {subpage === 'ranks' && (
        <section className="card">
          <Ranks ranks={ranks} reloadRanks={reloadRanks} setRanks={setRanks} users={users} setUsers={setUsers} uploadFile={uploadFile} />
        </section>
      )}

      {subpage === 'roles' && (
        <section className="card">
          <Roles allRoles={allRoles} templates={templates} customRoles={customRoles} addRole={addRole} deleteRole={deleteRole} renameRole={renameRole} goBack={goToDashboard} />
        </section>
      )}

      {subpage === 'permissions' && can('manage_permissions') ? (
        <Permissions
          groups={permissionGroups}
          definitions={permissionDefinitions}
          onGroupsChanged={onPermissionGroupsChanged}
        />
      ) : null}
    </div>
  );
}

function ChangePasswordForm({ changePassword }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!changePassword) {
      alert('Password change is not available');
      return;
    }
    if (newPassword !== confirmPassword) {
      alert('New passwords do not match');
      return;
    }
    const success = await changePassword(currentPassword, newPassword);
    if (success) {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    }
  };

  return (
    <form onSubmit={submit}>
      <div className="form-row">
        <label>Current password</label>
        <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
      </div>
      <div className="form-row">
        <label>New password</label>
        <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
      </div>
      <div className="form-row">
        <label>Confirm new password</label>
        <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
      </div>
      <div className="form-row">
        <button type="submit">Save password</button>
      </div>
    </form>
  );
}
