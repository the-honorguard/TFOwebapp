import { useState, useEffect } from 'react';

export default function Campaigns({
  campaigns,
  templates,
  users,
  uploadFile,
  createCampaign,
  updateCampaign,
  deleteCampaign
}) {
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ name: '', image: '', modlistPlayer: '', modlistServer: '', defaultTemplateId: null, missionmakerUserId: null });
  const [error, setError] = useState(null);

  useEffect(() => {
    if (editingId) {
      const c = campaigns.find((x) => x.id === editingId);
      if (c) setForm({ name: c.name || '', image: c.image || '', modlistPlayer: c.modlistPlayer || '', modlistServer: c.modlistServer || '', defaultTemplateId: c.defaultTemplateId || null, missionmakerUserId: c.missionmakerUserId || null });
    } else {
      setForm({ name: '', image: '', modlistPlayer: '', modlistServer: '', defaultTemplateId: null, missionmakerUserId: null });
    }
  }, [editingId, campaigns]);

  const startCreate = () => setEditingId('new');
  const startEdit = (id) => setEditingId(id);
  const cancel = () => setEditingId(null);

  const handleSave = async () => {
    setError(null);
    // require name and missionmaker
    if (!form.name || !form.missionmakerUserId) {
      setError('Please provide a name and assign a missionmaker.');
      return;
    }

    // build minimal payload (only include optional fields when present)
    const payload = { name: form.name, missionmakerUserId: Number(form.missionmakerUserId) };
    if (form.image) payload.image = form.image;
    if (form.modlistPlayer) payload.modlistPlayer = form.modlistPlayer;
    if (form.modlistServer) payload.modlistServer = form.modlistServer;
    if (form.defaultTemplateId) payload.defaultTemplateId = Number(form.defaultTemplateId);

    if (editingId === 'new') {
      const res = await createCampaign(payload);
      if (!res || !res.success) {
        setError(res?.error || 'Could not create campaign');
        return;
      }
    } else {
      const res = await updateCampaign(editingId, payload);
      if (!res || !res.success) {
        setError(res?.error || 'Could not update campaign');
        return;
      }
    }
    setEditingId(null);
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await uploadFile(file);
    setForm((prev) => ({ ...prev, image: url }));
  };

  const handleModlistUpload = async (type, e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await uploadFile(file);
    setForm((prev) => ({ ...prev, [type]: url }));
  };

  return (
    <section>
      <div className="builder-toolbar">
        <div>
          <h3>Campaigns</h3>
          <p>Create and manage campaigns. Assign a missionmaker, default template and assets.</p>
        </div>
        <div className="builder-actions">
          <button onClick={startCreate}>New campaign</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16 }}>
        <div style={{ flex: '0 0 320px' }}>
          <div className="template-list">
            {campaigns.length === 0 ? (
              <div className="empty-state">No campaigns yet.</div>
            ) : (
              campaigns.map((c) => (
                <div key={c.id} className="template-list-item">
                  <button onClick={() => startEdit(c.id)} className={editingId === c.id ? 'selected' : ''}>
                    {c.name}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <div style={{ flex: 1 }}>
          {editingId ? (
            <div className="card" style={{ padding: 12 }}>
              {error ? (
                <div className="error-panel" style={{background:'#fee',border:'1px solid #f99',padding:8,borderRadius:6,marginBottom:8}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <strong style={{color:'#900'}}>Error</strong>
                    <button className="secondary small" onClick={() => setError(null)}>Close</button>
                  </div>
                  <div style={{marginTop:6}}>{error}</div>
                </div>
              ) : null}
              <div style={{ display: 'grid', gap: 8 }}>
                <label>Name</label>
                <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />

                <label>Image (shown on overview)</label>
                <input type="file" accept="image/*" onChange={handleImageUpload} />
                {form.image ? <img src={form.image} alt="campaign" style={{ maxWidth: 360, borderRadius:6 }} /> : null}

                <label>Modlist (player)</label>
                <input type="file" onChange={(e) => handleModlistUpload('modlistPlayer', e)} />
                {form.modlistPlayer ? <div><a href={form.modlistPlayer} target="_blank" rel="noreferrer">modlist (player)</a></div> : null}

                <label>Modlist (server)</label>
                <input type="file" onChange={(e) => handleModlistUpload('modlistServer', e)} />
                {form.modlistServer ? <div><a href={form.modlistServer} target="_blank" rel="noreferrer">modlist (server)</a></div> : null}

                <label>Default ORBAT template</label>
                <select value={form.defaultTemplateId || ''} onChange={(e) => setForm((p) => ({ ...p, defaultTemplateId: e.target.value || null }))}>
                  <option value="">None</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>

                <label>Missionmaker (user)</label>
                <select value={form.missionmakerUserId || ''} onChange={(e) => setForm((p) => ({ ...p, missionmakerUserId: e.target.value || null }))}>
                  <option value="">None</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>{u.username} ({u.role || 'member'})</option>
                  ))}
                </select>

                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button onClick={handleSave}>Save</button>
                  <button className="secondary" onClick={cancel}>Cancel</button>
                  {editingId !== 'new' ? <button className="secondary" onClick={() => { if (confirm('Delete campaign?')) { deleteCampaign(editingId); setEditingId(null); } }}>Delete</button> : null}
                </div>
              </div>
            </div>
          ) : (
            <div className="empty-state">Select or create a campaign to edit.</div>
          )}
        </div>
      </div>
    </section>
  );
}
