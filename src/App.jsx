// App.jsx: central application component
// - Maintains top-level state (auth, templates, ops, users, UI state)
// - Provides most data-loading and mutation functions used across the child components
// - Keep heavy UI rendering in child components (OrbatOverview/OrbatScheduler/OrbatTemplate)
import { useEffect, useMemo, useRef, useState } from 'react';
import OrbatOverview from './OrbatOverview';
import OrbatScheduler from './OrbatScheduler';
import OrbatTemplate from './OrbatTemplate';
import Settings from './Settings';
import Ranks from './Ranks';
import Profile from './Profile';
import Campaigns from './Campaigns';
import apiFetch from './api';

const API = '/api';

// Template-builder canvas grid: one "unit" approximates a single slot row, so a section
// with N slots naturally occupies roughly (2 + N) units tall (2 units for the header).
const CANVAS_GRID_UNIT = 40;
const snapToCanvasGrid = (value) => Math.round(value / CANVAS_GRID_UNIT) * CANVAS_GRID_UNIT;

function App() {
  const [auth, setAuth] = useState(null);
  const [users, setUsers] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [ops, setOps] = useState([]);
  const [recurrences, setRecurrences] = useState([]);
  const [ranks, setRanks] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);
  const [schedulerLoadTemplateId, setSchedulerLoadTemplateId] = useState('');
  const [selectedOpId, setSelectedOpId] = useState(null);
  const [selectedRecurrenceId, setSelectedRecurrenceId] = useState(null);
  const [page, setPage] = useState('overview');
  const [settingsInitialSubpage, setSettingsInitialSubpage] = useState(null);
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');
  const [overviewMode] = useState('orbat');
  const [isNarrowViewport, setIsNarrowViewport] = useState(() => window.innerWidth <= 900);
  const builderCompact = false;
  const [builderFlowMode, setBuilderFlowMode] = useState(() => localStorage.getItem('builderFlowMode') === 'true');
  const [canvasLayout, setCanvasLayout] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('overviewOrbatLayout') || '{}');
    } catch (error) {
      return {};
    }
  });
  const [canvasDrag, setCanvasDrag] = useState(null);
  const [dragSnapPreview, setDragSnapPreview] = useState(null);
  const [nodeHeights, setNodeHeights] = useState({});
  const [draggedSlot, setDraggedSlot] = useState(null);
  const slotSaveTimersRef = useRef({});
  const pendingSlotUpdatesRef = useRef({});
  const opSlotSaveTimersRef = useRef({});
  const pendingOpSlotUpdatesRef = useRef({});
  const [flowEdges, setFlowEdges] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('builderFlowEdges') || '{}');
    } catch (error) {
      return {};
    }
  });
  const [flowLinkSource, setFlowLinkSource] = useState(null);
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [showLoginPanel, setShowLoginPanel] = useState(false);
  const [showSignup, setShowSignup] = useState(false);
  // change password form/modal moved to Profile component
  const [signupForm, setSignupForm] = useState({
    username: '',
    password: '',
    rank: 'RCT',
    status: 'Active',
    // survey/profile fields
    age: '',
    availability_sunday: 'Yes',
    availability_thursday: 'Yes',
    ok_multiple_modlists: 'Yes',
    ok_follow_orders: 'No',
    prev_milsim: 'No',
    arma_experience: 'None',
    ptt_ok: 'Yes',
    found_via: 'Discord'
  });
  const [signupErrors, setSignupErrors] = useState({});
  useEffect(() => {
    const beforeUnload = (e) => {
      try { console.warn('[App] beforeunload fired', e); } catch (err) { /* ignore */ }
    };
    const onUnload = (e) => { try { console.warn('[App] unload', e); } catch (err) {} };
    const onVisibility = () => { try { console.warn('[App] visibilitychange', document.visibilityState); } catch (err) {} };
    window.addEventListener('beforeunload', beforeUnload);
    window.addEventListener('unload', onUnload);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      window.removeEventListener('unload', onUnload);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);
  const [userForm, setUserForm] = useState({ username: '', password: '', role: 'member', rank: '', status: 'Active' });
  const [opForm, setOpForm] = useState({ name: '', templateId: null, date: '', time: '', serverName: '', tsAddress: '', recurrence: 'none', weeklyDays: [], monthlyDay: '', campaignId: null });
  const [defaultOpSettings, setDefaultOpSettings] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('defaultOpSettings') || '{}');
    } catch (e) {
      return {};
    }
  });
  const [creatingDefaultOp, setCreatingDefaultOp] = useState(false);
  const changePassword = async (currentPassword, newPassword) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API}/users/me/password`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ currentPassword, newPassword })
      });

      const contentType = res.headers.get('content-type') || '';
      const data = contentType.includes('application/json')
          ? await res.json()
          : { error: await res.text() };

      if (res.ok) {
        alert('Password changed');
        return true;
      }

      alert(data.error || 'Could not change password');
      return false;
    } catch (error) {
      alert('Could not change password');
      return false;
    }
  };

  const uploadCustomMarker = async (file) => {
    const token = localStorage.getItem('token');
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${API}/upload/custom-marker`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload failed');
    return data.url;
  };

  const uploadAvatar = async (file) => {
    const token = localStorage.getItem('token');
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${API}/upload/avatar`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload failed');
    return data.url;
  };

  const updateMyProfile = async (patch) => {
    const token = localStorage.getItem('token');
    const res = await fetch(`${API}/users/me`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(patch)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not update profile');
    // update local users list
    setUsers((prev) => prev.map((u) => (u.id === data.user.id ? data.user : u)));
    return data.user;
  };
  


  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('overviewMode', overviewMode);
  }, [overviewMode]);

  useEffect(() => {
    const handleResize = () => setIsNarrowViewport(window.innerWidth <= 900);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    localStorage.setItem('builderFlowMode', String(builderFlowMode));
  }, [builderFlowMode]);

  useEffect(() => {
    try {
      localStorage.setItem('defaultOpSettings', JSON.stringify(defaultOpSettings));
    } catch (e) {}
  }, [defaultOpSettings]);

  useEffect(() => {
    localStorage.setItem('overviewOrbatLayout', JSON.stringify(canvasLayout));
  }, [canvasLayout]);

  useEffect(() => {
    localStorage.setItem('builderFlowEdges', JSON.stringify(flowEdges));
  }, [flowEdges]);

  useEffect(() => () => {
    Object.values(slotSaveTimersRef.current).forEach((timerId) => clearTimeout(timerId));
    Object.values(opSlotSaveTimersRef.current).forEach((timerId) => clearTimeout(timerId));
  }, []);

  const toggleTheme = () => setTheme((current) => (current === 'dark' ? 'light' : 'dark'));

  // weekDayLabels
  const weekDayLabels = [
    { label: 'Mon', value: 1 },
    { label: 'Tue', value: 2 },
    { label: 'Wed', value: 3 },
    { label: 'Thu', value: 4 },
    { label: 'Fri', value: 5 },
    { label: 'Sat', value: 6 },
    { label: 'Sun', value: 0 },
  ];

  const toggleWeeklyDay = (day) => {
    setOpForm((prev) => {
      const weeklyDays = prev.weeklyDays.includes(day)
        ? prev.weeklyDays.filter((d) => d !== day)
        : [...prev.weeklyDays, day];
      return { ...prev, weeklyDays };
    });
  };

  const applyLoadedData = (data, nextAuth = null) => {
    const templateList = (data.templates || []).map((template) => ({
      ...template,
      sections: template.sections || []
    }));
    setUsers(data.users || []);
    setTemplates(templateList);
    setOps(data.ops || []);
    console.debug('[applyLoadedData] loaded ops count', (data.ops || []).length);
    setRecurrences(data.recurrences || []);
    setCampaigns(data.campaigns || []);
    setCustomRoles(data.customRoles || []);
    setAuth(nextAuth);
    setSelectedTemplateId(templateList?.[0]?.id || null);
    setSelectedOpId(null);
    setOpForm((prev) => ({ ...prev, templateId: templateList?.[0]?.id || null, campaignId: defaultOpSettings.campaignId || (data.campaigns && data.campaigns[0] ? data.campaigns[0].id : null) }));
    setPage('overview');
  };

  useEffect(() => {
    try {
      console.debug('[App] ops changed', ops ? ops.length : 0, (ops || []).map((o) => o.id));
    } catch (err) {
      console.warn('[App] ops changed (log failure)', err);
    }
  }, [ops]);

  const loadCampaigns = async () => {
    try {
      const data = await apiFetch('/campaigns');
      if (data && data.campaigns) setCampaigns(data.campaigns);
    } catch (e) {
      console.error('loadCampaigns error', e);
      alert('Could not load campaigns: ' + (e.message || e));
    }
  };

  useEffect(() => { loadCampaigns(); }, []);

  const loadPrivateData = async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      const data = await apiFetch('/data', { headers: { Authorization: `Bearer ${token}` } });
      applyLoadedData(data, data.user || null);
    } catch (e) {
      console.error('loadPrivateData error', e);
      alert('Could not load private data: ' + (e.message || e));
    }
  };

  const loadPublicData = async () => {
    try {
      const data = await apiFetch('/public-data');
      applyLoadedData(data, null);
    } catch (e) {
      console.error('loadPublicData error', e);
      alert('Could not load public data: ' + (e.message || e));
    }
  };

  const loadRanks = async () => {
    try {
      const data = await apiFetch('/ranks');
      setRanks(data.ranks || []);
    } catch (e) {
      console.error('loadRanks error', e);
      alert('Could not load ranks: ' + (e.message || e));
    }
  };

  const goToOverview = () => setPage('overview');
  const goToScheduler = () => setPage('scheduler');
  const goToBuilder = () => setPage('builder');
  const goToRoles = () => { setSettingsInitialSubpage('roles'); setPage('settings'); };
  const goToPlayers = () => setPage('players');
  const goToRanks = () => { setSettingsInitialSubpage('ranks'); setPage('settings'); };
  const goToDashboard = () => setPage('overview');
  const goToSettings = () => setPage('settings');
  const goToCampaigns = () => setPage('campaigns');
  const showOpOnDashboard = (opId) => {
    setSelectedOpId(opId);
    setPage('overview');
  };
  const showOpInScheduler = (opId, recurrenceId = null) => {
    setSelectedOpId(opId);
    setSelectedRecurrenceId(recurrenceId);
    setPage('op-detail');
  };
  const goToSchedulerList = () => {
    setSelectedOpId(null);
    setSelectedRecurrenceId(null);
    setPage('scheduler');
  };

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      loadPrivateData();
    } else {
      loadPublicData();
    }
    loadRanks();
  }, []);

  useEffect(() => {
    if (templates.length > 0) {
      setOpForm((prev) => ({
        ...prev,
        templateId: prev.templateId || defaultOpSettings.templateId || templates?.[0]?.id || null,
        time: prev.time || defaultOpSettings.time || ''
      }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templates]);

  const login = async (e) => {
    e.preventDefault();
    try {
      const data = await apiFetch('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginForm)
      });
      if (data && data.token) {
        localStorage.setItem('token', data.token);
        setLoginForm({ username: '', password: '' });
        setShowLoginPanel(false);
        loadPrivateData();
      } else {
        alert('Login failed: missing token');
      }
    } catch (err) {
      alert(err.message || 'Login failed');
    }
  };

  // change-password handled in Profile component modal
  const [changePasswordForm, setChangePasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  const signup = async (e) => {
    e.preventDefault();
    const ageVal = Number(signupForm.age);
    const minAge = Number(defaultOpSettings.minSignupAge) || 17;
    const errors = {};
    if (!Number.isInteger(ageVal) || ageVal <= minAge - 1) {
      errors.age = `You must be older than ${minAge - 1}.`;
    }
    if (ageVal > 120) {
      errors.age = 'Enter a realistic age (max 120).';
    }
    if (signupForm.ok_multiple_modlists !== 'Yes') {
      errors.ok_multiple_modlists = 'You must agree to install required modlists.';
    }
    if (signupForm.ok_follow_orders !== 'No') {
      errors.ok_follow_orders = 'You must be willing to follow mission orders to join.';
    }
    if (!signupForm.username) errors.username = 'Please provide a username.';
    if (!signupForm.password || signupForm.password.length < 6) errors.password = 'Password must be at least 6 characters.';
    if (Object.keys(errors).length > 0) {
      setSignupErrors(errors);
      return;
    }
    const payload = {
      username: signupForm.username,
      password: signupForm.password,
      rank: signupForm.rank,
      status: signupForm.status,
      profile: {
        age: ageVal,
        availability_sunday: signupForm.availability_sunday,
        availability_thursday: signupForm.availability_thursday,
        ok_multiple_modlists: signupForm.ok_multiple_modlists,
        ok_follow_orders: signupForm.ok_follow_orders,
        prev_milsim: signupForm.prev_milsim,
        arma_experience: signupForm.arma_experience,
        ptt_ok: signupForm.ptt_ok,
        found_via: signupForm.found_via
      }
    };

    try {
      const data = await apiFetch('/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (data && data.token) {
        localStorage.setItem('token', data.token);
        setSignupForm({ username: '', password: '', rank: '', status: 'Active', role: 'member' });
        setShowSignup(false);
        loadPrivateData();
      } else {
        alert('Signup failed: missing token');
      }
    } catch (err) {
      alert(err.message || 'Signup failed');
    }
  };

  const createTemplate = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem('token');
    const name = prompt('Template name');
    if (!name) return;
    const tempId = `tmp-tpl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const tempTemplate = { id: tempId, name, sections: [], _pendingCreate: true };
    setTemplates((prev) => [...prev, tempTemplate]);
    setSelectedTemplateId(tempId);
    setOpForm((prev) => ({ ...prev, templateId: tempId }));

    try {
      const res = await fetch(`${API}/templates`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ name })
      });
      const data = await res.json();
      if (data.template) {
        setTemplates((prev) => prev.map((t) => (t.id === tempId ? data.template : t)));
        setSelectedTemplateId(data.template.id);
        setOpForm((prev) => ({ ...prev, templateId: data.template.id }));
      } else {
        throw new Error(data.error || 'Could not create template');
      }
    } catch (err) {
      alert(err.message || 'Could not create template');
      setTemplates((prev) => prev.filter((t) => t.id !== tempId));
      setSelectedTemplateId((prev) => (templates?.[0]?.id || null));
    }
  };

  const renameTemplate = async () => {
    if (!selectedTemplateId) return;
    const current = templates.find((t) => t.id === selectedTemplateId);
    const name = prompt('New template name', current?.name || '');
    if (!name || name === current?.name) return;
    const prevName = current?.name;
    // optimistic
    setTemplates((prev) => prev.map((t) => (t.id === selectedTemplateId ? { ...t, name } : t)));
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API}/templates/${selectedTemplateId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ name })
      });
      const data = await res.json();
      if (data.template) {
        setTemplates((prev) => prev.map((t) => (t.id === data.template.id ? data.template : t)));
      } else {
        throw new Error(data.error || 'Could not rename template');
      }
    } catch (err) {
      alert(err.message || 'Could not rename template');
      setTemplates((prev) => prev.map((t) => (t.id === selectedTemplateId ? { ...t, name: prevName } : t)));
    }
  };

  const duplicateTemplate = async () => {
    if (!selectedTemplateId) return;
    const current = templates.find((t) => t.id === selectedTemplateId);
    const defaultName = `Copy of ${current?.name || ''}`;
    const name = prompt('Name for duplicated template', defaultName);
    if (!name) return;
    const tempId = `tmp-tpl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const tempTemplate = { id: tempId, name, sections: [], _pendingCreate: true };
    setTemplates((prev) => [...prev, tempTemplate]);
    setSelectedTemplateId(tempId);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API}/templates/${selectedTemplateId}/duplicate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ name })
      });
      const data = await res.json();
      if (data.template) {
        setTemplates((prev) => prev.map((t) => (t.id === tempId ? data.template : t)));
        setSelectedTemplateId(data.template.id);
      } else {
        throw new Error(data.error || 'Could not duplicate template');
      }
    } catch (err) {
      alert(err.message || 'Could not duplicate template');
      setTemplates((prev) => prev.filter((t) => t.id !== tempId));
      setSelectedTemplateId((prev) => (templates?.[0]?.id || null));
    }
  };

  

  const createAndOpenDefaultOp = async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      alert('Login required to create operation');
      return;
    }
    if (creatingDefaultOp) return;
    setCreatingDefaultOp(true);
    try {
      const tplId = defaultOpSettings.templateId || templates?.[0]?.id || null;
      const date = (() => {
        const d = new Date();
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
      })();
      const payload = {
        name: `Nieuwe operatie ${Date.now()}`,
        templateId: tplId,
        date,
        time: defaultOpSettings.time || '',
        serverName: defaultOpSettings.serverName || '',
        tsAddress: defaultOpSettings.tsAddress || '',
        campaignId: defaultOpSettings.campaignId || null,
        recurrence: defaultOpSettings.recurrence || 'none',
        weeklyDays: [],
        monthlyDay: null
      };

      const res = await fetch(`${API}/ops`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.op) {
        setOps((prev) => [...prev, data.op]);
        if (data.recurrence) setRecurrences((prev) => [...prev, data.recurrence]);
        // open the newly created op in the scheduler/detail view
        showOpInScheduler(data.op.id, data.recurrence ? data.recurrence.id : null);
      } else {
        throw new Error(data.error || 'Could not create operation');
      }
    } catch (err) {
      alert(err.message || 'Could not create operation');
    } finally {
      setCreatingDefaultOp(false);
    }
  };

  const deleteOp = async (opId) => {
    if (!window.confirm('Are you sure you want to delete this operation?')) return;
    const token = localStorage.getItem('token');
    const res = await fetch(`${API}/ops/${opId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    if (res.ok) {
      setOps((prev) => prev.filter((op) => op.id !== opId));
      if (selectedOpId === opId) {
        setSelectedOpId(null);
        setPage('overview');
      }
    } else {
      alert('Could not delete operation');
    }
  };

  const deleteRecurrence = async (recurrenceId) => {
    if (!window.confirm('Are you sure you want to delete this recurring operation?')) return;
    const token = localStorage.getItem('token');
    const res = await fetch(`${API}/recurrences/${recurrenceId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    if (res.ok) {
      setRecurrences((prev) => prev.filter((rec) => rec.id !== recurrenceId));
    } else {
      alert('Could not delete recurring operation');
    }
  };

  const updateRecurrence = async (recurrenceId, updates) => {
    const token = localStorage.getItem('token');
    const res = await fetch(`${API}/recurrences/${recurrenceId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(updates)
    });
    const data = await res.json();
    if (data.recurrence) {
      setRecurrences((prev) => prev.map((rec) => (rec.id === data.recurrence.id ? data.recurrence : rec)));
    } else {
      alert(data.error || 'Could not update recurring settings');
    }
  };

  const toggleRecurrenceWeeklyDay = (recurrence, day) => {
    const weeklyDays = (recurrence.weeklyDays || []).includes(day)
      ? recurrence.weeklyDays.filter((d) => d !== day)
      : [...(recurrence.weeklyDays || []), day];
    updateRecurrence(recurrence.id, { weeklyDays });
  };

  const joinOpSlot = async (opId, slotId, userId = null) => {
    if (!auth && !userId) return;
    console.debug('[joinOpSlot] start', { opId, slotId, userId: userId || auth?.id });
    const prevOps = ops;
    // optimistic local update: assign slot
    setOps((prev) => prev.map((op) => {
      if (op.id !== opId) return op;
      return {
        ...op,
        sections: (op.sections || []).map((section) => ({
          ...section,
          slots: section.slots.map((slot) => (slot.id === slotId ? { ...slot, assignedUserId: userId || auth.id, _pendingUpdate: true } : slot))
        }))
      };
    }));

    try {
      const token = localStorage.getItem('token');
      const body = userId && auth?.role === 'admin' ? { slotId, userId } : { slotId };
      console.debug('[joinOpSlot] sending request', { url: `${API}/ops/${opId}/join`, body });
      const res = await fetch(`${API}/ops/${opId}/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      console.debug('[joinOpSlot] response', { status: res.status, data });
      if (data.op) {
        setOps((prev) => prev.map((op) => (op.id === data.op.id ? data.op : op)));
      } else {
        throw new Error(data.error || 'Could not update slot');
      }
    } catch (err) {
      console.error('[joinOpSlot] error', err);
      alert(err.message || 'Could not update slot');
      setOps(prevOps);
    }
  };

  const signOffOpSlot = async (opId, slotId) => {
    if (!auth) return;
    console.debug('[signOffOpSlot] start', { opId, slotId, userId: auth?.id });
    const prevOps = ops;
    // optimistic local update: clear assignment
    setOps((prev) => prev.map((op) => {
      if (op.id !== opId) return op;
      return {
        ...op,
        sections: (op.sections || []).map((section) => ({
          ...section,
          slots: section.slots.map((slot) => (slot.id === slotId ? { ...slot, assignedUserId: null, _pendingUpdate: true } : slot))
        }))
      };
    }));

    try {
      const token = localStorage.getItem('token');
      console.debug('[signOffOpSlot] sending request', { url: `${API}/ops/${opId}/signoff`, body: { slotId } });
      const res = await fetch(`${API}/ops/${opId}/signoff`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ slotId })
      });
      const data = await res.json();
      console.debug('[signOffOpSlot] response', { status: res.status, data });
      if (data.op) {
        setOps((prev) => prev.map((op) => (op.id === data.op.id ? data.op : op)));
      } else {
        throw new Error(data.error || 'Could not sign off');
      }
    } catch (err) {
      console.error('[signOffOpSlot] error', err);
      alert(err.message || 'Could not sign off');
      setOps(prevOps);
    }
  };

  const updateOpSlot = async (opId, slotId, updates) => {
    // optimistic local update
    const prevOps = ops;
    setOps((prev) => prev.map((op) => {
      if (op.id !== opId) return op;
      return {
        ...op,
        sections: (op.sections || []).map((section) => ({
          ...section,
          slots: section.slots.map((slot) => (slot.id === slotId ? { ...slot, ...updates, _pendingUpdate: true } : slot))
        }))
      };
    }));

    // persist
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API}/ops/${opId}/slots/${slotId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(updates)
      });
      const data = await res.json();
      if (data.op) {
        setOps((prev) => prev.map((op) => (op.id === data.op.id ? data.op : op)));
      } else {
        throw new Error(data.error || 'Could not update operation slot');
      }
    } catch (err) {
      alert(err.message || 'Could not update operation slot');
      setOps(prevOps);
    }
  };

  const applyOpSlotUpdatesLocally = (opId, slotId, updates) => {
    setOps((prev) => prev.map((op) => {
      if (op.id !== opId) return op;
      return {
        ...op,
        sections: (op.sections || []).map((section) => ({
          ...section,
          slots: (section.slots || []).map((slot) => (slot.id === slotId ? { ...slot, ...updates } : slot))
        }))
      };
    }));
  };

  const flushOpSlotUpdate = (opId, slotId) => {
    const key = `${opId}:${slotId}`;
    const pending = pendingOpSlotUpdatesRef.current[key];
    if (!pending) return;

    if (opSlotSaveTimersRef.current[key]) {
      clearTimeout(opSlotSaveTimersRef.current[key]);
      delete opSlotSaveTimersRef.current[key];
    }

    delete pendingOpSlotUpdatesRef.current[key];
    updateOpSlot(opId, slotId, pending);
  };

  // Debounced variant used for text inputs (name/notes/role) so keystrokes update
  // local state immediately without firing a network request per character.
  const updateOpSlotDebounced = (opId, slotId, updates) => {
    const key = `${opId}:${slotId}`;

    applyOpSlotUpdatesLocally(opId, slotId, updates);
    pendingOpSlotUpdatesRef.current[key] = {
      ...(pendingOpSlotUpdatesRef.current[key] || {}),
      ...updates
    };

    if (opSlotSaveTimersRef.current[key]) clearTimeout(opSlotSaveTimersRef.current[key]);
    opSlotSaveTimersRef.current[key] = setTimeout(() => {
      flushOpSlotUpdate(opId, slotId);
    }, 400);
  };

  const updateOpMeta = async (opId, updates) => {
    const token = localStorage.getItem('token');
    const res = await fetch(`${API}/ops/${opId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(updates)
    });
    const data = await res.json();
    if (data.op) {
      setOps((prev) => prev.map((op) => (op.id === data.op.id ? data.op : op)));
    } else {
      alert(data.error || 'Could not update operation');
    }
  };

  const updateOpSectionMeta = async (opId, sectionId, updates) => {
    const token = localStorage.getItem('token');
    const res = await fetch(`${API}/ops/${opId}/sections/${sectionId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(updates)
    });
    const data = await res.json();
    if (data.op) {
      setOps((prev) => prev.map((op) => (op.id === data.op.id ? data.op : op)));
    } else {
      alert(data.error || 'Could not update section');
    }
  };

  const uploadFile = async (file, onProgress) => {
    const token = localStorage.getItem('token');
    // If a progress callback is supplied, use XHR to report progress
    if (typeof onProgress === 'function') {
      return new Promise((resolve) => {
        try {
          const xhr = new XMLHttpRequest();
          xhr.open('POST', `${API}/upload`);
          xhr.timeout = 30000; // 30s
          xhr.setRequestHeader('Authorization', `Bearer ${token}`);
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
          };
          xhr.onload = () => {
            let data = null;
            try { data = xhr.responseText ? JSON.parse(xhr.responseText) : null; } catch (e) { /* ignore parse error */ }
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve(data?.url || null);
            } else {
              alert(data?.error || `Upload failed (HTTP ${xhr.status})`);
              resolve(null);
            }
          };
          xhr.onerror = () => { alert('Upload failed: network error'); resolve(null); };
          xhr.ontimeout = () => { alert('Upload timed out (30s) — please try again'); resolve(null); };
          const fd = new FormData(); fd.append('file', file);
          xhr.send(fd);
        } catch (e) {
          alert('Upload failed: ' + (e.message || e));
          resolve(null);
        }
      });
    }

    // Fallback: use fetch with abort timeout
    const formData = new FormData();
    formData.append('file', file);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout
    try {
      const res = await fetch(`${API}/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
        signal: controller.signal
      });
      clearTimeout(timeout);
      let data;
      try { data = await res.json(); } catch (e) { data = null; }
      if (!res.ok) {
        alert(data?.error || `Upload failed (HTTP ${res.status})`);
        return null;
      }
      return data?.url || null;
    } catch (e) {
      clearTimeout(timeout);
      if (e.name === 'AbortError') {
        alert('Upload timed out (30s) — please try a smaller file or check your connection');
      } else {
        alert('Upload failed: ' + (e.message || e));
      }
      return null;
    }
  };

  const exportBackup = async () => {
    const token = localStorage.getItem('token');
    if (!token) { alert('Login required'); return; }
    try {
      const res = await fetch(`${API}/backup`, { headers: { Authorization: `Bearer ${token}` } });
      const responseText = await res.text();
      let data;
      try {
        data = responseText ? JSON.parse(responseText) : null;
      } catch (parseErr) {
        throw new Error(`Server returned invalid JSON (${res.status}): ${responseText.slice(0, 200) || 'empty response'}`);
      }
      if (!res.ok) throw new Error(data?.error || `Could not export backup (HTTP ${res.status})`);
      if (!data || typeof data !== 'object') throw new Error('Backup response was empty');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tfo-backup-${new Date().toISOString().replace(/[:]/g, '-')}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('Export failed: ' + (e.message || e));
    }
  };

  const clearDb = async () => {
    const token = localStorage.getItem('token');
    if (!token) { alert('Login required'); return false; }
    const ans = prompt("Type DELETE to confirm wiping ALL TABLES in the configured database on the server (irreversible):");
    if (ans !== 'DELETE') { alert('Aborted'); return false; }
    try {
      const res = await fetch(`${API}/admin/clear-db`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
      let data = null;
      try { data = await res.json(); } catch (e) { data = null; }
      if (!res.ok) throw new Error(data?.error || data?.details || `HTTP ${res.status}`);
      alert('Database cleared successfully on the server.');
      return true;
    } catch (e) {
      alert('Clear DB failed: ' + (e.message || e));
      return false;
    }
  };

  const importBackup = async (backupPayload, selectedSections = [], restoreUploads = false) => {
    const token = localStorage.getItem('token');
    if (!token) { alert('Login required'); return; }
    try {
      let payload;
      if (backupPayload instanceof File) {
        const text = await backupPayload.text();
        payload = JSON.parse(text);
      } else {
        payload = backupPayload;
      }
      if (!payload || typeof payload !== 'object' || !payload.data) {
        throw new Error('Invalid backup payload');
      }

      const body = {
        data: payload.data,
        selectedSections: Array.isArray(selectedSections) ? selectedSections : [],
        restoreUploads: Boolean(restoreUploads)
      };
      if (restoreUploads) {
        body.uploads = Array.isArray(payload.uploads) ? payload.uploads : [];
      }

      const res = await fetch(`${API}/backup/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Import failed');
      alert('Import successful');
      loadPrivateData();
    } catch (e) {
      alert('Import failed: ' + (e.message || e));
    }
  };

  const createCampaign = async (payload) => {
    const token = localStorage.getItem('token');
    if (!token) return { success: false, error: 'Login required' };
    try {
      const res = await fetch(`${API}/campaigns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload)
      });
      const text = await res.text();
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch (err) {
        data = null;
      }

      if (res.ok && data && data.campaign) {
        setCampaigns((prev) => [...prev, data.campaign]);
        return { success: true, campaign: data.campaign };
      }

      const serverMessage = data && data.error ? data.error : (text || `Server responded ${res.status}`);
      return { success: false, error: serverMessage };
    } catch (e) {
      return { success: false, error: e.message || 'Could not create campaign' };
    }
  };

  const updateCampaign = async (id, updates) => {
    const token = localStorage.getItem('token');
    if (!token) return { success: false, error: 'Login required' };
    try {
      const res = await fetch(`${API}/campaigns/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(updates)
      });
      const text = await res.text();
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch (err) {
        data = null;
      }

      if (res.ok && data && data.campaign) {
        setCampaigns((prev) => prev.map((c) => (c.id === data.campaign.id ? data.campaign : c)));
        return { success: true, campaign: data.campaign };
      }
      const serverMessage = data && data.error ? data.error : (text || `Server responded ${res.status}`);
      return { success: false, error: serverMessage };
    } catch (e) {
      return { success: false, error: e.message || 'Could not update campaign' };
    }
  };

  const deleteCampaign = async (id) => {
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${API}/campaigns/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setCampaigns((prev) => prev.filter((c) => c.id !== id));
    } catch (e) { alert('Could not delete campaign'); }
  };

  const handleModlistDrop = async (opId, type, event) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    const url = await uploadFile(file);
    if (!url) return;
    if (type === 'player') updateOpMeta(opId, { modlistPlayer: url });
    else if (type === 'server') updateOpMeta(opId, { modlistServer: url });
  };

  const handleModlistDragOver = (event) => { event.preventDefault(); };

  const loadTemplateIntoOp = async (opId, templateId = null) => {
    const selectedTemplateName = templateId ? getTemplateName(templateId) : 'current template';
    if (!window.confirm(`Load ${selectedTemplateName} into this operation? Existing matching assignments will be kept, but manual slot edits will be replaced.`)) {
      return;
    }

    const token = localStorage.getItem('token');
    const res = await fetch(`${API}/ops/${opId}/load-template`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(templateId ? { templateId } : {})
    });
    const data = await res.json();
    if (data.op) {
      setOps((prev) => prev.map((op) => (op.id === data.op.id ? data.op : op)));
    } else {
      alert(data.error || 'Could not reload template into operation');
    }
  };

  const addSection = async (templateId) => {
    const title = prompt('Section title');
    if (!title) return;
    const tempId = `tmp-sec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const tempSection = { id: tempId, title, slots: [], _pendingCreate: true };
    setTemplates((prev) => prev.map((template) => {
      if (template.id !== templateId) return template;
      return { ...template, sections: [...template.sections, tempSection] };
    }));

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API}/templates/${templateId}/sections`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ title })
      });
      const data = await res.json();
      if (res.status === 401) {
        throw new Error(data.error || 'Login expired, please log in again');
      }
      if (data.section) {
        setTemplates((prev) => prev.map((template) => {
          if (template.id !== templateId) return template;
          return { ...template, sections: template.sections.map((s) => (s.id === tempId ? data.section : s)) };
        }));
      } else {
        throw new Error(data.error || 'Could not add section');
      }
    } catch (err) {
      alert(err.message || 'Could not add section');
      setTemplates((prev) => prev.map((template) => {
        if (template.id !== templateId) return template;
        return { ...template, sections: template.sections.filter((s) => s.id !== tempId) };
      }));
      if (err.message?.toLowerCase().includes('log in again')) logout();
    }
  };

  const addSectionQuick = async (templateId, currentSectionCount) => {
    const title = `Section ${currentSectionCount + 1}`;
    const tempId = `tmp-sec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const tempSection = { id: tempId, title, slots: [], _pendingCreate: true };
    setTemplates((prev) => prev.map((template) => {
      if (template.id !== templateId) return template;
      return { ...template, sections: [...template.sections, tempSection] };
    }));

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API}/templates/${templateId}/sections`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ title })
      });
      const data = await res.json();
      if (data.section) {
        setTemplates((prev) => prev.map((template) => {
          if (template.id !== templateId) return template;
          return { ...template, sections: template.sections.map((s) => (s.id === tempId ? data.section : s)) };
        }));
      } else if (res.status === 401) {
        throw new Error(data.error || 'Login expired, please log in again');
      } else {
        throw new Error(data.error || 'Could not add section');
      }
    } catch (err) {
      alert(err.message || 'Could not add section');
      setTemplates((prev) => prev.map((template) => {
        if (template.id !== templateId) return template;
        return { ...template, sections: template.sections.filter((s) => s.id !== tempId) };
      }));
      if (err.message?.toLowerCase().includes('log in again')) {
        logout();
      }
    }
  };

  const renameSection = async (templateId, sectionId, currentTitle) => {
    const title = prompt('Section title', currentTitle);
    if (!title || title === currentTitle) return;
    // optimistic local update
    setTemplates((prev) => prev.map((template) => {
      if (template.id !== templateId) return template;
      return { ...template, sections: template.sections.map((section) => (section.id === sectionId ? { ...section, title } : section)) };
    }));
    setOps((prev) => prev.map((op) => {
      if (Number(op.templateId) !== Number(templateId)) return op;
      return { ...op, sections: (op.sections || []).map((section) => (section.id === sectionId ? { ...section, title } : section)) };
    }));
    setRecurrences((prev) => prev.map((recurrence) => {
      if (Number(recurrence.templateId) !== Number(templateId)) return recurrence;
      return { ...recurrence, sections: (recurrence.sections || []).map((section) => (section.id === sectionId ? { ...section, title } : section)) };
    }));

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API}/templates/${templateId}/sections/${sectionId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ title })
      });
      const data = await res.json();
      if (data.section) {
        setTemplates((prev) => prev.map((template) => {
          if (template.id !== templateId) return template;
          return {
            ...template,
            sections: template.sections.map((section) => (section.id === data.section.id ? data.section : section))
          };
        }));
      } else {
        throw new Error(data.error || 'Could not rename section');
      }
    } catch (err) {
      alert(err.message || 'Could not rename section');
      // revert by reloading authoritative data
      loadPrivateData();
    }
  };

  const updateSectionMeta = async (templateId, sectionId, updates) => {
    const token = localStorage.getItem('token');
    const res = await fetch(`${API}/templates/${templateId}/sections/${sectionId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(updates)
    });
    const data = await res.json();
    if (data.section) {
      setTemplates((prev) => prev.map((template) => {
        if (template.id !== templateId) return template;
        return {
          ...template,
          sections: template.sections.map((section) => (section.id === data.section.id ? data.section : section))
        };
      }));
    } else {
      alert(data.error || 'Could not update section');
    }
  };

  const updateSectionTitleLocal = (templateId, sectionId, title) => {
    setTemplates((prev) => prev.map((template) => {
      if (template.id !== templateId) return template;
      return {
        ...template,
        sections: template.sections.map((section) => (section.id === sectionId ? { ...section, title } : section))
      };
    }));
  };

  const updateOpSectionTitleLocal = (opId, sectionId, title) => {
    setOps((prev) => prev.map((op) => {
      if (op.id !== opId) return op;
      return {
        ...op,
        sections: (op.sections || []).map((section) => (section.id === sectionId ? { ...section, title } : section))
      };
    }));
  };

  const deleteSection = async (templateId, sectionId) => {
    if (!window.confirm('Are you sure you want to delete this section?')) return;
    // If sectionId is a temporary id (client-only), just remove locally and return
    if (Number.isNaN(Number(sectionId))) {
      setTemplates((prev) => prev.map((template) => {
        if (template.id !== templateId) return template;
        return { ...template, sections: template.sections.filter((section) => section.id !== sectionId) };
      }));
      return;
    }

    // optimistic: remove locally first
    const prevTemplates = templates;
    setTemplates((prev) => prev.map((template) => {
      if (template.id !== templateId) return template;
      return { ...template, sections: template.sections.filter((section) => section.id !== sectionId) };
    }));

    try {
      const token = localStorage.getItem('token');
      console.debug('Deleting section', { templateId, sectionId });
      const res = await fetch(`${API}/templates/${templateId}/sections/${sectionId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (!res.ok) {
        let msg = `Could not delete section (status ${res.status})`;
        try {
          const text = await res.text();
          console.error('Delete section failed', res.status, text);
          // try parse json
          const data = JSON.parse(text || '{}');
          if (res.status === 401) {
            msg = data.error || 'Login expired, please log in again';
            throw new Error(msg);
          }
          msg = data.error || msg;
        } catch (e) {
          console.error('Error reading delete section response', e);
        }
        throw new Error(msg);
      }
      console.debug('Delete section response ok', res.status);
    } catch (err) {
      alert(err.message || 'Could not delete section');
      // revert
      setTemplates(prevTemplates);
      if (err.message?.toLowerCase().includes('log in again')) logout();
    }
  };

  const addSlot = async (templateId, sectionId) => {
    const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const roleForNew = defaultOpSettings.defaultSlotRole || 'Rifleman';
    const tempSlot = {
      id: tempId,
      sectionId,
      name: roleForNew,
      role: roleForNew,
      allowedRoles: [],
      notes: '',
      assignedUserId: null,
      _pendingCreate: true
    };

    setTemplates((prev) => prev.map((template) => {
      if (template.id !== templateId) return template;
      return {
        ...template,
        sections: template.sections.map((section) => {
          if (section.id !== sectionId) return section;
          return { ...section, slots: [...section.slots, tempSlot] };
        })
      };
    }));

    // If sectionId is temporary (not yet persisted), don't attempt server call.
    if (Number.isNaN(Number(sectionId))) {
      alert('Section not yet saved. Please wait for the section to be created before adding slots.');
      return;
    }

    const token = localStorage.getItem('token');
    let res;
    try {
      res = await fetch(`${API}/templates/${templateId}/slots`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        sectionId: Number(sectionId),
        name: roleForNew,
        role: roleForNew,
        allowedRoles: [],
        notes: ''
      })
      });
    } catch (networkErr) {
      // Network or CORS error
      console.error('Network error adding slot', networkErr);
      setTemplates((prev) => prev.map((template) => {
        if (template.id !== templateId) return template;
        return {
          ...template,
          sections: template.sections.map((section) => {
            if (section.id !== sectionId) return section;
            return { ...section, slots: section.slots.filter((s) => s.id !== tempId) };
          })
        };
      }));
      alert('Network error: Could not add slot');
      return;
    }

    let data;
    try {
      data = await res.json();
    } catch (parseErr) {
      // Response was not JSON
      const text = await res.text().catch(() => '');
      console.error('Non-JSON response adding slot', res.status, text);
      setTemplates((prev) => prev.map((template) => {
        if (template.id !== templateId) return template;
        return {
          ...template,
          sections: template.sections.map((section) => {
            if (section.id !== sectionId) return section;
            return { ...section, slots: section.slots.filter((s) => s.id !== tempId) };
          })
        };
      }));
      alert(`Could not add slot (status ${res.status})`);
      if (res.status === 401) logout();
      return;
    }

    if (res.status === 401) {
      // remove temp slot and force logout
      setTemplates((prev) => prev.map((template) => {
        if (template.id !== templateId) return template;
        return {
          ...template,
          sections: template.sections.map((section) => {
            if (section.id !== sectionId) return section;
            return { ...section, slots: section.slots.filter((s) => s.id !== tempId) };
          })
        };
      }));
      alert(data.error || 'Login expired, please log in again');
      logout();
      return;
    }

    if (data && data.slot) {
      setTemplates((prev) => prev.map((template) => {
        if (template.id !== templateId) return template;
        return {
          ...template,
          sections: template.sections.map((section) => {
            if (section.id !== sectionId) return section;
            return {
              ...section,
              slots: section.slots.map((slot) => (slot.id === tempId ? data.slot : slot))
            };
          })
        };
      }));
    } else {
      setTemplates((prev) => prev.map((template) => {
        if (template.id !== templateId) return template;
        return {
          ...template,
          sections: template.sections.map((section) => {
            if (section.id !== sectionId) return section;
            return { ...section, slots: section.slots.filter((slot) => slot.id !== tempId) };
          })
        };
      }));
      console.error('Add slot failed', res.status, data);
      alert((data && data.error) || `Could not add slot (status ${res.status})`);
    }
  };

  const applySlotUpdatesLocally = (templateId, slotId, updates) => {
    setTemplates((prev) => prev.map((template) => {
      if (template.id !== templateId) return template;
      return {
        ...template,
        sections: template.sections.map((section) => ({
          ...section,
          slots: section.slots.map((slot) => (slot.id === slotId ? { ...slot, ...updates } : slot))
        }))
      };
    }));
  };

  const saveSlotUpdates = async (templateId, slotId, updates) => {
    const token = localStorage.getItem('token');
    const res = await fetch(`${API}/templates/${templateId}/slots/${slotId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(updates)
    });
    const data = await res.json();
    if (data.slot) {
      setTemplates((prev) => prev.map((template) => {
        if (template.id !== templateId) return template;
        return {
          ...template,
          sections: template.sections.map((section) => ({
            ...section,
            slots: section.slots.map((slot) => (slot.id === data.slot.id ? data.slot : slot))
          }))
        };
      }));
    } else {
      alert(data.error || 'Could not update slot');
    }
  };

  const flushSlotUpdate = (templateId, slotId) => {
    const key = `${templateId}:${slotId}`;
    const pending = pendingSlotUpdatesRef.current[key];
    if (!pending) return;

    if (slotSaveTimersRef.current[key]) {
      clearTimeout(slotSaveTimersRef.current[key]);
      delete slotSaveTimersRef.current[key];
    }

    delete pendingSlotUpdatesRef.current[key];
    saveSlotUpdates(templateId, slotId, pending);
  };

  const updateSlot = (templateId, slotId, updates) => {
    if (Number.isNaN(Number(slotId))) {
      applySlotUpdatesLocally(templateId, slotId, updates);
      return;
    }

    const key = `${templateId}:${slotId}`;

    applySlotUpdatesLocally(templateId, slotId, updates);
    pendingSlotUpdatesRef.current[key] = {
      ...(pendingSlotUpdatesRef.current[key] || {}),
      ...updates
    };

    if (slotSaveTimersRef.current[key]) clearTimeout(slotSaveTimersRef.current[key]);
    slotSaveTimersRef.current[key] = setTimeout(() => {
      flushSlotUpdate(templateId, slotId);
    }, 300);
  };

  const deleteSlot = async (templateId, slotId) => {
    if (!window.confirm('Are you sure you want to delete this slot?')) return;

    if (Number.isNaN(Number(slotId))) {
      setTemplates((prev) => prev.map((template) => {
        if (template.id !== templateId) return template;
        return {
          ...template,
          sections: template.sections.map((section) => ({
            ...section,
            slots: section.slots.filter((slot) => slot.id !== slotId)
          }))
        };
      }));
      return;
    }

    // optimistic remove
    const prevTemplates = templates;
    const key = `${templateId}:${slotId}`;
    if (slotSaveTimersRef.current[key]) {
      clearTimeout(slotSaveTimersRef.current[key]);
      delete slotSaveTimersRef.current[key];
    }
    delete pendingSlotUpdatesRef.current[key];

    setTemplates((prev) => prev.map((template) => {
      if (template.id !== templateId) return template;
      return {
        ...template,
        sections: template.sections.map((section) => ({
          ...section,
          slots: section.slots.filter((slot) => slot.id !== slotId)
        }))
      };
    }));

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API}/templates/${templateId}/slots/${slotId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (!res.ok) throw new Error('Could not delete slot');
    } catch (err) {
      alert(err.message || 'Could not delete slot');
      setTemplates(prevTemplates);
    }
  };

  const reorderTemplateSlots = async (templateId, sectionId, slotIds) => {
    const token = localStorage.getItem('token');
    const res = await fetch(`${API}/templates/${templateId}/sections/${sectionId}/slots/reorder`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ slotIds })
    });

    const data = await res.json();
    if (data.section) {
      setTemplates((prev) => prev.map((template) => {
        if (template.id !== templateId) return template;
        return {
          ...template,
          sections: template.sections.map((section) => (section.id === sectionId ? data.section : section))
        };
      }));
    } else {
      alert(data.error || 'Could not reorder slots');
      loadPrivateData();
    }
  };

  const moveTemplateSlot = (templateId, sectionId, fromSlotId, toSlotId) => {
    if (!fromSlotId || !toSlotId || fromSlotId === toSlotId) return;

    const template = templates.find((item) => item.id === templateId);
    const section = template?.sections?.find((item) => item.id === sectionId);
    const slots = section?.slots || [];
    const fromIndex = slots.findIndex((slot) => slot.id === fromSlotId);
    const toIndex = slots.findIndex((slot) => slot.id === toSlotId);
    if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return;

    const reordered = [...slots];
    const [movedSlot] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, movedSlot);

    setTemplates((prev) => prev.map((item) => {
      if (item.id !== templateId) return item;
      return {
        ...item,
        sections: item.sections.map((itemSection) => (
          itemSection.id === sectionId ? { ...itemSection, slots: reordered } : itemSection
        ))
      };
    }));

    reorderTemplateSlots(templateId, sectionId, reordered.map((slot) => slot.id));
  };

  const handleSlotDragStart = (templateId, sectionId, slotId, event) => {
    event.stopPropagation();
    setDraggedSlot({ templateId, sectionId, slotId });
  };

  const handleSlotDragOver = (templateId, sectionId, event) => {
    if (!draggedSlot) return;
    if (draggedSlot.templateId !== templateId || draggedSlot.sectionId !== sectionId) return;
    event.preventDefault();
  };

  const handleSlotDrop = (templateId, sectionId, targetSlotId, event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!draggedSlot) return;
    if (draggedSlot.templateId !== templateId || draggedSlot.sectionId !== sectionId) return;

    moveTemplateSlot(templateId, sectionId, draggedSlot.slotId, targetSlotId);
    setDraggedSlot(null);
  };

  const joinSlot = async (templateId, slotId) => {
    // optimistic: assign locally first
    if (!auth) return; // can't join without auth
    const prevTemplates = templates;
    setTemplates((prev) => prev.map((template) => {
      if (template.id !== templateId) return template;
      return {
        ...template,
        sections: template.sections.map((section) => ({
          ...section,
          slots: section.slots.map((slot) => (slot.id === slotId ? { ...slot, assignedUserId: auth.id, _pendingUpdate: true } : slot))
        }))
      };
    }));

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API}/templates/${templateId}/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ slotId })
      });
      const data = await res.json();
      if (data.slot) {
        setTemplates((prev) => prev.map((template) => {
          if (template.id !== templateId) return template;
          return {
            ...template,
            sections: template.sections.map((section) => ({
              ...section,
              slots: section.slots.map((slot) => (slot.id === data.slot.id ? data.slot : slot))
            }))
          };
        }));
      } else {
        throw new Error(data.error || 'Could not update slot');
      }
    } catch (err) {
      alert(err.message || 'Could not update slot');
      setTemplates(prevTemplates);
    }
  };

  const createUser = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem('token');
    const res = await fetch(`${API}/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(userForm)
    });
    const data = await res.json();
    if (data.user) {
      setUsers((prev) => [...prev, data.user]);
      setUserForm({ username: '', password: '', role: 'member', rank: '', status: 'Active' });
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    setAuth(null);
    setShowLoginPanel(false);
    loadPublicData();
  };

  const isAdmin = auth?.role === 'admin';
  const isMissionmaker = auth?.role === 'missionmaker';
  const effectiveOverviewMode = overviewMode === 'orbat' && isNarrowViewport ? 'cards' : overviewMode;
  const isWideCanvasPage = page === 'builder' || (page === 'overview' && effectiveOverviewMode === 'orbat');

  const normalizeRoleKey = (role) => role?.trim().toLowerCase();

  const selectedOp = useMemo(() => ops.find((op) => op.id === selectedOpId), [ops, selectedOpId]);
  const getTemplateName = (templateId) => templates.find((template) => template.id === Number(templateId))?.name || 'Unknown template';
  const getRankLabel = (rankVal) => {
    if (!rankVal && rankVal !== 0) return '-';
    const found = ranks.find((r) => r.id === Number(rankVal) || r.name === rankVal || r.short === rankVal);
    if (found) return `${found.name}${found.short ? ` (${found.short})` : ''}`;
    return String(rankVal);
  };
  const sortedOps = useMemo(() => {
    return [...ops].sort((a, b) => {
      const da = a.date || '';
      const db = b.date || '';
      if (da === db) return (a.time || '').localeCompare(b.time || '');
      return da.localeCompare(db);
    });
  }, [ops]);

  const overviewOps = useMemo(() => sortedOps.slice(0, 2), [sortedOps]);

  useEffect(() => {
    if (sortedOps.length === 0) {
      if (selectedOpId !== null) {
        setSelectedOpId(null);
      }
      return;
    }

    const selectedStillExists = sortedOps.some((op) => op.id === selectedOpId);
    if (!selectedStillExists) {
      setSelectedOpId(sortedOps[0].id);
    }
  }, [selectedOpId, sortedOps]);

  useEffect(() => {
    if ((page === 'scheduler-detail' || page === 'op-detail') && selectedOp) {
      setSchedulerLoadTemplateId(String(selectedOp.templateId || ''));
    }
  }, [page, selectedOp?.id, selectedOp?.templateId]);

  const recurrenceLabel = (recurrence) => {
    if (!recurrence || recurrence.recurrence === 'none') return 'No recurrence';

    const dayNames = (days) =>
      weekDayLabels
        .filter((item) => days.includes(item.value))
        .map((item) => item.label)
        .join(', ');

    if (recurrence.recurrence === 'daily') return 'Daily';
    if (recurrence.recurrence === 'weekly') {
      const days = recurrence.weeklyDays || [];
      return days.length ? `Weekly on ${dayNames(days)}` : 'Weekly';
    }
    if (recurrence.recurrence === 'biweekly') {
      const days = recurrence.weeklyDays || [];
      return days.length ? `Every 2 weeks on ${dayNames(days)}` : 'Every two weeks';
    }
    if (recurrence.recurrence === 'monthly') {
      return recurrence.monthlyDay ? `Monthly on day ${recurrence.monthlyDay}` : 'Monthly';
    }
    return recurrence.recurrence;
  };

  const minSignupAge = Number(defaultOpSettings.minSignupAge) || 17;

  const sectionStats = (section) => {
    const total = section?.slots?.length || 0;
    const occupied = section?.slots?.filter((slot) => slot.assignedUserId).length || 0;
    return { occupied, total };
  };

  const getTemplateFlowEdges = (templateId, sections) => {
    const sectionIds = new Set((sections || []).map((section) => section.id));
    return (flowEdges?.[templateId] || []).filter((edge) => sectionIds.has(edge.sourceId) && sectionIds.has(edge.targetId));
  };

  const addTemplateFlowEdge = (templateId, sourceId, targetId, sourceAnchor = 'bottom', targetAnchor = 'top') => {
    if (!sourceId || !targetId || sourceId === targetId) return;

    setFlowEdges((prev) => {
      const current = prev?.[templateId] || [];
      const exists = current.some((edge) => (
        edge.sourceId === sourceId
        && edge.targetId === targetId
        && (edge.sourceAnchor || 'bottom') === sourceAnchor
        && (edge.targetAnchor || 'top') === targetAnchor
      ));
      if (exists) return prev;

      return {
        ...prev,
        [templateId]: [...current, {
          id: Date.now() + Math.random(),
          sourceId,
          targetId,
          sourceAnchor,
          targetAnchor
        }]
      };
    });
  };

  const clearTemplateFlowEdges = (templateId) => {
    setFlowEdges((prev) => ({
      ...prev,
      [templateId]: []
    }));
    setFlowLinkSource(null);
  };

  const resetTemplateCanvasLayout = (templateId) => {
    setCanvasLayout((prev) => ({
      ...prev,
      [templateId]: {}
    }));
    setFlowLinkSource(null);
  };

  const autoLayoutTemplate = (templateId) => {
    const template = templates.find((t) => t.id === templateId);
    if (!template) return;

    const sections = template.sections || [];
    const sectionIds = new Set(sections.map((section) => section.id));
    const edges = getTemplateFlowEdges(templateId, sections);

    const HORIZONTAL_GAP = CANVAS_GRID_UNIT; // small gap between nodes (use grid unit for nicer alignment)
    const VERTICAL_GAP = 60; // breathing room between a row and the tallest node in it
    const DEFAULT_NODE_HEIGHT = 124;
    const START_X = 40;
    const START_Y = 40;

    const nodeHeight = (id) => nodeHeights[`flow-${templateId}-${id}`] || DEFAULT_NODE_HEIGHT;
    const nodeWidth = (id) => {
      const section = sections.find((s) => s.id === id) || {};
      const slots = Array.isArray(section.slots) ? section.slots.length : 0;
      // width units: base 7 units (~280px) plus 1 unit per slot (grid unit defined elsewhere)
      const widthUnits = Math.max(7, 4 + slots);
      return widthUnits * CANVAS_GRID_UNIT; // matches visual grid unit
    };

    const childrenMap = new Map();
    const hasParent = new Set();
    edges.forEach((edge) => {
      if (!sectionIds.has(edge.sourceId) || !sectionIds.has(edge.targetId)) return;
      if (!childrenMap.has(edge.sourceId)) childrenMap.set(edge.sourceId, []);
      childrenMap.get(edge.sourceId).push(edge.targetId);
      hasParent.add(edge.targetId);
    });

    const roots = sections.filter((section) => !hasParent.has(section.id)).map((section) => section.id);

    // Depth = longest path from any root, so a node always sits below every one of its parents.
    const depths = new Map();
    roots.forEach((rootId) => depths.set(rootId, 0));
    let changed = true;
    let guard = 0;
    while (changed && guard < sections.length + 1) {
      changed = false;
      guard += 1;
      edges.forEach((edge) => {
        if (!sectionIds.has(edge.sourceId) || !sectionIds.has(edge.targetId)) return;
        const parentDepth = depths.get(edge.sourceId);
        if (parentDepth === undefined) return;
        const nextDepth = parentDepth + 1;
        if ((depths.get(edge.targetId) ?? -1) < nextDepth) {
          depths.set(edge.targetId, nextDepth);
          changed = true;
        }
      });
    }
    sections.forEach((section) => {
      if (!depths.has(section.id)) depths.set(section.id, 0);
    });

    // Row height per depth = tallest node actually present on that row, so rows below a
    // large HQ block don't overlap it.
    const maxDepth = Math.max(0, ...Array.from(depths.values()));
    const rowHeights = [];
    for (let d = 0; d <= maxDepth; d += 1) {
      const idsInRow = sections.filter((section) => depths.get(section.id) === d).map((section) => section.id);
      rowHeights[d] = idsInRow.length ? Math.max(...idsInRow.map(nodeHeight)) : DEFAULT_NODE_HEIGHT;
    }
    const rowY = [START_Y];
    for (let d = 1; d <= maxDepth; d += 1) {
      rowY[d] = rowY[d - 1] + rowHeights[d - 1] + VERTICAL_GAP;
    }

    const positions = {};
    const visited = new Set();
    let cursorX = START_X;

    const layoutNode = (id) => {
      if (visited.has(id)) return positions[id]?.x ?? cursorX;
      visited.add(id);

      const depth = depths.get(id) ?? 0;
      const children = (childrenMap.get(id) || []).filter((childId) => sectionIds.has(childId) && !visited.has(childId));

      if (children.length === 0) {
        const x = cursorX;
        positions[id] = { x, y: rowY[depth] };
        cursorX += nodeWidth(id) + HORIZONTAL_GAP;
        return x;
      }

      const childLefts = children.map((childId) => layoutNode(childId));
      const childCenters = children.map((childId, i) => childLefts[i] + nodeWidth(children[i]) / 2);
      const minCenter = Math.min(...childCenters);
      const maxCenter = Math.max(...childCenters);
      const center = (minCenter + maxCenter) / 2;
      const x = center - nodeWidth(id) / 2;
      positions[id] = { x, y: rowY[depth] };
      return x;
    };

    roots.forEach((rootId) => layoutNode(rootId));
    // Any remaining sections not reached (e.g. isolated cycles) still get placed
    sections.forEach((section) => {
      if (!visited.has(section.id)) layoutNode(section.id);
    });

    setCanvasLayout((prev) => {
      const templateLayout = { ...(prev?.[templateId] || {}) };
      Object.entries(positions).forEach(([sectionId, pos]) => {
        templateLayout[sectionId] = {
          ...(templateLayout[sectionId] || {}),
          x: snapToCanvasGrid(pos.x),
          y: snapToCanvasGrid(pos.y)
        };
      });
      return { ...prev, [templateId]: templateLayout };
    });
  };

  const handleFlowConnectorClick = (templateId, sectionId, anchor, event) => {
    event.stopPropagation();

    if (!flowLinkSource || flowLinkSource.templateId !== templateId) {
      setFlowLinkSource({ templateId, sectionId, anchor });
      return;
    }

    if (flowLinkSource.sectionId === sectionId && flowLinkSource.anchor === anchor) {
      setFlowLinkSource(null);
      return;
    }

    // A line always runs from a "bottom" dot (parent, emits downward) to a "top" dot
    // (child, receives from above) - which end is which never depends on click order.
    if (flowLinkSource.anchor === anchor) {
      // Both clicked dots are the same type (e.g. two "bottom" dots) - there is no valid
      // parent/child direction to infer from that, so treat this click as the start of a
      // fresh selection instead of guessing based on click order.
      setFlowLinkSource({ templateId, sectionId, anchor });
      return;
    }

    const parentId = flowLinkSource.anchor === 'bottom' ? flowLinkSource.sectionId : sectionId;
    const childId = parentId === flowLinkSource.sectionId ? sectionId : flowLinkSource.sectionId;

    addTemplateFlowEdge(templateId, parentId, childId, 'bottom', 'top');
    setFlowLinkSource(null);
  };

  const resolveSectionParentId = (templateId, sections, sectionId, index) => {
    const explicitParent = getCanvasNode(templateId, sectionId, index).parentId;
    if (explicitParent && sections.some((item) => item.id === explicitParent)) {
      return explicitParent;
    }
    if (index === 0) return null;
    return sections[0]?.id || null;
  };

  const updateSectionParent = (templateId, sectionId, parentId) => {
    updateCanvasNode(templateId, sectionId, { parentId: parentId || null });
  };

  const getCanvasNode = (templateId, sectionId, index) => {
    const templateLayout = canvasLayout?.[templateId] || {};
    const existing = templateLayout?.[sectionId];
    if (existing) return existing;

    return {
      x: 40 + (index % 3) * 300,
      y: 40 + Math.floor(index / 3) * 240,
      parentId: null
    };
  };

  const updateCanvasNode = (templateId, sectionId, updates) => {
    setCanvasLayout((prev) => {
      const templateLayout = prev?.[templateId] || {};
      const nextNode = {
        ...(templateLayout?.[sectionId] || {}),
        ...updates
      };

      return {
        ...prev,
        [templateId]: {
          ...templateLayout,
          [sectionId]: nextNode
        }
      };
    });
  };

  const getCanvasSize = (template) => {
    let maxX = 0;
    let maxY = 0;

    const sections = template.sections || [];
    sections.forEach((section, index) => {
      const node = getCanvasNode(template.id, section.id, index);
      maxX = Math.max(maxX, node.x);
      maxY = Math.max(maxY, node.y);
    });

    return {
      width: Math.max(1000, maxX + 360),
      height: Math.max(700, maxY + 320)
    };
  };

  const startCanvasDrag = (event, templateId, sectionId, index) => {
    if (event.button !== 0) return;

    const canvasElement = event.currentTarget.closest('.drag-canvas');
    if (!canvasElement) return;

    const rect = canvasElement.getBoundingClientRect();
    const node = getCanvasNode(templateId, sectionId, index);
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;

    setCanvasDrag({
      templateId,
      sectionId,
      offsetX: pointerX - node.x,
      offsetY: pointerY - node.y
    });
  };

  const moveCanvasDrag = (event, template) => {
    if (!canvasDrag || canvasDrag.templateId !== template.id) return;

    const canvasElement = event.currentTarget;
    const rect = canvasElement.getBoundingClientRect();
    const nextX = Math.max(12, event.clientX - rect.left - canvasDrag.offsetX);
    const nextY = Math.max(12, event.clientY - rect.top - canvasDrag.offsetY);

    updateCanvasNode(template.id, canvasDrag.sectionId, { x: nextX, y: nextY });
    setDragSnapPreview({
      templateId: template.id,
      sectionId: canvasDrag.sectionId,
      x: snapToCanvasGrid(nextX),
      y: snapToCanvasGrid(nextY)
    });
  };

  const stopCanvasDrag = () => {
    if (
      canvasDrag
      && dragSnapPreview
      && dragSnapPreview.templateId === canvasDrag.templateId
      && dragSnapPreview.sectionId === canvasDrag.sectionId
    ) {
      updateCanvasNode(canvasDrag.templateId, canvasDrag.sectionId, {
        x: dragSnapPreview.x,
        y: dragSnapPreview.y
      });
    }
    setCanvasDrag(null);
    setDragSnapPreview(null);
  };

  const setNodeHeightRef = (nodeKey) => (element) => {
    if (!element) return;
    const nextHeight = element.offsetHeight;
    setNodeHeights((prev) => (prev[nodeKey] === nextHeight ? prev : { ...prev, [nodeKey]: nextHeight }));
  };

  const [customRoles, setCustomRoles] = useState([]);
  const [newRoleName, setNewRoleName] = useState('');
  const [renamingRole, setRenamingRole] = useState(null);
  const [renameValue, setRenameValue] = useState('');

  const allRoles = useMemo(() => {
    const roleMap = new Map();
    const addRoleToMap = (role) => {
      const key = normalizeRoleKey(role);
      if (!key) return;
      if (!roleMap.has(key)) {
        roleMap.set(key, role.trim());
      }
    };

    templates.forEach((template) => {
      template.sections?.forEach((section) => {
        section.slots?.forEach((slot) => {
          if (slot.role) addRoleToMap(slot.role);
          slot.allowedRoles?.forEach((allowedRole) => addRoleToMap(allowedRole));
        });
      });
    });
    customRoles.forEach((role) => addRoleToMap(role.name));
    return Array.from(roleMap.values()).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [templates, customRoles]);

  const permissionColumns = useMemo(() => {
    return allRoles.filter((role) => !['member', 'admin'].includes(normalizeRoleKey(role)));
  }, [allRoles]);

  const addRole = async (e) => {
    e.preventDefault();
    const name = newRoleName.trim();
    if (!name) return;
    const key = normalizeRoleKey(name);
    if (allRoles.some((existing) => normalizeRoleKey(existing) === key)) {
      alert('Role already exists');
      return;
    }
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${API}/roles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name })
      });
      const data = await res.json();
      if (!res.ok || !data.role) throw new Error(data.error || 'Could not add role');
      setCustomRoles((prev) => [...prev, data.role]);
      setNewRoleName('');
    } catch (err) {
      alert(err.message || 'Could not add role');
    }
  };

  const deleteRole = async (role) => {
    if (!window.confirm(`Are you sure you want to delete the role "${role}"?`)) {
      return;
    }
    const target = customRoles.find((item) => normalizeRoleKey(item.name) === normalizeRoleKey(role));
    if (!target) return;
    const prevCustomRoles = customRoles;
    setCustomRoles((prev) => prev.filter((item) => item.id !== target.id));
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API}/roles/${target.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Could not delete role');
    } catch (err) {
      alert(err.message || 'Could not delete role');
      setCustomRoles(prevCustomRoles);
    }
  };

  const renameRole = async (oldName, newName) => {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === oldName) { setRenamingRole(null); return; }
    const token = localStorage.getItem('token');
    const res = await fetch(`${API}/roles/rename`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ oldName, newName: trimmed })
    });
    const data = await res.json();
    if (data.ok) {
      setCustomRoles((prev) => prev.map((r) => (r.name === oldName ? { ...r, name: trimmed } : r)));
      setRenamingRole(null);
      loadPrivateData();
    } else {
      alert(data.error || 'Could not rename role');
    }
  };

  const updateUserRole = async (userId, role) => {
    const token = localStorage.getItem('token');
    const res = await fetch(`${API}/users/${userId}/permissions`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ role })
    });
    const data = await res.json();
    if (data.user) {
      setUsers((prev) => prev.map((u) => (u.id === data.user.id ? data.user : u)));
      if (auth?.id === data.user.id) {
        setAuth(data.user);
      }
    }
  };

  const updateUserRank = async (userId, rank) => {
    const prevUsers = users;
    const prevAuth = auth;
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, rank } : u)));
    if (auth?.id === userId) {
      setAuth((prev) => ({ ...prev, rank }));
    }
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API}/users/${userId}/permissions`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ rank })
      });
      if (!res.ok) {
        let err = { error: 'Could not update rank' };
        try { err = await res.json(); } catch (e) {}
        throw new Error(err.error || 'Could not update rank');
      }
      const data = await res.json();
      if (data.user) {
        setUsers((prev) => prev.map((u) => (u.id === data.user.id ? data.user : u)));
        if (auth?.id === data.user.id) {
          setAuth(data.user);
        }
      }
    } catch (err) {
      alert(err.message || 'Could not update rank');
      setUsers(prevUsers);
      setAuth(prevAuth);
    }
  };

  const deleteUser = async (userId) => {
    if (!window.confirm('Are you sure you want to delete this user?')) return;
    const token = localStorage.getItem('token');
    const res = await fetch(`${API}/users/${userId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    if (res.ok) {
      setUsers((prev) => prev.filter((u) => u.id !== userId));
    } else {
      alert('Could not delete user');
    }
  };

  

  const deleteTemplate = async (templateId) => {
    if (!window.confirm('Are you sure you want to delete this template?')) return;
    // optimistic remove
    const prevTemplates = templates;
    setTemplates((prev) => prev.filter((template) => template.id !== templateId));
    if (selectedTemplateId === templateId) {
      setSelectedTemplateId((prev) => {
        const nextTemplates = templates.filter((template) => template.id !== templateId);
        return nextTemplates?.[0]?.id || null;
      });
    }
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API}/templates/${templateId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (!res.ok) throw new Error('Could not delete template');
    } catch (err) {
      alert(err.message || 'Could not delete template');
      setTemplates(prevTemplates);
    }
  };

  const [roleModalUser, setRoleModalUser] = useState(null);
  const [roleModalPermissions, setRoleModalPermissions] = useState({});

  const togglePermission = async (userId, permission) => {
    const user = users.find((u) => u.id === userId);
    if (!user) return;
    const updatedPermissions = {
      ...user.permissions,
      [permission]: !user.permissions?.[permission]
    };
    const token = localStorage.getItem('token');
    const res = await fetch(`${API}/users/${userId}/permissions`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ permissions: updatedPermissions })
    });
    const data = await res.json();
    if (data.user) {
      setUsers((prev) => prev.map((u) => (u.id === userId ? data.user : u)));
    }
  };

  const openRoleModal = (user) => {
    const currentPermissions = user.permissions || {};
    const initial = permissionColumns.reduce((acc, permission) => {
      acc[permission] = Boolean(currentPermissions[permission]);
      return acc;
    }, {});
    setRoleModalPermissions(initial);
    setRoleModalUser(user);
  };

  const closeRoleModal = () => {
    setRoleModalUser(null);
    setRoleModalPermissions({});
  };

  const toggleRoleModalPermission = (permission) => {
    setRoleModalPermissions((prev) => ({
      ...prev,
      [permission]: !prev[permission]
    }));
  };

  const saveRoleModal = async () => {
    if (!roleModalUser) return;
    const token = localStorage.getItem('token');
    const res = await fetch(`${API}/users/${roleModalUser.id}/permissions`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ permissions: roleModalPermissions })
    });
    const data = await res.json();
    if (data.user) {
      setUsers((prev) => prev.map((u) => (u.id === data.user.id ? data.user : u)));
      closeRoleModal();
    }
  };

  return (
    <div className={isWideCanvasPage ? 'app-shell app-shell-builder' : 'app-shell'}>
      <header>
        <img src="/tfo-emoji.png" alt="TFO" className="header-logo" height="40" width="40" />
        <h1>TFO Attendance</h1>
        <div className="header-actions">
          <button className="theme-toggle" onClick={toggleTheme}>
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>

          {!auth ? (
              <>
                <button className="secondary" onClick={() => setShowLoginPanel((prev) => !prev)}>
                  Login
                </button>
                <button className="secondary" onClick={() => setPage('signup')}>
                  Create account
                </button>
              </>
          ) : (
              <>
                
                <button onClick={logout}>
                  Logout
                </button>
              </>
          )}
        </div>
      </header>

      {!auth && showLoginPanel ? (
        <div className="login-popover" role="dialog" aria-modal="false">
          <div className="login-modal">
            <form onSubmit={login}>
              <h2>Login</h2>
              <input
                placeholder="Username"
                value={loginForm.username}
                onChange={(e) => setLoginForm((prev) => ({ ...prev, username: e.target.value }))}
              />
              <input
                type="password"
                placeholder="Password"
                value={loginForm.password}
                onChange={(e) => setLoginForm((prev) => ({ ...prev, password: e.target.value }))}
              />
              <div className="login-panel-actions">
                <button type="button" className="secondary" onClick={() => setShowLoginPanel(false)}>
                  Cancel
                </button>
                <button type="submit">Login</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      

      {page === 'signup' ? (
        <section className="card">
          <div className="playerlist-toolbar">
            <button onClick={goToDashboard} className="secondary small">Back</button>
            <div>
              <h3>Create account</h3>
              <p>Complete the signup form. You must be older than {minSignupAge - 1} to register.</p>
            </div>
          </div>
          <form onSubmit={signup} className="signup-card">
            <div className="signup-fields-grid">
              <div className="signup-credentials-row">
                <div className="signup-field">
                  <label>Username</label>
                  <small>Choose a unique username for the unit.</small>
                  <input placeholder="Username" value={signupForm.username} onChange={(e) => setSignupForm((prev) => ({ ...prev, username: e.target.value }))} />
                  {signupErrors.username ? <div className="field-error">{signupErrors.username}</div> : null}
                </div>

                <div className="signup-field">
                  <label>Password</label>
                  <small>Pick a secure password (min 8 characters recommended).</small>
                  <input type="password" placeholder="Password" value={signupForm.password} onChange={(e) => setSignupForm((prev) => ({ ...prev, password: e.target.value }))} />
                  {signupErrors.password ? <div className="field-error">{signupErrors.password}</div> : null}
                </div>
              </div>

              <div className="signup-field">
                <label>Age</label>
                <small>Enter your age as a whole number.</small>
                <input type="number" min="0" max="120" step="1" value={signupForm.age} onChange={(e) => setSignupForm((prev) => ({ ...prev, age: e.target.value }))} />
                {signupErrors.age ? <div className="field-error">{signupErrors.age}</div> : null}
              </div>

              <div className="signup-field">
                <h4>Availability</h4>
                <small>Select which regular operation times you can usually attend.</small>
                <label className="checkbox-row"><input type="checkbox" checked={signupForm.availability_sunday === 'Yes'} onChange={(e) => setSignupForm((prev) => ({ ...prev, availability_sunday: e.target.checked ? 'Yes' : 'No' }))} /> Sunday 19:00–22:00</label>
                <label className="checkbox-row"><input type="checkbox" checked={signupForm.availability_thursday === 'Yes'} onChange={(e) => setSignupForm((prev) => ({ ...prev, availability_thursday: e.target.checked ? 'Yes' : 'No' }))} /> Thursday 19:00–22:00</label>
              </div>

              <div className="signup-field">
                <h4>Experience</h4>
                <small>Help us place you in appropriate training.</small>
                <label className="radio-row"><input type="radio" name="exp" checked={signupForm.arma_experience === 'None'} onChange={() => setSignupForm((prev) => ({ ...prev, arma_experience: 'None' }))} /> None (new)</label>
                <label className="radio-row"><input type="radio" name="exp" checked={signupForm.arma_experience === 'Basic'} onChange={() => setSignupForm((prev) => ({ ...prev, arma_experience: 'Basic' }))} /> Basic (played vanilla)</label>
                <label className="radio-row"><input type="radio" name="exp" checked={signupForm.arma_experience === 'Experienced'} onChange={() => setSignupForm((prev) => ({ ...prev, arma_experience: 'Experienced' }))} /> Experienced (mods/ACE)</label>
              </div>

              <div className="signup-field">
                <label>Previous milsim unit?</label>
                <small>Optional: helps tailor training.</small>
                <select value={signupForm.prev_milsim} onChange={(e) => setSignupForm((prev) => ({ ...prev, prev_milsim: e.target.value }))}>
                  <option>No</option>
                  <option>Yes</option>
                </select>
              </div>

              <div className="signup-field">
                <label>PTT (TeamSpeak)</label>
                <small>Do you have problems with push-to-talk?</small>
                <select value={signupForm.ptt_ok} onChange={(e) => setSignupForm((prev) => ({ ...prev, ptt_ok: e.target.value }))}>
                  <option>Yes</option>
                  <option>No</option>
                </select>
              </div>

              <div className="signup-field">
                <label>Where did you find our unit?</label>
                <small>Optional.</small>
                <select value={signupForm.found_via} onChange={(e) => setSignupForm((prev) => ({ ...prev, found_via: e.target.value }))}>
                  <option>Discord</option>
                  <option>Reddit</option>
                  <option>Steam</option>
                  <option>Youtube</option>
                </select>
              </div>

              <div className="signup-field">
                <h4>Mods (Requirement)</h4>
                <small>You must be willing to install multiple modlists to join.</small>
                <select value={signupForm.ok_multiple_modlists} onChange={(e) => setSignupForm((prev) => ({ ...prev, ok_multiple_modlists: e.target.value }))}>
                  <option>Yes</option>
                  <option>No</option>
                </select>
                {signupErrors.ok_multiple_modlists ? <div className="field-error">{signupErrors.ok_multiple_modlists}</div> : null}
              </div>

              <div className="signup-field">
                <h4>Orders (Requirement)</h4>
                <small>Members must follow mission orders and instructions.</small>
                <select value={signupForm.ok_follow_orders} onChange={(e) => setSignupForm((prev) => ({ ...prev, ok_follow_orders: e.target.value }))}>
                  <option>No</option>
                  <option>Yes</option>
                </select>
                {signupErrors.ok_follow_orders ? <div className="field-error">{signupErrors.ok_follow_orders}</div> : null}
              </div>

              <div className="signup-actions">
                <button type="button" className="secondary" onClick={() => setPage('overview')}>Cancel</button>
                <button type="submit">Create account</button>
              </div>
            </div>
          </form>
        </section>
      ) : null}

      <div className="dashboard">
        <section className="card header-card">
          <div>
            <h2>{auth ? `Welcome, ${auth.username}` : (page === 'signup' ? 'Create account' : 'TFO Overview')}</h2>
            {!(page === 'signup') && (
              <p>{auth ? `Role: ${auth.role}` : 'View the next operation now. Login when you want to claim a slot.'}</p>
            )}
          </div>
            {isAdmin || isMissionmaker ? (
            <div className="top-tabs">
              <button className={page === 'dashboard' ? 'tab active' : 'tab'} onClick={goToDashboard}>
                Overview
              </button>
              <button className={page === 'campaigns' ? 'tab active' : 'tab'} onClick={goToCampaigns}>
                Campaigns
              </button>
              <button className={(page === 'scheduler' || page === 'scheduler-detail') ? 'tab active' : 'tab'} onClick={goToSchedulerList}>
                Operation scheduler
              </button>
              <button className={page === 'builder' ? 'tab active' : 'tab'} onClick={goToBuilder}>
                Template Builder
              </button>
              {/* Roles and Ranks moved to Settings subtabs */}
              <button className={page === 'players' ? 'tab active' : 'tab'} onClick={goToPlayers}>
                Player List
              </button>
              <button className={page === 'settings' ? 'tab active' : 'tab'} onClick={goToSettings}>
                Settings
              </button>
            </div>
          ) : null}
          {auth ? (
            <div style={{ marginLeft: 12 }}>
              <button className={page === 'profile' ? 'tab active' : 'tab'} onClick={() => setPage('profile')}>
                Profile
              </button>
            </div>
          ) : null}
        </section>

        <div className="dashboard">
          {page === 'overview' ? (
            <section className="card">
              <div className="builder-toolbar">
                <div>
                  <h3>Overview</h3>
                  <p>
                    {auth
                      ? 'The next scheduled operation opens automatically.'
                      : 'The next scheduled operation opens automatically. Login is only required when you want to join.'}
                  </p>
                </div>
                <div className="builder-actions">
                  <span className="slot-meta">
                    {effectiveOverviewMode === 'orbat'
                      ? 'ORBAT viewer active'
                      : 'Card viewer fallback active (small screen)'}
                  </span>
                </div>
              </div>

              <div className="template-list">
                {sortedOps.length === 0 ? (
                  <div className="empty-state">No operations scheduled yet.</div>
                ) : (
                  sortedOps.map((op) => (
                    <div key={op.id} className="template-list-item">
                      <button className={selectedOpId === op.id ? 'selected' : ''} onClick={() => showOpOnDashboard(op.id)}>
                        {op.name} - {op.date} {op.time} ({getTemplateName(op.templateId)})
                      </button>
                    </div>
                  ))
                )}
              </div>

              {(selectedOpId !== null && selectedOp ? [selectedOp] : overviewOps).map((op) => (
                <OrbatOverview
                  key={op.id}
                  op={op}
                  users={users}
                  auth={auth}
                  isAdmin={isAdmin}
                  isMissionmaker={isMissionmaker}
                  allRoles={allRoles}
                  effectiveOverviewMode={effectiveOverviewMode}
                  getTemplateName={getTemplateName}
                  getCanvasSize={getCanvasSize}
                  getCanvasNode={getCanvasNode}
                  resolveSectionParentId={resolveSectionParentId}
                  nodeHeights={nodeHeights}
                  setNodeHeightRef={setNodeHeightRef}
                  moveCanvasDrag={moveCanvasDrag}
                  stopCanvasDrag={stopCanvasDrag}
                  startCanvasDrag={startCanvasDrag}
                  updateSectionParent={updateSectionParent}
                  sectionStats={sectionStats}
                  joinOpSlot={joinOpSlot}
                  signOffOpSlot={signOffOpSlot}
                  updateOpSlot={updateOpSlot}
                  updateOpSlotDebounced={updateOpSlotDebounced}
                  flushOpSlotUpdate={flushOpSlotUpdate}
                    setShowLoginPanel={setShowLoginPanel}
                    showOpInScheduler={showOpInScheduler}
                    campaignImage={campaigns?.[0]?.image}
                />
              ))}
            </section>
          ) : null}
          {page === 'settings' ? (
              <Settings
                  defaultOpSettings={defaultOpSettings}
                  setDefaultOpSettings={setDefaultOpSettings}
                  templates={templates}
                changePassword={changePassword}
                uploadCustomMarker={uploadCustomMarker}
                  allRoles={allRoles}
                  isAdmin={isAdmin}
                  clearDb={clearDb}
                  changePasswordForm={changePasswordForm}
                  setChangePasswordForm={setChangePasswordForm}
                  exportBackup={exportBackup}
                  importBackup={importBackup}
                  customRoles={customRoles}
                  addRole={addRole}
                  deleteRole={deleteRole}
                  renameRole={renameRole}
                  goToDashboard={goToDashboard}
                  initialSubpage={settingsInitialSubpage}
                  ranks={ranks}
                  reloadRanks={loadRanks}
                  setRanks={setRanks}
                  uploadFile={uploadFile}
                  users={users}
                  setUsers={setUsers}
              />
          ) : null}
          {auth && page === 'profile' ? (
            <section className="card">
              <Profile
                auth={auth}
                users={users}
                ranks={ranks}
                ops={ops}
                changePassword={changePassword}
                uploadAvatar={uploadAvatar}
                updateMyProfile={updateMyProfile}
                allRoles={allRoles}
              />
            </section>
          ) : null}
          {auth && (isAdmin || isMissionmaker) && page === 'scheduler' ? (
            <section className="card">
              <div className="builder-toolbar">
                <div>
                  <h3>Operation scheduler</h3>
                  <p>Create and manage scheduled and recurring operations.</p>
                </div>
                <div className="builder-actions">
                  <button type="button" className="small btn-danger" onClick={createAndOpenDefaultOp} disabled={creatingDefaultOp}>
                    {creatingDefaultOp ? 'Creating...' : 'New'}
                  </button>
                </div>
              </div>

              <div className="op-vertical-list">
                {sortedOps.length === 0 && recurrences.length === 0 ? (
                  <div className="empty-state">No operations scheduled yet.</div>
                ) : (
                  [
                    ...sortedOps.map((op) => ({ type: 'op', id: op.id, name: op.name, date: op.date, time: op.time, templateId: op.templateId, recurrenceId: null, sortKey: op.date + op.time })),
                    ...recurrences.map((rec) => ({ type: 'recurrence', id: rec.id, name: rec.name, date: rec.startDate || '', time: rec.time || '', templateId: rec.templateId, recurrenceId: rec.id, sortKey: (rec.startDate || '') + (rec.time || '') }))
                  ]
                    .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
                    .map((item) => (
                      <button
                        key={item.type + item.id}
                        className="op-list-row"
                        onClick={() => item.type === 'op'
                          ? showOpInScheduler(item.id, null)
                          : showOpInScheduler(item.id, item.recurrenceId)
                        }
                      >
                        <div className="op-list-row-top">
                          <div className="op-list-name">{item.name}</div>
                          {item.type === 'recurrence' && <span className="op-list-badge">Recurring</span>}
                        </div>
                        <div className="op-list-meta">{item.date} &middot; {item.time} &middot; {getTemplateName(item.templateId)}</div>
                      </button>
                    ))
                )}
              </div>
            </section>
          ) : null}

          {auth && (isAdmin || isMissionmaker) && page === 'campaigns' ? (
            <Campaigns
              campaigns={campaigns}
              templates={templates}
              users={users}
              uploadFile={uploadFile}
              createCampaign={createCampaign}
              updateCampaign={updateCampaign}
              deleteCampaign={deleteCampaign}
            />
          ) : null}

          {auth && (isAdmin || isMissionmaker) && page === 'op-detail' && selectedOp ? (
            <section className="card">
              <div className="role-add-form" style={{marginBottom:'1rem'}}>
                <div style={{marginBottom:'0.5rem'}}>
                  <strong>Server:</strong> {selectedOp.serverName || '-'}
                </div>
                <div style={{marginBottom:'0.5rem'}}>
                  <strong>Modlist:</strong> {selectedOp.modlist ? <a href={selectedOp.modlist} target="_blank" rel="noreferrer">modlist</a> : '-'}
                </div>
                <div>
                  <strong>TS3:</strong> {selectedOp.tsAddress || '-'}
                </div>
              </div>
              <OrbatScheduler
                selectedOp={selectedOp}
                selectedRecurrenceId={selectedRecurrenceId}
                recurrences={recurrences}
                goToSchedulerList={goToSchedulerList}
                getTemplateName={getTemplateName}
                schedulerLoadTemplateId={schedulerLoadTemplateId}
                setSchedulerLoadTemplateId={setSchedulerLoadTemplateId}
                templates={templates}
                campaigns={campaigns}
                loadTemplateIntoOp={loadTemplateIntoOp}
                deleteRecurrence={deleteRecurrence}
                deleteOp={deleteOp}
                updateOpMeta={updateOpMeta}
                handleModlistDragOver={handleModlistDragOver}
                handleModlistDrop={handleModlistDrop}
                updateOpSectionMeta={updateOpSectionMeta}
                users={users}
                updateOpSlot={updateOpSlot}
                updateOpSlotDebounced={updateOpSlotDebounced}
                flushOpSlotUpdate={flushOpSlotUpdate}
                allRoles={allRoles}
                weekDayLabels={weekDayLabels}
                toggleRecurrenceWeeklyDay={toggleRecurrenceWeeklyDay}
                updateRecurrence={updateRecurrence}
                isMissionmaker={isMissionmaker}
                uploadCustomMarker={uploadCustomMarker}
                recurrenceLabel={recurrenceLabel}
                isAdmin={isAdmin}
                getCanvasSize={getCanvasSize}
                getCanvasNode={getCanvasNode}
                resolveSectionParentId={resolveSectionParentId}
                getTemplateFlowEdges={getTemplateFlowEdges}
                nodeHeights={nodeHeights}
                setNodeHeightRef={setNodeHeightRef}
                moveCanvasDrag={moveCanvasDrag}
                stopCanvasDrag={stopCanvasDrag}
                startCanvasDrag={startCanvasDrag}
                updateSectionParent={updateSectionParent}
                sectionStats={sectionStats}
                auth={auth}
                joinOpSlot={joinOpSlot}
                signOffOpSlot={signOffOpSlot}
                setShowLoginPanel={setShowLoginPanel}
                flowLinkSource={flowLinkSource}
                addSectionQuick={addSectionQuick}
                clearTemplateFlowEdges={clearTemplateFlowEdges}
                resetTemplateCanvasLayout={resetTemplateCanvasLayout}
                handleFlowConnectorClick={handleFlowConnectorClick}
                updateSectionTitleLocal={updateSectionTitleLocal}
                updateSectionMeta={updateSectionMeta}
                updateOpSectionTitleLocal={updateOpSectionTitleLocal}
                deleteSection={deleteSection}
                handleSlotDragOver={handleSlotDragOver}
                handleSlotDrop={handleSlotDrop}
                handleSlotDragStart={handleSlotDragStart}
                setDraggedSlot={setDraggedSlot}
                updateSlot={updateSlot}
                flushSlotUpdate={flushSlotUpdate}
                deleteSlot={deleteSlot}
                addSlot={addSlot}
                dragSnapPreview={dragSnapPreview}
                autoLayoutTemplate={autoLayoutTemplate}
              />
            </section>
          ) : null}

          {isAdmin ? (
            <>

              {page === 'builder' && (
                <>
                  <section className="card">
                    <div className="builder-toolbar">
                      <button onClick={goToDashboard} className="secondary small">
                        Back to dashboard
                      </button>
                      <div>
                        <h3>Template selection</h3>
                        <p>Choose a template to edit and create new templates.</p>
                      </div>
                    </div>

                    <div className="template-builder-top">
                      <div className="template-list-builder">
                        <div className="template-builder-select" style={{display:'flex',alignItems:'center',gap:'0.5rem'}}>
                          <select
                            value={selectedTemplateId ?? ''}
                            onChange={(e) => setSelectedTemplateId(e.target.value ? Number(e.target.value) : null)}
                            style={{padding:'0.6rem',borderRadius:8,border:'1px solid var(--border)',background:'var(--panel)',color:'var(--text)'}}
                          >
                            <option value="">Choose template</option>
                            {templates.map((template) => (
                              <option key={template.id} value={template.id}>{template.name}</option>
                            ))}
                          </select>

                          <div style={{display:'flex',gap:'0.5rem'}}>
                            <button onClick={createTemplate}>New template</button>
                            <button className="secondary" onClick={renameTemplate} disabled={!selectedTemplateId}>
                              Rename
                            </button>
                            <button className="secondary" onClick={duplicateTemplate} disabled={!selectedTemplateId}>
                              Duplicate
                            </button>
                            <button className="secondary" onClick={() => selectedTemplateId && deleteTemplate(selectedTemplateId)} disabled={!selectedTemplateId}>
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </section>

                  <section className="card">
                    <div className="builder-toolbar">
                      <div>
                        <h3>Configure template</h3>
                        <p>Edit the selected template contents.</p>
                      </div>
                      <div className="builder-actions">
                        <button
                          type="button"
                          className={builderFlowMode ? '' : 'secondary'}
                          onClick={() => setBuilderFlowMode(true)}
                        >
                          Flow mode
                        </button>
                        <button
                          type="button"
                          className={!builderFlowMode ? '' : 'secondary'}
                          onClick={() => setBuilderFlowMode(false)}
                        >
                          Form mode
                        </button>
                      </div>
                    </div>

                    {selectedTemplateId ? (
                      templates.filter((template) => template.id === selectedTemplateId).map((template) => (
                        <OrbatTemplate
                          key={template.id}
                          template={template}
                          builderFlowMode={builderFlowMode}
                          builderCompact={builderCompact}
                          allRoles={allRoles}
                          nodeHeights={nodeHeights}
                          dragSnapPreview={dragSnapPreview}
                          flowLinkSource={flowLinkSource}
                          getCanvasSize={getCanvasSize}
                          getCanvasNode={getCanvasNode}
                          getTemplateFlowEdges={getTemplateFlowEdges}
                          addSectionQuick={addSectionQuick}
                          clearTemplateFlowEdges={clearTemplateFlowEdges}
                          resetTemplateCanvasLayout={resetTemplateCanvasLayout}
                          autoLayoutTemplate={autoLayoutTemplate}
                          moveCanvasDrag={moveCanvasDrag}
                          stopCanvasDrag={stopCanvasDrag}
                          startCanvasDrag={startCanvasDrag}
                          setNodeHeightRef={setNodeHeightRef}
                          handleFlowConnectorClick={handleFlowConnectorClick}
                          updateSectionTitleLocal={updateSectionTitleLocal}
                          updateSectionMeta={updateSectionMeta}
                          deleteSection={deleteSection}
                          handleSlotDragOver={handleSlotDragOver}
                          handleSlotDrop={handleSlotDrop}
                          handleSlotDragStart={handleSlotDragStart}
                          setDraggedSlot={setDraggedSlot}
                          updateSlot={updateSlot}
                          flushSlotUpdate={flushSlotUpdate}
                          deleteSlot={deleteSlot}
                          addSlot={addSlot}
                          isAdmin={isAdmin}
                          isMissionmaker={isMissionmaker}
                          uploadCustomMarker={uploadCustomMarker}
                        />
                      ))
                    ) : (
                      <div className="empty-state">Choose a template to edit first.</div>
                    )}
                  </section>
                </>
              )}

              {auth && page === 'players' && (
                <section className="card">
                  <div className="playerlist-toolbar">
                    <button onClick={goToDashboard} className="secondary small">
                      Back to dashboard
                    </button>
                    <div>
                      <h3>Player list</h3>
                      <p>Manage players, rank and permissions for each role.</p>
                    </div>
                  </div>

                  <section className="card player-section">
                    <h3>Create user</h3>
                    <form onSubmit={createUser} className="player-form">
                      <input
                        placeholder="Username"
                        value={userForm.username}
                        onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
                      />
                      <input
                        type="password"
                        placeholder="Password"
                        value={userForm.password}
                        onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                      />
                      <select value={userForm.rank} onChange={(e) => setUserForm({ ...userForm, rank: e.target.value ? Number(e.target.value) : '' })}>
                        <option value="">Select rank</option>
                        {ranks.map((r) => (
                          <option key={r.id} value={r.id}>{r.name}{r.short ? ` (${r.short})` : ''}</option>
                        ))}
                      </select>
                      <select value={userForm.status} onChange={(e) => setUserForm({ ...userForm, status: e.target.value })}>
                        <option value="Active">Active</option>
                        <option value="Inactive">Inactive</option>
                        <option value="LoA">LoA</option>
                      </select>
                      <label>
                        Admin status
                        <select value={userForm.role} onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}>
                          <option value="member">Member</option>
                          <option value="admin">Admin</option>
                          <option value="missionmaker">Missionmaker</option>
                        </select>
                      </label>
                      <button type="submit">Save</button>
                    </form>
                  </section>

                  <section className="card">
                    <h3>Permissions per player</h3>
                    {users.length === 0 ? (
                      <p>No players found. Add a new player using the form above.</p>
                    ) : (
                      <div className="player-table-wrapper">
                        <table className="player-table">
                          <thead>
                            <tr>
                              <th>Name</th>
                              <th>Rank</th>
                              <th>Status</th>
                              <th>Admin status</th>
                              <th>Roles</th>
                              <th>Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {users.map((user) => (
                              <tr key={user.id} className={user.status !== 'Active' ? 'inactive-row' : ''}>
                                <td>{user.username}</td>
                                <td>
                                  <select
                                    value={user.rank ?? ''}
                                    onChange={(e) => updateUserRank(user.id, e.target.value ? Number(e.target.value) : null)}
                                  >
                                    <option value="">Select rank</option>
                                    {ranks.map((r) => (
                                      <option key={r.id} value={r.id}>{r.name}{r.short ? ` (${r.short})` : ''}</option>
                                    ))}
                                  </select>
                                </td>
                                <td>{user.status || 'Active'}</td>
                                <td>
                                  <select
                                    value={user.role}
                                    onChange={(e) => updateUserRole(user.id, e.target.value)}
                                  >
                                    <option value="member">Member</option>
                                    <option value="admin">Admin</option>
                                    <option value="missionmaker">Missionmaker</option>
                                  </select>
                                </td>
                                <td>
                                  <div className="roles-cell">
                                    <button className="secondary small" onClick={() => openRoleModal(user)}>
                                      Roles
                                    </button>

                                    <div className="user-role-badges">
                                      {Object.entries(user.permissions || {})
                                          .filter(([, value]) => value)
                                          .slice(0, 2)
                                          .map(([role]) => (
                                              <span key={role} className="role-badge">
                                                {role}
                                              </span>
                                          ))}

                                      {Object.entries(user.permissions || {}).filter(([, value]) => value).length > 2 ? (
                                          <span className="role-badge role-badge-more">
                                            +{Object.entries(user.permissions || {}).filter(([, value]) => value).length - 2}
                                          </span>
                                      ) : null}
                                    </div>
                                  </div>
                                </td>
                                <td>
                                  <button className="secondary small" onClick={() => deleteUser(user.id)}>
                                    Delete
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    <p>Use the Roles button to manage role permissions for each player.</p>
                  </section>
                </section>
              )}

              {/* Roles and Ranks UI moved into Settings subtabs */}
            </>
          ) : null}

          {roleModalUser ? (
            <div className="modal-backdrop" role="dialog" aria-modal="true">
              <div className="role-modal">
                <h3>Manage roles for {roleModalUser.username}</h3>
                <div className="role-list" style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: '0.5rem' }}>
                  {permissionColumns.map((permission) => (
                      <label key={permission} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <input
                            type="checkbox"
                            checked={Boolean(roleModalPermissions[permission])}
                            onChange={() => toggleRoleModalPermission(permission)}
                        />
                        {permission}
                      </label>
                  ))}
                </div>
                <div className="role-modal-buttons">
                  <button className="secondary" onClick={closeRoleModal}>Close</button>
                  <button onClick={saveRoleModal}>Save</button>
                </div>
              </div>
            </div>
          ) : null}

        </div>
      </div>
    </div>
  );
}

export default App;
