import { useEffect, useMemo, useState } from 'react';
import apiFetch from './api';

const labels = { requested: 'Requested', claimed: 'Claimed', planning: 'Planning', scheduled: 'Scheduled', completed: 'Completed', cancelled: 'Cancelled', passed: 'Passed', not_yet: 'Not yet qualified', absent: 'Absent' };
const dateTime = (value) => value ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';
const combineDateTime = (date, time) => date && time ? `${date}T${time}` : '';

export default function Training({ auth, users = [], roles = [], onQualificationsChanged }) {
  const token = localStorage.getItem('token');
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  const [data, setData] = useState({ requests: [], sessions: [], trainerRights: [], settings: {}, access: {} });
  const [tab, setTab] = useState('mine');
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [requestForm, setRequestForm] = useState({ roleName: '', userId: auth.id, notes: '', overrideReason: '' });
  const [sessionForm, setSessionForm] = useState({ roleName: '', title: '', startsOn: '', startsTime: '', capacity: 1, isOpen: false, requestIds: [] });
  const [proposal, setProposal] = useState({ startsOn: '', startsTime: '', message: '' });
  const [adminDrafts, setAdminDrafts] = useState({});

  const call = (url, options = {}) => apiFetch(url, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  const load = async () => {
    setError('');
    try {
      const result = await call('/training');
      setData(result);
      const grouped = {};
      for (const right of result.trainerRights || []) grouped[right.userId] = [...(grouped[right.userId] || []), right.roleName];
      setAdminDrafts(grouped);
    } catch (e) { setError(e.message); }
  };
  useEffect(() => { load(); }, []);

  const mine = useMemo(() => data.requests.filter((item) => String(item.user_id) === String(auth.id)), [data.requests, auth.id]);
  const queue = useMemo(() => data.requests.filter((item) => !['completed','cancelled'].includes(item.status)), [data.requests]);
  const completed = useMemo(() => data.requests.filter((item) => item.status === 'completed'), [data.requests]);
  const windows = data.access.windows || { mine: true, queue: false, sessions: true, history: true, admin: data.access.admin };
  const trainingRoles = data.roles?.length ? data.roles : roles;
  useEffect(() => {
    if (windows[tab]) return;
    const nextTab = ['mine','queue','sessions','history','admin'].find((name) => windows[name]);
    if (nextTab) setTab(nextTab);
  }, [windows.mine, windows.queue, windows.sessions, windows.history, windows.admin, tab]);
  const cooldown = mine.reduce((latest, item) => item.lastPassedAt && (!latest || new Date(item.lastPassedAt) > new Date(latest)) ? item.lastPassedAt : latest, null);
  const cooldownUntil = cooldown ? new Date(new Date(cooldown).setMonth(new Date(cooldown).getMonth() + 3)) : null;

  const openDetail = async (id) => {
    setSelectedId(id); setError('');
    try { setDetail(await call(`/training/requests/${id}`)); } catch (e) { setError(e.message); }
  };
  const mutate = async (url, body, method = 'POST') => {
    setBusy(true); setError('');
    try { await call(url, { method, body: JSON.stringify(body) }); await load(); if (selectedId) await openDetail(selectedId); return true; }
    catch (e) { setError(e.message); return false; } finally { setBusy(false); }
  };
  const createRequest = async (event) => {
    event.preventDefault();
    if (await mutate('/training/requests', { ...requestForm, userId: Number(requestForm.userId) })) setRequestForm({ roleName: '', userId: auth.id, notes: '', overrideReason: '' });
  };
  const createSession = async (event) => {
    event.preventDefault();
    const { startsOn, startsTime, ...values } = sessionForm;
    if (await mutate('/training/sessions', { ...values, startsAt: combineDateTime(startsOn, startsTime) })) setSessionForm({ roleName: '', title: '', startsOn: '', startsTime: '', capacity: 1, isOpen: false, requestIds: [] });
  };

  return <section className="training-page">
    <div className="builder-toolbar">
      <div><h3>Training</h3><p>Request training, coordinate a date and manage qualifications in one place.</p></div>
      {cooldownUntil && cooldownUntil > new Date() ? <span className="training-cooldown">New request available from {dateTime(cooldownUntil)}</span> : null}
    </div>
    <div className="top-tabs training-tabs">
      {windows.mine ? <button className={tab === 'mine' ? 'tab active' : 'tab'} onClick={() => setTab('mine')}>My training</button> : null}
      {windows.queue ? <button className={tab === 'queue' ? 'tab active' : 'tab'} onClick={() => setTab('queue')}>Queue <span className="count-badge">{queue.length}</span></button> : null}
      {windows.sessions ? <button className={tab === 'sessions' ? 'tab active' : 'tab'} onClick={() => setTab('sessions')}>Sessions</button> : null}
      {windows.history ? <button className={tab === 'history' ? 'tab active' : 'tab'} onClick={() => setTab('history')}>History</button> : null}
      {windows.admin ? <button className={tab === 'admin' ? 'tab active' : 'tab'} onClick={() => setTab('admin')}>Drill Sergeants</button> : null}
    </div>
    {error ? <div className="field-error training-error">{error}</div> : null}

    {tab === 'mine' && windows.mine ? <div className="training-layout">
      <section className="card"><h4>Request training</h4>
        <form onSubmit={createRequest}>
          {data.access.trainer || data.access.admin ? <label>Player<select value={requestForm.userId} onChange={(e) => setRequestForm((v) => ({ ...v, userId: e.target.value }))}>{users.map((u) => <option key={u.id} value={u.id}>{u.username}</option>)}</select></label> : null}
          <label>Role<select required value={requestForm.roleName} onChange={(e) => setRequestForm((v) => ({ ...v, roleName: e.target.value }))}><option value="">Select a role</option>{trainingRoles.map((role) => <option key={role}>{role}</option>)}</select></label>
          <label>Notes<textarea value={requestForm.notes} onChange={(e) => setRequestForm((v) => ({ ...v, notes: e.target.value }))} placeholder="What would you like to learn or practise?" /></label>
          {data.access.admin ? <label>Cooldown override reason (if needed)<input value={requestForm.overrideReason} onChange={(e) => setRequestForm((v) => ({ ...v, overrideReason: e.target.value }))} /></label> : null}
          <button disabled={busy}>Submit request</button>
        </form>
      </section>
      <RequestList items={mine} onOpen={openDetail} selectedId={selectedId} />
    </div> : null}

    {tab === 'queue' && windows.queue ? <div className="training-layout">
      <RequestList items={queue} onOpen={openDetail} selectedId={selectedId} />
      <section className="card"><h4>New session</h4><form onSubmit={createSession}>
        <label>Role<select required value={sessionForm.roleName} onChange={(e) => setSessionForm((v) => ({ ...v, roleName: e.target.value }))}><option value="">Select</option>{(data.access.admin ? trainingRoles : data.access.roles || []).map((role) => <option key={role}>{role}</option>)}</select></label>
        <label>Title<input value={sessionForm.title} onChange={(e) => setSessionForm((v) => ({ ...v, title: e.target.value }))} placeholder="Filled automatically" /></label>
        <DateTimeFields value={sessionForm} onChange={setSessionForm} />
        <label>Capacity<input type="number" min="1" value={sessionForm.capacity} onChange={(e) => setSessionForm((v) => ({ ...v, capacity: Number(e.target.value) }))} /></label>
        <label className="checkbox-row"><input type="checkbox" checked={sessionForm.isOpen} onChange={(e) => setSessionForm((v) => ({ ...v, isOpen: e.target.checked }))} /> Open session that players can join</label>
        {!sessionForm.isOpen ? <fieldset><legend>Participants</legend>{queue.filter((r) => r.role_name === sessionForm.roleName).map((r) => <label className="checkbox-row" key={r.id}><input type="checkbox" checked={sessionForm.requestIds.includes(r.id)} onChange={(e) => setSessionForm((v) => ({ ...v, requestIds: e.target.checked ? [...v.requestIds, r.id] : v.requestIds.filter((id) => id !== r.id) }))} /> {r.username}</label>)}</fieldset> : null}
        <button disabled={busy}>Schedule session</button>
      </form></section>
    </div> : null}

    {tab === 'sessions' && windows.sessions ? <div className="training-grid">{data.sessions.map((session) => <SessionCard key={session.id} session={session} mine={mine} access={data.access} call={mutate} reload={load} onQualificationsChanged={onQualificationsChanged} />)}{!data.sessions.length ? <p>No sessions scheduled.</p> : null}</div> : null}
    {tab === 'history' && windows.history ? <RequestList items={completed} onOpen={openDetail} selectedId={selectedId} /> : null}
    {tab === 'admin' && windows.admin ? <AdminPanel users={users} roles={roles} settings={data.settings} drafts={adminDrafts} setDrafts={setAdminDrafts} mutate={mutate} /> : null}

    {detail ? <RequestDetail detail={detail} auth={auth} access={data.access} busy={busy} mutate={mutate} proposal={proposal} setProposal={setProposal} close={() => { setDetail(null); setSelectedId(null); }} /> : null}
  </section>;
}

function RequestList({ items, onOpen, selectedId }) {
  return <section className="card training-list"><h4>Requests</h4>{items.length ? items.map((item) => <button key={item.id} className={`training-request ${selectedId === item.id ? 'selected' : ''}`} onClick={() => onOpen(item.id)}><span><strong>{item.username}</strong><small>{item.role_name}</small></span><span><em className={`status-pill ${item.status}`}>{labels[item.status] || item.status}</em><small>{dateTime(item.created_at)}</small></span></button>) : <p>No requests.</p>}</section>;
}

function RequestDetail({ detail, auth, access, busy, mutate, proposal, setProposal, close }) {
  const r = detail.request;
  return <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}><section className="training-detail">
    <div className="builder-toolbar"><div><h3>{r.username} · {r.role_name}</h3><p>{labels[r.status]} · requested {dateTime(r.created_at)}</p></div><button className="secondary" onClick={close}>Close</button></div>
    <div className="training-detail-grid"><div><h4>Intake / survey</h4><dl>{Object.entries(r.survey || {}).map(([key, value]) => <div key={key}><dt>{key.replaceAll('_', ' ')}</dt><dd>{String(value)}</dd></div>)}</dl></div><div><h4>Request</h4><p>{r.notes || 'No notes.'}</p><p>Trainer: {r.claimedByName || 'Not claimed yet'}</p>
      {(access.admin || (access.roles || []).includes(r.role_name)) && ['requested','claimed','planning'].includes(r.status) ? <div className="button-row"><button disabled={busy} onClick={() => mutate(`/training/requests/${r.id}`, { action: 'claim' }, 'PUT')}>Claim</button><button className="secondary" disabled={busy} onClick={() => mutate(`/training/requests/${r.id}`, { action: 'release' }, 'PUT')}>Release</button></div> : null}
    </div></div>
    {!['completed','cancelled'].includes(r.status) ? <form onSubmit={(e) => { e.preventDefault(); const { startsOn, startsTime, ...values } = proposal; mutate(`/training/requests/${r.id}/proposals`, { ...values, startsAt: combineDateTime(startsOn, startsTime) }); }}><h4>Propose a training date</h4><DateTimeFields value={proposal} onChange={setProposal} /><input value={proposal.message} onChange={(e) => setProposal((v) => ({ ...v, message: e.target.value }))} placeholder="Message" /><button disabled={busy}>Send proposal</button></form> : null}
    <h4>Proposals</h4>{detail.proposals?.map((p) => <div className="training-proposal" key={p.id}><span>{dateTime(p.starts_at)} · {p.proposedByName} · {p.status}</span>{p.status === 'pending' && String(p.proposed_by) !== String(auth.id) ? <button disabled={busy} onClick={() => mutate(`/training/proposals/${p.id}/accept`, {})}>Accept and schedule</button> : null}</div>)}
    {String(r.user_id) === String(auth.id) && ['requested','claimed','planning'].includes(r.status) ? <button className="btn-danger" disabled={busy} onClick={() => mutate(`/training/requests/${r.id}`, { action: 'cancel', reason: 'Cancelled by player' }, 'PUT')}>Cancel request</button> : null}
    <h4>Activity</h4>{detail.history?.map((h) => <p key={h.id}>{dateTime(h.created_at)} · {h.actorName || 'System'} · {h.action}</p>)}
  </section></div>;
}

function SessionCard({ session, mine, access, call, onQualificationsChanged }) {
  const [full, setFull] = useState(null); const [notes, setNotes] = useState({});
  const load = async () => {
    try {
      const token = localStorage.getItem('token');
      const result = await apiFetch(`/training/sessions/${session.id}`, { headers: { Authorization: `Bearer ${token}` } });
      setFull(result.session);
    } catch { setFull(null); }
  };
  const matching = mine.find((r) => r.role_name === session.role_name && ['requested','claimed','planning'].includes(r.status));
  return <section className="card session-card"><div><span className="eyebrow">{session.is_open ? 'Open session' : 'Scheduled session'}</span><h4>{session.title}</h4><p>{dateTime(session.starts_at)} · {session.trainerName}</p><p>{session.role_name} · {session.participantCount}/{session.capacity} participants</p></div>
    {session.is_open && matching ? <button type="button" onClick={() => call(`/training/sessions/${session.id}/join`, { requestId: matching.id })}>Join session</button> : null}
    {(access.admin || String(session.trainer_id) === String(access.userId)) && !full ? <button type="button" className="secondary" onClick={load}>Assess participants</button> : null}
    {(access.admin || String(session.trainer_id) === String(access.userId)) && full ? full.participants.map((p) => { const requestId = p.requestId ?? p.request_id; return <div key={requestId}><strong>{p.username}</strong>{p.outcome !== 'pending' ? <span className="status-pill completed">{labels[p.outcome]}</span> : <><input value={notes[requestId] || ''} onChange={(e) => setNotes((v) => ({ ...v, [requestId]: e.target.value }))} placeholder="Assessment notes" /><div className="button-row">{['passed','not_yet','absent'].map((outcome) => <button type="button" key={outcome} onClick={async () => { const completed = await call(`/training/sessions/${session.id}/participants/${requestId}/complete`, { outcome, notes: notes[requestId] }); if (!completed) return; await load(); onQualificationsChanged?.(); }}>{labels[outcome]}</button>)}</div></>}</div>; }) : null}
  </section>;
}

function DateTimeFields({ value, onChange }) {
  return <div className="date-time-fields">
    <label>Date<input required type="text" inputMode="numeric" pattern="\d{4}-\d{2}-\d{2}" placeholder="YYYY-MM-DD" value={value.startsOn} onChange={(e) => onChange((current) => ({ ...current, startsOn: e.target.value }))} /></label>
    <label>Time<input required type="text" inputMode="numeric" pattern="(?:[01]\d|2[0-3]):[0-5]\d" placeholder="HH:MM" value={value.startsTime} onChange={(e) => onChange((current) => ({ ...current, startsTime: e.target.value }))} /></label>
  </div>;
}

function AdminPanel({ users, roles, drafts, setDrafts, mutate }) {
  const drillSergeants = users.filter((user) => Boolean(user.isDrillSergeant ?? user.is_drill_sergeant));
  return <section className="card"><h4>Drill Sergeants</h4>{!drillSergeants.length ? <p>First mark someone as a Drill Sergeant in the Player List.</p> : drillSergeants.map((user) => <details key={user.id}><summary>{user.username} <small>{(drafts[user.id] || []).length} training permissions</small></summary><div className="trainer-role-grid">{roles.map((role) => <label className="checkbox-row" key={role}><input type="checkbox" checked={(drafts[user.id] || []).includes(role)} onChange={(e) => setDrafts((all) => ({ ...all, [user.id]: e.target.checked ? [...(all[user.id] || []), role] : (all[user.id] || []).filter((r) => r !== role) }))} />{role}</label>)}</div><button onClick={() => mutate(`/training/admin/trainers/${user.id}`, { roles: drafts[user.id] || [] }, 'PUT')}>Save training permissions</button></details>)}</section>;
}
