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
  const [selectedCampaignId, setSelectedCampaignId] = useState(null);
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

  const renameCampaign = async () => {
    if (!selectedCampaignId) return;
    const c = campaigns.find((x) => x.id === selectedCampaignId);
    if (!c) return;
    const newName = prompt('New campaign name', c.name || '');
    if (!newName) return;
    const res = await updateCampaign(selectedCampaignId, { name: newName });
    if (!res || !res.success) setError(res?.error || 'Could not rename campaign');
  };

  const duplicateCampaign = async () => {
    if (!selectedCampaignId) return;
    const c = campaigns.find((x) => x.id === selectedCampaignId);
    if (!c) return;
    const payload = {
      name: (c.name || 'Untitled') + ' (copy)',
      missionmakerUserId: c.missionmakerUserId || null
    };
    if (c.image) payload.image = c.image;
    if (c.modlistPlayer) payload.modlistPlayer = c.modlistPlayer;
    if (c.modlistServer) payload.modlistServer = c.modlistServer;
    if (c.defaultTemplateId) payload.defaultTemplateId = c.defaultTemplateId;
    const res = await createCampaign(payload);
    if (!res || !res.success) setError(res?.error || 'Could not duplicate campaign');
  };

  const deleteSelected = async () => {
    if (!selectedCampaignId) return;
    if (!confirm('Delete selected campaign?')) return;
    await deleteCampaign(selectedCampaignId);
    setSelectedCampaignId(null);
    if (editingId === selectedCampaignId) setEditingId(null);
  };

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
    <>
      <section className="card">
        <div className="builder-toolbar">
          <div>
            <h3>Campaign selection</h3>
            <p>Choose a campaign to edit and create new campaigns.</p>
          </div>
        </div>

        <div className="template-builder-top">
          <div className="template-list-builder">
            <div className="template-builder-select" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <select
                value={selectedCampaignId ?? ''}
                onChange={(e) => {
                  const v = e.target.value ? Number(e.target.value) : null;
                  setSelectedCampaignId(v);
                  if (v) startEdit(v);
                }}
                style={{ padding: '0.6rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--text)' }}
              >
                <option value="">Choose campaign</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={() => { startCreate(); setSelectedCampaignId(null); }}>New campaign</button>
                <button className="secondary" onClick={renameCampaign} disabled={!selectedCampaignId}>Rename</button>
                <button className="secondary" onClick={duplicateCampaign} disabled={!selectedCampaignId}>Duplicate</button>
                <button className="secondary" onClick={() => selectedCampaignId && deleteSelected()} disabled={!selectedCampaignId}>Delete</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="builder-toolbar">
          <div>
            <h3>Configure campaign</h3>
            <p>Edit the selected campaign. Assign a missionmaker, default template and assets.</p>
          </div>
        </div>

        <div style={{ flex: 1 }}>
          {editingId ? (
            <div style={{ padding: 0 }}>
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
      </section>
    </>
  );
}
