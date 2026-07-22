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
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [cropImageUrl, setCropImageUrl] = useState(null);
  const [cropImgNatural, setCropImgNatural] = useState({ w: 0, h: 0 });
  const [cropState, setCropState] = useState({ scale: 1, baseScale: 1, posX: 0, posY: 0 });
  const cropContainerRef = useRef(null);
  const cropImgRef = useRef(null);
  const cropInitialRef = useRef(null);
  const dragRef = useRef({ dragging: false, startX: 0, startY: 0, origX: 0, origY: 0 });
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
    const found = (op.squads || []).some((squad) => (squad.slots || []).some((s) => s.assignedUserId === me.id));
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
    // open crop modal with preview
    const url = URL.createObjectURL(file);
    setCropImageUrl(url);
    setCropModalOpen(true);
    // preload image to get natural size and initialize crop state
    const img = new Image();
    img.onload = () => {
      setCropImgNatural({ w: img.naturalWidth, h: img.naturalHeight });
      const cropSize = 360;
      const base = Math.max(cropSize / img.naturalWidth, cropSize / img.naturalHeight);
      const dispW = img.naturalWidth * base;
      const dispH = img.naturalHeight * base;
      const posX = (cropSize - dispW) / 2;
      const posY = (cropSize - dispH) / 2;
      const initial = { scale: 1, baseScale: base, posX, posY };
      cropInitialRef.current = initial;
      setCropState(initial);
    };
    img.src = url;

    // upload original image in background and store its URL so user can re-open modal later
    (async () => {
      try {
        setUploading(true);
        const origUrl = await uploadAvatar(file);
        const newProfile = { ...(me.profile || {}), avatarOriginalUrl: origUrl };
        // persist to server so original is available after reload
        try {
          const updated = await updateMyProfile({ profile: newProfile });
          setMe(updated);
          setEdit((p) => ({ ...p, profile: updated.profile || {} }));
        } catch (e) {
          // fallback to in-memory if server update fails
          setMe((m) => ({ ...m, profile: newProfile }));
          setEdit((p) => ({ ...p, profile: newProfile }));
        }
      } catch (err) {
        console.warn('Uploading original avatar failed', err);
      } finally {
        setUploading(false);
      }
    })();
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

  const closeCropModal = () => {
    if (cropImageUrl) URL.revokeObjectURL(cropImageUrl);
    setCropImageUrl(null);
    setCropModalOpen(false);
    setSelectedFileName('No file selected');
  };

  const performCropAndUpload = async () => {
    if (!cropImageUrl || !cropImgNatural) return;
    try {
      setUploading(true);
      const outSize = 512; // output pixels
      const cropPx = 360; // UI crop size
      const canvas = document.createElement('canvas');
      canvas.width = outSize;
      canvas.height = outSize;
      const ctx = canvas.getContext('2d');

      const img = cropImgRef.current;
      const { w: natW, h: natH } = cropImgNatural;
      const { baseScale, scale, posX, posY } = cropState;
      const scaleDisplay = baseScale * scale;

      const srcX = Math.max(0, Math.round((-posX) / scaleDisplay));
      const srcY = Math.max(0, Math.round((-posY) / scaleDisplay));
      const srcW = Math.min(natW - srcX, Math.round(cropPx / scaleDisplay));
      const srcH = Math.min(natH - srcY, Math.round(cropPx / scaleDisplay));

      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, outSize, outSize);
      ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, outSize, outSize);

      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
      const file = new File([blob], 'avatar.jpg', { type: 'image/jpeg' });
      const url = await uploadAvatar(file);
      const updated = await updateMyProfile({ profile: { ...(me.profile || {}), avatarUrl: url, avatarCrop: { x: Math.round((-cropState.posX + cropPx / 2) / (cropState.baseScale * cropState.scale) / cropImgNatural.w * 100), y: Math.round((-cropState.posY + cropPx / 2) / (cropState.baseScale * cropState.scale) / cropImgNatural.h * 100), zoom: cropState.scale } } });
      setMe(updated);
      setEdit((p) => ({ ...p, profile: updated.profile || {} }));
      closeCropModal();
    } catch (err) {
      alert(err.message || 'Crop/upload failed');
    } finally {
      setUploading(false);
    }
  };

  const onCropMouseDown = (ev) => {
    ev.preventDefault();
    dragRef.current.dragging = true;
    dragRef.current.startX = ev.clientX;
    dragRef.current.startY = ev.clientY;
    dragRef.current.origX = cropState.posX;
    dragRef.current.origY = cropState.posY;
    window.addEventListener('mousemove', onCropMouseMove);
    window.addEventListener('mouseup', onCropMouseUp);
  };
  const onCropMouseMove = (ev) => {
    if (!dragRef.current.dragging) return;
    const dx = ev.clientX - dragRef.current.startX;
    const dy = ev.clientY - dragRef.current.startY;
    setCropState((s) => ({ ...s, posX: dragRef.current.origX + dx, posY: dragRef.current.origY + dy }));
  };
  const onCropMouseUp = () => {
    dragRef.current.dragging = false;
    window.removeEventListener('mousemove', onCropMouseMove);
    window.removeEventListener('mouseup', onCropMouseUp);
  };

  const zoomCrop = (factor) => {
    const cropPx = 360;
    setCropState((s) => {
      const oldDisplay = s.baseScale * s.scale;
      const newScale = Math.min(4, Math.max(0.4, s.scale * factor));
      const newDisplay = s.baseScale * newScale;
      const cx = cropPx / 2;
      const cy = cropPx / 2;
      const imgCenterX = (cx - s.posX) / oldDisplay;
      const imgCenterY = (cy - s.posY) / oldDisplay;
      const newPosX = cx - imgCenterX * newDisplay;
      const newPosY = cy - imgCenterY * newDisplay;
      return { ...s, scale: newScale, posX: newPosX, posY: newPosY };
    });
  };

  return (
    <div className="profile-page">
      <h3>Profile</h3>
      <div style={{ display: 'flex', gap: 16 }}>
        <div style={{ width: 320 }}>
          <div style={{ padding: 12, borderRadius: 8, background: 'var(--panel)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 200, height: 200, borderRadius: 8, overflow: 'hidden', background: '#222', position: 'relative' }}>
              {me.profile?.avatarUrl ? (
                <div
                  title="Edit image"
                  style={{ width: '100%', height: '100%', position: 'relative', cursor: 'pointer' }}
                  onClick={(ev) => {
                    // Open crop modal to adjust avatar (use preserved original if available)
                    const source = (me.profile && me.profile.avatarOriginalUrl) || me.profile?.avatarUrl;
                    if (!source) return;
                    setCropImageUrl(source);
                    setCropModalOpen(true);
                    // preload image and initialize crop state; if existing avatarCrop present, restore it
                    const img = new Image();
                    img.onload = () => {
                      setCropImgNatural({ w: img.naturalWidth, h: img.naturalHeight });
                      const cropSize = 360;
                      const base = Math.max(cropSize / img.naturalWidth, cropSize / img.naturalHeight);
                        const zoom = (me.profile && me.profile.avatarCrop && me.profile.avatarCrop.zoom) ? me.profile.avatarCrop.zoom : 1;
                        const displayScale = base * zoom;
                        const cx = cropSize / 2;
                        const cy = cropSize / 2;
                        const focalX = (me.profile && me.profile.avatarCrop && typeof me.profile.avatarCrop.x === 'number') ? me.profile.avatarCrop.x : 50;
                        const focalY = (me.profile && me.profile.avatarCrop && typeof me.profile.avatarCrop.y === 'number') ? me.profile.avatarCrop.y : 50;
                        const imgCenterX = (focalX / 100) * img.naturalWidth;
                        const imgCenterY = (focalY / 100) * img.naturalHeight;
                        const posX = cx - imgCenterX * displayScale;
                        const posY = cy - imgCenterY * displayScale;
                        const initial = { scale: zoom, baseScale: base, posX, posY };
                        cropInitialRef.current = initial;
                        setCropState(initial);
                    };
                    img.src = source;
                  }}
                >
                  <img
                    src={me.profile.avatarUrl}
                    alt="Avatar"
                    style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0 }}
                  />
                  {/* removed center focus marker per user request */}
                </div>
              ) : (
                <div style={{ color: '#999', padding: 12 }}>No avatar</div>
              )}
              <div style={{ fontSize: 12, color: 'var(--muted)', paddingTop: 6 }}>
                Click the preview to re-open the crop modal and adjust your avatar
              </div>
            </div>

            <div style={{ width: '100%' }}>
                  <label className="secondary small" style={{ display: 'block', marginBottom: 8 }}>Upload avatar</label>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button type="button" onClick={() => fileInputRef.current && fileInputRef.current.click()}>Choose file...</button>
                    <span style={{ color: 'var(--muted)', fontSize: 13 }}>{selectedFileName}</span>
                  </div>
                  <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFile} disabled={uploading} style={{ display: 'none' }} />
                  {cropModalOpen ? (
                    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999 }}>
                      <div style={{ width: 820, maxWidth: '95vw', background: 'var(--panel)', padding: 16, borderRadius: 8, boxShadow: '0 12px 40px rgba(0,0,0,0.6)', display: 'flex', gap: 12 }}>
                        <div style={{ width: 380, height: 380, position: 'relative', overflow: 'hidden', background: '#111', borderRadius: 6 }} ref={cropContainerRef}>
                          <div style={{ width: 360, height: 360, position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', boxSizing: 'border-box' }} onMouseDown={onCropMouseDown}>
                            <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
                              {cropImageUrl ? (
                                <img ref={cropImgRef} src={cropImageUrl} alt="Avatar crop" style={{ position: 'absolute', left: cropState.posX + 'px', top: cropState.posY + 'px', transform: `scale(${cropState.baseScale * cropState.scale})`, transformOrigin: 'top left', willChange: 'transform' }} />
                              ) : null}
                              {/* overlay that darkens only the area outside the square (keeps center clear) */}
                                <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: 320, height: 320, borderRadius: 0, border: '6px solid rgba(255,255,255,0.95)', boxSizing: 'border-box', pointerEvents: 'none', boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)' }} />
                            </div>
                          </div>
                        </div>
                        <div style={{ width: 1, background: 'transparent', flex: 1, display: 'flex', flexDirection: 'column', gap: 8, justifyContent: 'center' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', padding: '0 12px' }}>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', width: '100%' }}>
                              <div style={{ width: 28, textAlign: 'center', color: '#ddd' }}>🖼️</div>
                              <input
                                type="range"
                                min={0.4}
                                max={4}
                                step={0.01}
                                value={cropState.scale}
                                onChange={(e) => {
                                  const newScale = Number(e.target.value);
                                  const cropPx = 360;
                                  setCropState((s) => {
                                    const oldDisplay = s.baseScale * s.scale;
                                    const newDisplay = s.baseScale * newScale;
                                    const cx = cropPx / 2;
                                    const cy = cropPx / 2;
                                    const imgCenterX = (cx - s.posX) / oldDisplay;
                                    const imgCenterY = (cy - s.posY) / oldDisplay;
                                    const newPosX = cx - imgCenterX * newDisplay;
                                    const newPosY = cy - imgCenterY * newDisplay;
                                    return { ...s, scale: newScale, posX: newPosX, posY: newPosY };
                                  });
                                }}
                                style={{ flex: 1 }}
                              />
                              <div style={{ width: 28, textAlign: 'center', color: '#ddd' }}>🔎</div>
                            </div>
                            <div style={{ height: 8 }} />
                            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                              <button type="button" className="secondary" onClick={() => {
                                if (cropInitialRef.current) setCropState(cropInitialRef.current);
                              }}>Reset</button>
                              <button type="button" onClick={closeCropModal}>Cancel</button>
                              <button type="button" onClick={performCropAndUpload} style={{ background: 'var(--accent)', color: '#fff' }}>{uploading ? 'Uploading...' : 'Apply'}</button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}
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
