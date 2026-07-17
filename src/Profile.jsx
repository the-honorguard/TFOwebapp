import React, { useEffect, useState, useRef } from 'react';

// Profile component
// - Loads the current user's full profile (via `/api/users/me`) and allows
//   editing profile fields, uploading avatar and changing password.
// - Falls back to provided `auth` + `users` props if the API does not return data.
export default function Profile({ auth, users = [], ops = [], changePassword, uploadAvatar, updateMyProfile, allRoles = [], ranks = [] }) {
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [edit, setEdit] = useState({});
  const [uploading, setUploading] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState('No file selected');
  const fileInputRef = useRef(null);
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [showPwModal, setShowPwModal] = useState(false);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/users/me', { headers: { Authorization: `Bearer ${token}` } });
        const contentType = res.headers.get('content-type') || '';
        const data = contentType.includes('application/json') ? await res.json() : { error: 'Non-JSON response', body: await res.text() };
        if (!res.ok) {
          const msg = data && data.error ? data.error : (data.body || 'Failed');
          throw new Error(msg);
        }
        if (!data || !data.user) {
          // Fallback: try to populate from provided props (auth + users)
          const fallback = (auth && (users.find((u) => u.id === auth.id) || users.find((u) => u.username === auth.username))) || null;
          if (fallback) {
            if (mounted) {
              setMe(fallback);
              setEdit({ rank: fallback?.rank || '', status: fallback?.status || 'Active', profile: { ...(fallback?.profile || {}) } });
              setError('Profile data incomplete from API; using local data');
            }
          } else {
            throw new Error('No user data returned');
          }
        } else {
          if (mounted) {
            setMe(data.user);
            setEdit({ rank: data.user?.rank || '', status: data.user?.status || 'Active', profile: { ...(data.user?.profile || {}) } });
          }
        }
      } catch (e) {
        console.error('Failed to load /api/users/me', e);
        setError(String(e.message || e));
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, []);

  if (loading) return <div>Loading...</div>;
  if (!me) return <div>Could not load profile. {error ? <div style={{color:'var(--accent)'}}>{error}</div> : null}</div>;

  const attendedCount = ops.reduce((count, op) => {
    const found = (op.sections || []).some((section) => (section.slots || []).some((s) => s.assignedUserId === me.id));
    return count + (found ? 1 : 0);
  }, 0);

  // Resolve rank object (DB may store rank as numeric id, short code or name)
  const resolveRank = (rankVal) => {
    if (!rankVal) return null;
    const valStr = String(rankVal);
    // try id match
    let found = ranks.find((r) => String(r.id) === valStr);
    if (found) return found;
    // try short or name match (case-insensitive)
    found = ranks.find((r) => (r.short && r.short.toLowerCase() === valStr.toLowerCase()) || (r.name && r.name.toLowerCase() === valStr.toLowerCase()));
    return found || null;
  };
  const rankObj = resolveRank(me.rank);

  const handleFile = async (e) => {
    const file = (e.target && e.target.files && e.target.files[0]) || null;
    if (!file) return;
    setSelectedFileName(file.name);
    setUploading(true);
    try {
      const url = await uploadAvatar(file);
      const updated = await updateMyProfile({ profile: { ...(me.profile || {}), avatarUrl: url } });
      setMe(updated);
      setEdit((prev) => ({ ...prev, profile: updated.profile || {} }));
      setSelectedFileName('No file selected');
    } catch (err) {
      alert(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const saveProfile = async (e) => {
    e.preventDefault();
    try {
      const patch = { status: edit.status, profile: edit.profile };
      const updated = await updateMyProfile(patch);
      setMe(updated);
      alert('Profile updated');
    } catch (err) {
      alert(err.message || 'Could not update profile');
    }
  };

  const submitChangePassword = async (e) => {
    e.preventDefault();
    if (!pwForm.currentPassword || !pwForm.newPassword) return alert('Fill in both fields');
    if (pwForm.newPassword !== pwForm.confirmPassword) return alert('Passwords do not match');
    try {
      const ok = await changePassword(pwForm.currentPassword, pwForm.newPassword);
      if (ok) {
        setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      }
    } catch (e) {
      alert('Could not change password');
    }
  };

  return (
    <div className="profile-page">
      <h3>Profile</h3>
      <div style={{ display: 'flex', gap: 16 }}>
        <div style={{ width: 320 }}>
          <div style={{ padding: 12, borderRadius: 8, background: 'var(--panel)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 200, height: 200, borderRadius: 8, overflow: 'hidden', background: '#222' }}>
              {me.profile?.avatarUrl ? (
                <img src={me.profile.avatarUrl} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <div style={{ color: '#999', padding: 12 }}>No avatar</div>
              )}
            </div>

            <div style={{ width: '100%' }}>
                  <label className="secondary small" style={{ display: 'block', marginBottom: 8 }}>Upload avatar</label>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button type="button" onClick={() => fileInputRef.current && fileInputRef.current.click()}>Choose file...</button>
                    <span style={{ color: 'var(--muted)', fontSize: 13 }}>{selectedFileName}</span>
                  </div>
                  <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFile} disabled={uploading} style={{ display: 'none' }} />
                </div>

            <div style={{ width: '100%', textAlign: 'left' }}>
              <strong style={{ display: 'block' }}>{me.username}</strong>
              <div style={{ marginTop: 6 }}>Role: {me.role}</div>
              <div>Signed ops: {attendedCount}</div>
            </div>
          </div>
        </div>

        <div style={{ flex: 1 }}>
          <form onSubmit={saveProfile} className="player-form">
            <div>
              <label>Rank</label>
              <div style={{ padding: '6px 8px', background: 'var(--panel)', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 10 }}>
                {rankObj && rankObj.icon ? (
                  <img src={rankObj.icon} alt={rankObj.name} style={{ width: 40, height: 40, objectFit: 'contain' }} />
                ) : null}
                <div>{(rankObj && rankObj.name) || me.rank || '-'}</div>
              </div>
            </div>
            <div>
              <label>Status</label>
              <select value={edit.status} onChange={(e) => setEdit((p) => ({ ...p, status: e.target.value }))}>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
                <option value="LoA">LoA</option>
              </select>
            </div>

            {/* Bio removed per request */}

            <div>
              <label>Discord username</label>
              <input value={edit.profile?.discord || ''} onChange={(e) => setEdit((p) => ({ ...p, profile: { ...(p.profile||{}), discord: e.target.value } }))} />
            </div>

            <div>
              <label>Extra link</label>
              <input value={edit.profile?.link || ''} onChange={(e) => setEdit((p) => ({ ...p, profile: { ...(p.profile||{}), link: e.target.value } }))} />
            </div>

            <div style={{ marginTop: 8 }}>
              <button type="submit">Save profile</button>
            </div>
          </form>

          <div style={{ marginTop: 20 }}>
            <h4>Roles & Permissions</h4>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {allRoles && allRoles.length > 0 ? (
                allRoles.map((role) => {
                  const has = me.permissions && !!me.permissions[role];
                  const isCurrent = me.role === role;
                  return (
                    <span
                      key={role}
                      className="role-badge"
                      style={{
                        marginRight: 6,
                        padding: '4px 8px',
                        borderRadius: 6,
                        fontSize: 13,
                        background: isCurrent ? 'var(--accent)' : (has ? 'var(--positive)' : 'var(--panel)'),
                        color: isCurrent || has ? '#fff' : 'inherit',
                        border: isCurrent ? '2px solid var(--accent)' : '1px solid var(--border)'
                      }}
                    >
                      {role}{isCurrent ? ' (current)' : ''}
                    </span>
                  );
                })
              ) : (
                (me.permissions && Object.entries(me.permissions).filter(([, v]) => v).map(([role]) => (
                  <span key={role} className="role-badge" style={{ marginRight: 6 }}>{role}</span>
                ))) || <div>No roles</div>
              )}
            </div>
          </div>

          <div style={{ marginTop: 20 }}>
            <h4>Change password</h4>
            <div>
              <button onClick={() => setShowPwModal(true)}>Change password</button>
            </div>

            {showPwModal ? (
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
                <div style={{ width: 420, background: 'var(--panel)', padding: 20, borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
                  <h4 style={{ marginTop: 0 }}>Change password</h4>
                  <form onSubmit={async (e) => {
                    e.preventDefault();
                    if (!pwForm.currentPassword || !pwForm.newPassword) return alert('Fill in both fields');
                    if (pwForm.newPassword !== pwForm.confirmPassword) return alert('Passwords do not match');
                    try {
                      const ok = await changePassword(pwForm.currentPassword, pwForm.newPassword);
                      if (ok) {
                        setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
                        setShowPwModal(false);
                        alert('Password changed');
                      }
                    } catch (err) {
                      alert(err.message || 'Could not change password');
                    }
                  }}>
                    <div style={{ marginBottom: 8 }}>
                      <input type="password" placeholder="Current password" value={pwForm.currentPassword} onChange={(e) => setPwForm((p) => ({ ...p, currentPassword: e.target.value }))} />
                    </div>
                    <div style={{ marginBottom: 8 }}>
                      <input type="password" placeholder="New password" value={pwForm.newPassword} onChange={(e) => setPwForm((p) => ({ ...p, newPassword: e.target.value }))} />
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <input type="password" placeholder="Confirm new password" value={pwForm.confirmPassword} onChange={(e) => setPwForm((p) => ({ ...p, confirmPassword: e.target.value }))} />
                    </div>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button type="button" className="secondary" onClick={() => setShowPwModal(false)}>Cancel</button>
                      <button type="submit">Change password</button>
                    </div>
                  </form>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
