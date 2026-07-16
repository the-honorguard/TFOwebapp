import { useEffect, useState } from 'react';
import Ranks from './Ranks';
import Roles from './settings/Roles';
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
  setUsers = null
}) {
  const [subpage, setSubpage] = useState(() => initialSubpage || 'general');

  useEffect(() => {
    if (initialSubpage) setSubpage(initialSubpage);
  }, [initialSubpage]);
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

  const addSquadType = () => {
    setLocal((s) => ({
      ...s,
      squadTypes: [
        ...(s.squadTypes || []),
        { id: Date.now(), name: '', icon: AVAILABLE_MARKERS[0] }
      ]
    }));
  };

  const updateSquadType = (idx, patch) => {
    setLocal((s) => {
      const next = (s.squadTypes || []).slice();
      next[idx] = { ...next[idx], ...patch };
      return { ...s, squadTypes: next };
    });
  };

  const removeSquadType = (idx) => {
    setLocal((s) => ({ ...s, squadTypes: (s.squadTypes || []).filter((_, i) => i !== idx) }));
  };

  const uploadForSquadType = async (idx, file) => {
    if (!file) return;
    try {
      if (!uploadCustomMarker) {
        alert('Upload not available');
        return;
      }
      const url = await uploadCustomMarker(file);
      if (url) updateSquadType(idx, { icon: url });
    } catch (err) {
      alert('Upload failed: ' + (err.message || err));
    }
  };

  

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
        <button className={subpage === 'ranks' ? 'tab active' : 'tab'} onClick={() => setSubpage('ranks')}>Ranks</button>
        <button className={subpage === 'roles' ? 'tab active' : 'tab'} onClick={() => setSubpage('roles')}>Roles</button>
      </div>

      {subpage === 'general' && (
        <section className="card">
          <h3>Default values for new operations</h3>

          <form onSubmit={save}>
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
      </form>

      <section className="card" style={{ marginTop: '1rem' }}>
        <h3>Squad types</h3>

        <div className="form-row">
          <button type="button" onClick={addSquadType}>Add squad type</button>
        </div>

        {(local.squadTypes || []).map((st, idx) => {
          const inputId = `squad-icon-${st.id || idx}`;
          const src = st.icon ? (st.icon.startsWith('/') ? st.icon : `/markers/${st.icon}`) : null;
          return (
            <div key={st.id || idx} className="form-row" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <label style={{ minWidth: 38 }}>Type</label>
              <input value={st.name} onChange={(e) => updateSquadType(idx, { name: e.target.value })} placeholder="Name" style={{ flex: '1 1 200px', maxWidth: 320 }} />
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files && e.dataTransfer.files[0];
                  if (f) uploadForSquadType(idx, f);
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
              <input id={inputId} type="file" accept=".svg,.png,.jpg,.jpeg,.gif" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files && e.target.files[0]; if (f) uploadForSquadType(idx, f); }} />
              <button type="button" onClick={() => removeSquadType(idx)} style={{ marginLeft: 8 }}>Remove</button>
            </div>
          );
        })}

        <div className="form-row">
          <small>Define squad type names and their default map icon. These values will be used as defaults for new operations.</small>
        </div>
      </section>

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
