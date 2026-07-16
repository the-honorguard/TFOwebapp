import { useEffect, useState, useRef } from 'react';

const API = '/api';

export default function Ranks({ ranks: initialRanks = [], reloadRanks, setRanks, uploadFile, users = [], setUsers }) {
  const [ranks, setLocalRanks] = useState(initialRanks || []);
  const [newName, setNewName] = useState('');
  const [newShort, setNewShort] = useState('');
  const [error, setError] = useState('');
  const [uploadingRankId, setUploadingRankId] = useState(null);
  const [uploadSuccessId, setUploadSuccessId] = useState(null);
  const [uploadProgress, setUploadProgress] = useState({});
  const dragItem = useRef();

  useEffect(() => setLocalRanks(initialRanks || []), [initialRanks]);

  const createRank = async (e) => {
    e.preventDefault();
    setError('');
    const token = localStorage.getItem('token');
    if (!token) { setError('You must be logged in as admin to create ranks'); return; }
    if (!newName.trim()) { setError('Please provide a name'); return; }
    try {
      const res = await fetch(`${API}/ranks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: newName.trim(), short: newShort.trim() })
      });
      let data;
      try { data = await res.json(); } catch (parseErr) { const txt = await res.text(); throw new Error(txt || 'Server returned invalid JSON'); }
      if (res.ok && data.rank) {
        if (setRanks) setRanks((prev) => [...prev, data.rank]);
        setLocalRanks((prev) => [...prev, data.rank]);
        setNewName(''); setNewShort('');
      } else {
        setError(data.error || 'Could not create rank');
      }
    } catch (e) {
      setError(e.message || 'Could not create rank');
    }
  };

  const updateRank = async (id, patch) => {
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${API}/ranks/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(patch)
      });
      let data;
      try { data = await res.json(); } catch (parseErr) { const txt = await res.text(); throw new Error(txt || 'Server returned invalid JSON'); }
      if (res.ok && data.rank) {
        setLocalRanks((prev) => prev.map((r) => (r.id === data.rank.id ? data.rank : r)));
        if (setRanks) setRanks((prev) => prev.map((r) => (r.id === data.rank.id ? data.rank : r)));
      } else {
        alert(data.error || 'Could not update rank');
      }
    } catch (e) {
      alert(e.message || 'Could not update rank');
    }
  };

  const deleteRank = async (id) => {
    if (!confirm('Delete this rank?')) return;
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API}/ranks/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        setLocalRanks((prev) => prev.filter((r) => r.id !== id));
        if (setRanks) setRanks((prev) => prev.filter((r) => r.id !== id));
        if (setUsers) setUsers((prev) => prev.map((u) => (u.rank === id ? { ...u, rank: '' } : u)));
      } else {
        let data;
        try { data = await res.json(); } catch (parseErr) { const txt = await res.text(); throw new Error(txt || 'Delete failed'); }
        alert(data.error || 'Could not delete rank');
      }
    } catch (e) {
      alert(e.message || 'Could not delete rank');
    }
  };

  const onDragStart = (e, index) => { dragItem.current = index; };
  const onDrop = async (e, index) => {
    const from = dragItem.current;
    if (from === undefined) return;
    const copy = [...ranks];
    const [moved] = copy.splice(from, 1);
    copy.splice(index, 0, moved);
    // update order numerically
    const updated = copy.map((r, i) => ({ ...r, order: i + 1 }));
    setLocalRanks(updated);
    if (setRanks) setRanks(updated);
    // persist orders
    const token = localStorage.getItem('token');
    try {
      await Promise.all(updated.map((r) => fetch(`${API}/ranks/${r.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ order: r.order })
      })));
    } catch (e) {
      console.error('Order save failed', e);
      alert('Could not save new order');
      reloadRanks && reloadRanks();
    }
    dragItem.current = null;
  };

  const onIconUpload = async (file, rankId) => {
    setError('');
    if (!uploadFile) { setError('Upload function not available'); return; }
    setUploadingRankId(rankId);
    setUploadProgress((prev) => ({ ...prev, [rankId]: 0 }));
    try {
      const url = await uploadFile(file, (p) => setUploadProgress((prev) => ({ ...prev, [rankId]: p })));
      if (!url) throw new Error('Upload failed');
      await updateRank(rankId, { icon: url });
      setUploadSuccessId(rankId);
      setTimeout(() => setUploadSuccessId((prev) => (prev === rankId ? null : prev)), 2000);
    } catch (e) {
      setError(e.message || 'Could not upload icon');
    } finally {
      setUploadingRankId(null);
      setUploadProgress((prev) => { const copy = { ...prev }; delete copy[rankId]; return copy; });
    }
  };

  return (
    <div>
      <div className="playerlist-toolbar">
        <button className="secondary small" onClick={() => window.history.back()}>Back</button>
        <div>
          <h3>Ranks</h3>
          <p>Create, rename, reorder and delete ranks. Upload icons per rank by dropping a file.
          </p>
        </div>
      </div>

      <section className="card role-add-section">
        <h4>New rank</h4>
        <form className="role-add-form" onSubmit={createRank}>
          <input placeholder="Display name" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <input placeholder="Abbreviation" value={newShort} onChange={(e) => setNewShort(e.target.value)} />
          <button type="submit">Create</button>
        </form>
        {error ? <div className="field-error" style={{marginTop:8}}>{error}</div> : null}
      </section>

      <div className="role-grid">
        {ranks.length === 0 ? <div className="empty-state">No ranks defined yet.</div> : ranks.map((rank, idx) => (
          <div key={rank.id} className="role-card" draggable onDragStart={(e) => onDragStart(e, idx)} onDragOver={(e) => e.preventDefault()} onDrop={(e) => onDrop(e, idx)}>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              {rank.icon ? <img src={rank.icon} alt="icon" style={{width:28,height:28}} /> : <div style={{width:28,height:28,background:'#eee'}} />}
              <div style={{flex:1}}>
                <strong>{rank.name}</strong>
                <div style={{fontSize:'0.85rem',opacity:0.8}}>{rank.short}</div>
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:6}}>
                <button className="secondary small" onClick={() => {
                  const newName = prompt('New name', rank.name);
                  if (newName && newName !== rank.name) updateRank(rank.id, { name: newName });
                }}>Rename</button>
                <button className="secondary small" onClick={() => deleteRank(rank.id)}>Delete</button>
              </div>
            </div>

            <div style={{marginTop:8,display:'flex',gap:8,alignItems:'center'}}>
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) onIconUpload(f, rank.id); }}
                  style={{padding:'6px 8px',border:'1px dashed var(--border)',borderRadius:6,cursor:'pointer',minWidth:120}}
                >
                  {uploadProgress[rank.id] != null
                    ? `Uploading... ${uploadProgress[rank.id]}%`
                    : uploadingRankId === rank.id
                      ? 'Uploading...'
                      : uploadSuccessId === rank.id
                        ? 'Uploaded'
                        : 'Drop icon here'}
                </div>
              <label style={{padding:'6px 10px',background:'var(--panel)',border:'1px solid var(--border)',borderRadius:6,cursor:'pointer'}}>
                Choose file
                <input type="file" accept="image/*,.svg" style={{display:'none'}} onChange={(e) => { const f = e.target.files?.[0]; if (f) onIconUpload(f, rank.id); }} />
              </label>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
