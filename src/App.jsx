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
import Notifications from './Notifications';
import Training from './Training';
import apiFetch from './api';
import { getOrbatNodeHeight, ORBAT_NODE_WIDTH } from './orbatLayout';

const API = '/api';

// Template-builder canvas grid: one "unit" approximates a single slot row, so a squad
// with N slots naturally occupies roughly (2 + N) units tall (2 units for the header).
const CANVAS_GRID_UNIT = 40;
const snapToCanvasGrid = (value) => Math.round(value / CANVAS_GRID_UNIT) * CANVAS_GRID_UNIT;

const resolveTemplateId = (templateList, preferredId) => {
  const preferredTemplate = (templateList || []).find(
    (template) => String(template.id) === String(preferredId)
  );
  return preferredTemplate?.id ?? templateList?.[0]?.id ?? null;
};

const prepareSquadsForSave = (squads = []) => {
  let nextId = Date.now();
  const squadIds = new Map(squads.map((squad) => [String(squad.id), Number.isFinite(Number(squad.id)) ? Number(squad.id) : nextId++]));
  return squads.map(({ _pendingCreate, ...squad }) => ({
    ...squad,
    id: squadIds.get(String(squad.id)),
    parentId: squad.parentId == null ? null : (squadIds.get(String(squad.parentId)) ?? null),
    slots: (squad.slots || []).map(({ _pendingCreate: pendingCreate, _pendingUpdate, ...slot }) => ({
      ...slot,
      id: Number.isFinite(Number(slot.id)) ? Number(slot.id) : nextId++,
      squadId: squadIds.get(String(squad.id))
    }))
  }));
};

function App() {
  // Normalize op objects returned by different server paths (DB-backed repo vs file store)
  const normalizeOp = (raw) => {
    if (!raw) return raw;
    const op = { ...raw };
    // some endpoints return op.payload.squads (DB repo), others return op.squads
    op.squads = op.squads || op.sections || (op.payload && (op.payload.squads || op.payload.sections)) || [];
    op.absentUserIds = op.absentUserIds || op.payload?.absentUserIds || [];
    // unify template id key
    op.templateId = op.templateId ?? op.template_id ?? null;
    return op;
  };
  const [auth, setAuth] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [users, setUsers] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [ops, setOps] = useState([]);
  const [recurrences, setRecurrences] = useState([]);
  const [ranks, setRanks] = useState([]);
  const [squadTypes, setSquadTypes] = useState([]);
  const [permissionGroups, setPermissionGroups] = useState([]);
  const [permissionDefinitions, setPermissionDefinitions] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);
  const [schedulerLoadTemplateId, setSchedulerLoadTemplateId] = useState('');
  const [selectedOpId, setSelectedOpId] = useState(null);
  const [selectedRecurrenceId, setSelectedRecurrenceId] = useState(null);
  const [savingEditor, setSavingEditor] = useState(false);
  const [editorSaved, setEditorSaved] = useState(false);
  const editorSavedTimerRef = useRef(null);
  const [editorDirty, setEditorDirty] = useState(false);
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
  const [canvasExpansion, setCanvasExpansion] = useState({});
  const [canvasDrag, setCanvasDrag] = useState(null);
  const [dragSnapPreview, setDragSnapPreview] = useState(null);
  const [nodeHeights, setNodeHeights] = useState({});
  const nodeHeightRefCallbacks = useRef(new Map());
  const nodeHeightObservers = useRef(new Map());
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
  const updateSignupField = (field, value) => {
    setSignupForm((prev) => ({ ...prev, [field]: value }));
    setSignupErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };
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
      squads: template.squads || template.sections || []
    }));
    const resolvedDefaultTemplateId = resolveTemplateId(templateList, defaultOpSettings.templateId);
    setUsers(data.users || []);
    setTemplates(templateList);
    setOps((data.ops || []).map(normalizeOp));
    console.debug('[applyLoadedData] loaded ops count', (data.ops || []).length);
    setRecurrences(data.recurrences || []);
    setCampaigns(data.campaigns || []);
    setCustomRoles(data.customRoles || []);
    setPermissionGroups(data.permissionGroups || []);
    setPermissionDefinitions(data.permissionDefinitions || []);
    setAuth(nextAuth);
    setSelectedTemplateId(resolvedDefaultTemplateId);
    setSelectedOpId(null);
    const templateDefaults = templateList?.[0]?.defaultSettings || {};
    if (templateList?.[0]) {
      setDefaultOpSettings((current) => ({
        ...templateDefaults,
        ...current,
        templateId: resolveTemplateId(templateList, current.templateId)
      }));
    }
    setOpForm((prev) => ({ ...prev, templateId: resolvedDefaultTemplateId, campaignId: defaultOpSettings.campaignId || (data.campaigns && data.campaigns[0] ? data.campaigns[0].id : null) }));
    setPage(nextAuth && nextAuth.capabilities?.view_overview !== true ? 'profile' : 'overview');
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
      if (e?.status === 401) {
        setAuth(null);
        setShowLoginPanel(false);
        await loadPublicData();
        return;
      }
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

  const confirmEditorNavigation = () => !editorDirty || window.confirm('You have unsaved changes. Leave this page and discard them?');
  const leaveEditor = (callback) => {
    if (!confirmEditorNavigation()) return false;
    setEditorDirty(false);
    callback();
    return true;
  };

  useEffect(() => {
    const warnBeforeUnload = (event) => {
      if (!editorDirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [editorDirty]);

  useEffect(() => () => {
    if (editorSavedTimerRef.current) window.clearTimeout(editorSavedTimerRef.current);
  }, []);

  const showEditorSaved = () => {
    setEditorSaved(true);
    if (editorSavedTimerRef.current) window.clearTimeout(editorSavedTimerRef.current);
    editorSavedTimerRef.current = window.setTimeout(() => {
      setEditorSaved(false);
      editorSavedTimerRef.current = null;
    }, 5000);
  };

  const goToOverview = () => leaveEditor(() => setPage('overview'));
  const goToScheduler = () => leaveEditor(() => setPage('scheduler'));
  const goToBuilder = () => leaveEditor(() => setPage('builder'));
  const goToRoles = () => leaveEditor(() => { setSettingsInitialSubpage('roles'); setPage('settings'); });
  const goToPlayers = () => leaveEditor(() => setPage('players'));
  const goToRanks = () => leaveEditor(() => { setSettingsInitialSubpage('ranks'); setPage('settings'); });
  const goToDashboard = () => leaveEditor(() => setPage('overview'));
  const goToSettings = () => leaveEditor(() => setPage('settings'));
  const goToCampaigns = () => leaveEditor(() => setPage('campaigns'));
  const showOpOnDashboard = (opId) => {
    leaveEditor(() => { setSelectedOpId(opId); setPage('overview'); });
  };
  const showOpInScheduler = (opId, recurrenceId = null) => {
    if (!confirmEditorNavigation()) return;
    setEditorDirty(false);
    const operation = ops.find((op) => op.id === opId);
    const hasOperationHierarchy = Object.prototype.hasOwnProperty.call(flowEdges || {}, opId);
    if (operation && !hasOperationHierarchy) {
      // Upgrade operations created before operation-specific canvas copies existed.
      copyTemplateCanvasToOperation(operation.templateId, operation);
    }
    setSelectedOpId(opId);
    setSelectedRecurrenceId(recurrenceId);
    setPage('op-detail');
  };
  const goToSchedulerList = () => {
    if (!confirmEditorNavigation()) return;
    setEditorDirty(false);
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
    (async () => {
      try {
        const data = await apiFetch('/squad-types');
        setSquadTypes(data.squadTypes || []);
      } catch (e) {
        console.error('loadSquadTypes error', e);
      }
    })();
  }, []);

  useEffect(() => {
    if (templates.length > 0) {
      setOpForm((prev) => ({
        ...prev,
        templateId: resolveTemplateId(templates, prev.templateId || defaultOpSettings.templateId),
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
        setSignupErrors({});
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
    const tempTemplate = { id: tempId, name, squads: [], _pendingCreate: true };
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
    const tempTemplate = { id: tempId, name, squads: [], _pendingCreate: true };
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
      const tplId = resolveTemplateId(templates, defaultOpSettings.templateId);
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
        const op = normalizeOp(data.op);
        setOps((prev) => [...prev, op]);
        copyTemplateCanvasToOperation(tplId, op);
        if (data.recurrence) setRecurrences((prev) => [...prev, data.recurrence]);
        // open the newly created op in the scheduler/detail view
        showOpInScheduler(op.id, data.recurrence ? data.recurrence.id : null);
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
    if (page === 'scheduler-detail' || page === 'op-detail') {
      setEditorDirty(true);
      setRecurrences((prev) => prev.map((rec) => (rec.id === recurrenceId ? { ...rec, ...updates } : rec)));
      return;
    }
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
        squads: (op.squads || []).map((squad) => ({
          ...squad,
          slots: squad.slots.map((slot) => (slot.id === slotId ? { ...slot, assignedUserId: userId || auth.id, _pendingUpdate: true } : slot))
        }))
      };
    }));

    try {
      const token = localStorage.getItem('token');
      const canAssignOthers = auth?.capabilities?.assign_players === true;
      const body = userId && canAssignOthers ? { slotId, userId } : { slotId };
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
        const op = normalizeOp(data.op);
        setOps((prev) => prev.map((opItem) => (opItem.id === op.id ? op : opItem)));
      } else {
        throw new Error(data.error || 'Could not update slot');
      }
    } catch (err) {
      console.error('[joinOpSlot] error', err);
      alert(err.message || 'Could not update slot');
      setOps(prevOps);
    }
  };

  const signOffOpSlot = async (opId, slotId, force = false) => {
    if (!auth) return;
    console.debug('[signOffOpSlot] start', { opId, slotId, userId: auth?.id });
    const prevOps = ops;
    // optimistic local update: clear assignment
    setOps((prev) => prev.map((op) => {
      if (op.id !== opId) return op;
      return {
        ...op,
        squads: (op.squads || []).map((squad) => ({
          ...squad,
          slots: squad.slots.map((slot) => (slot.id === slotId ? { ...slot, assignedUserId: null, _pendingUpdate: true } : slot))
        }))
      };
    }));

    try {
      const token = localStorage.getItem('token');
      const body = force && auth?.capabilities?.assign_players === true ? { slotId, force: true } : { slotId };
      console.debug('[signOffOpSlot] sending request', { url: `${API}/ops/${opId}/signoff`, body });
      const res = await fetch(`${API}/ops/${opId}/signoff`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      console.debug('[signOffOpSlot] response', { status: res.status, data });
      if (data.op) {
        const op = normalizeOp(data.op);
        setOps((prev) => prev.map((opItem) => (opItem.id === op.id ? op : opItem)));
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
        squads: (op.squads || []).map((squad) => ({
          ...squad,
          slots: squad.slots.map((slot) => (slot.id === slotId ? { ...slot, ...updates, _pendingUpdate: true } : slot))
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
        const op = normalizeOp(data.op);
        setOps((prev) => prev.map((opItem) => (opItem.id === op.id ? op : opItem)));
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
        squads: (op.squads || []).map((squad) => ({
          ...squad,
          slots: (squad.slots || []).map((slot) => (slot.id === slotId ? { ...slot, ...updates } : slot))
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
    if (page === 'scheduler-detail' || page === 'op-detail') {
      setEditorDirty(true);
      applyOpSlotUpdatesLocally(opId, slotId, updates);
      return;
    }
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
    if (page === 'scheduler-detail' || page === 'op-detail') {
      setEditorDirty(true);
      setOps((prev) => prev.map((op) => (op.id === opId ? { ...op, ...updates } : op)));
      return;
    }
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
      const op = normalizeOp(data.op);
      setOps((prev) => prev.map((opItem) => (opItem.id === op.id ? op : opItem)));
    } else {
      alert(data.error || 'Could not update operation');
    }
  };

  const updateOpSquadMeta = async (opId, squadId, updates) => {
    if (page === 'scheduler-detail' || page === 'op-detail') {
      setEditorDirty(true);
      const currentSquads = ops.find((op) => op.id === opId)?.squads || [];
      const nextSquads = currentSquads.map((squad) => squad.id === squadId ? { ...squad, ...updates } : squad);
      setOps((prev) => prev.map((op) => op.id !== opId ? op : { ...op, squads: nextSquads }));
      if (typeof updates?.active === 'boolean') window.setTimeout(() => alignInactiveSquads(opId, nextSquads), 0);
      return;
    }
    const isActiveToggle = typeof updates?.active === 'boolean';
    const previousActive = isActiveToggle
      ? ops.find((op) => op.id === opId)?.squads?.find((squad) => squad.id === squadId)?.active !== false
      : null;
    if (isActiveToggle) {
      const layoutSquads = (ops.find((op) => op.id === opId)?.squads || []).map((squad) => (
        squad.id === squadId ? { ...squad, active: updates.active } : squad
      ));
      setOps((prev) => prev.map((op) => (op.id !== opId ? op : {
        ...op,
        squads: (op.squads || []).map((squad) => (
          squad.id === squadId ? { ...squad, active: updates.active } : squad
        ))
      })));
      window.setTimeout(() => autoLayoutTemplate(opId, layoutSquads), 0);
    }

    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${API}/ops/${opId}/squads/${squadId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(updates)
      });
      const data = await res.json();
      if (!res.ok || !data.op) throw new Error(data.error || 'Could not update squad');
      const op = normalizeOp(data.op);
      setOps((prev) => prev.map((opItem) => (opItem.id === op.id ? op : opItem)));
    } catch (error) {
      if (isActiveToggle) {
        setOps((prev) => prev.map((op) => (op.id !== opId ? op : {
          ...op,
          squads: (op.squads || []).map((squad) => (
            squad.id === squadId ? { ...squad, active: previousActive } : squad
          ))
        })));
      }
      alert(error.message || 'Could not update squad');
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

    if (page === 'scheduler-detail' || page === 'op-detail') {
      setEditorDirty(true);
      const source = templates.find((template) => template.id === templateId);
      if (!source) return;
      setOps((prev) => prev.map((op) => op.id !== opId ? op : {
        ...op,
        templateId,
        squads: structuredClone(source.squads || [])
      }));
      copyTemplateCanvasToOperation(templateId, { id: opId, squads: source.squads || [] });
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
      const op = normalizeOp(data.op);
      setOps((prev) => prev.map((opItem) => (opItem.id === op.id ? op : opItem)));
      copyTemplateCanvasToOperation(templateId || op.templateId, op);
    } else {
      alert(data.error || 'Could not reload template into operation');
    }
  };

  const addSquad = async (templateId) => {
    const title = prompt('Squad title');
    if (!title) return;
    const tempId = `tmp-squad-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const tempSquad = { id: tempId, title, slots: [], _pendingCreate: true };
    setTemplates((prev) => prev.map((template) => {
      if (template.id !== templateId) return template;
      return { ...template, squads: [...template.squads, tempSquad] };
    }));

    if (page === 'builder') { setEditorDirty(true); return; }

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API}/templates/${templateId}/squads`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ title })
      });

      // parse response defensively: server may return non-JSON (HTML/error page)
      let data = null;
      const text = await res.text().catch(() => null);
      if (text) {
        try { data = JSON.parse(text); } catch (e) { /* non-JSON response */ }
      }

      if (res.status === 401) {
        const msg = data?.error || text || 'Login expired, please log in again';
        throw new Error(msg);
      }

      if (data && data.squad) {
        setTemplates((prev) => prev.map((template) => {
          if (template.id !== templateId) return template;
          return { ...template, squads: template.squads.map((s) => (s.id === tempId ? data.squad : s)) };
        }));
      } else {
        const msg = data?.error || text || `Could not add squad (status ${res.status})`;
        throw new Error(msg);
      }
    } catch (err) {
      alert(err.message || 'Could not add squad');
      setTemplates((prev) => prev.map((template) => {
        if (template.id !== templateId) return template;
        return { ...template, squads: template.squads.filter((s) => s.id !== tempId) };
      }));
      if (err.message?.toLowerCase().includes('log in again')) logout();
    }
  };

  const addSquadQuick = async (templateId, currentSquadCount) => {
    const title = `Squad ${currentSquadCount + 1}`;
    const tempId = `tmp-squad-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const tempSquad = { id: tempId, title, slots: [], _pendingCreate: true };
    setTemplates((prev) => prev.map((template) => {
      if (template.id !== templateId) return template;
      return { ...template, squads: [...template.squads, tempSquad] };
    }));
    if (page === 'builder') { setEditorDirty(true); return; }

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API}/templates/${templateId}/squads`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ title })
      });

      let data = null;
      const text = await res.text().catch(() => null);
      if (text) {
        try { data = JSON.parse(text); } catch (e) { /* non-JSON response */ }
      }

      if (data && data.squad) {
        setTemplates((prev) => prev.map((template) => {
          if (template.id !== templateId) return template;
          return { ...template, squads: template.squads.map((s) => (s.id === tempId ? data.squad : s)) };
        }));
      } else if (res.status === 401) {
        const msg = data?.error || text || 'Login expired, please log in again';
        throw new Error(msg);
      } else {
        const msg = data?.error || text || `Could not add squad (status ${res.status})`;
        throw new Error(msg);
      }
    } catch (err) {
      alert(err.message || 'Could not add squad');
      setTemplates((prev) => prev.map((template) => {
        if (template.id !== templateId) return template;
        return { ...template, squads: template.squads.filter((s) => s.id !== tempId) };
      }));
      if (err.message?.toLowerCase().includes('log in again')) {
        logout();
      }
    }
  };

  const addOpSquad = async (opId, currentSquadCount) => {
    const title = `Squad ${currentSquadCount + 1}`;
    const tempId = `tmp-squad-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const tempSquad = { id: tempId, title, slots: [], _pendingCreate: true };

    // optimistic local update on ops
    const prevOps = ops;
    setOps((prev) => prev.map((op) => (op.id !== opId ? op : { ...op, squads: [...(op.squads || []), tempSquad] })));

    if (page === 'scheduler-detail' || page === 'op-detail') { setEditorDirty(true); return; }

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API}/ops/${opId}/squads`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ title })
      });

      let data = null;
      const text = await res.text().catch(() => null);
      if (text) {
        try { data = JSON.parse(text); } catch (e) { /* non-JSON response */ }
      }

      if (data && data.op) {
        const op = normalizeOp(data.op);
        setOps((prev) => prev.map((opItem) => (opItem.id === op.id ? op : opItem)));
      } else {
        const msg = data?.error || text || `Could not add squad (status ${res.status})`;
        throw new Error(msg);
      }
    } catch (err) {
      alert(err.message || 'Could not add squad');
      setOps(prevOps);
      if (err.message?.toLowerCase().includes('log in again')) logout();
    }
  };

  const renameSquad = async (templateId, squadId, currentTitle) => {
    const title = prompt('Squad title', currentTitle);
    if (!title || title === currentTitle) return;
    // optimistic local update
    setTemplates((prev) => prev.map((template) => {
      if (template.id !== templateId) return template;
      return { ...template, squads: template.squads.map((squad) => (squad.id === squadId ? { ...squad, title } : squad)) };
    }));
    setOps((prev) => prev.map((op) => {
      if (Number(op.templateId) !== Number(templateId)) return op;
      return { ...op, squads: (op.squads || []).map((squad) => (squad.id === squadId ? { ...squad, title } : squad)) };
    }));
    setRecurrences((prev) => prev.map((recurrence) => {
      if (Number(recurrence.templateId) !== Number(templateId)) return recurrence;
      return { ...recurrence, squads: (recurrence.squads || []).map((squad) => (squad.id === squadId ? { ...squad, title } : squad)) };
    }));

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API}/templates/${templateId}/squads/${squadId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ title })
      });
      const data = await res.json();
      if (data.squad) {
        setTemplates((prev) => prev.map((template) => {
          if (template.id !== templateId) return template;
          return {
            ...template,
            squads: template.squads.map((squad) => (squad.id === data.squad.id ? data.squad : squad))
          };
        }));
      } else {
        throw new Error(data.error || 'Could not rename squad');
      }
    } catch (err) {
      alert(err.message || 'Could not rename squad');
      // revert by reloading authoritative data
      loadPrivateData();
    }
  };

  const updateSquadMeta = async (templateId, squadId, updates) => {
    if (page === 'builder') {
      setEditorDirty(true);
      const currentSquads = templates.find((template) => template.id === templateId)?.squads || [];
      const nextSquads = currentSquads.map((squad) => squad.id === squadId ? { ...squad, ...updates } : squad);
      setTemplates((prev) => prev.map((template) => template.id !== templateId ? template : { ...template, squads: nextSquads }));
      if (typeof updates?.active === 'boolean') window.setTimeout(() => alignInactiveSquads(templateId, nextSquads), 0);
      return;
    }
    const isActiveToggle = typeof updates?.active === 'boolean';
    const previousActive = isActiveToggle
      ? templates.find((template) => template.id === templateId)?.squads?.find((squad) => squad.id === squadId)?.active !== false
      : null;
    if (isActiveToggle) {
      const layoutSquads = (templates.find((template) => template.id === templateId)?.squads || []).map((squad) => (
        squad.id === squadId ? { ...squad, active: updates.active } : squad
      ));
      setTemplates((prev) => prev.map((template) => (template.id !== templateId ? template : {
        ...template,
        squads: template.squads.map((squad) => (
          squad.id === squadId ? { ...squad, active: updates.active } : squad
        ))
      })));
      window.setTimeout(() => autoLayoutTemplate(templateId, layoutSquads), 0);
    }

    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${API}/templates/${templateId}/squads/${squadId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(updates)
      });
      const data = await res.json();
      if (!res.ok || !data.squad) throw new Error(data.error || 'Could not update squad');
      setTemplates((prev) => prev.map((template) => {
        if (template.id !== templateId) return template;
        return {
          ...template,
          squads: template.squads.map((squad) => (squad.id === data.squad.id ? data.squad : squad))
        };
      }));
    } catch (error) {
      if (isActiveToggle) {
        setTemplates((prev) => prev.map((template) => (template.id !== templateId ? template : {
          ...template,
          squads: template.squads.map((squad) => (
            squad.id === squadId ? { ...squad, active: previousActive } : squad
          ))
        })));
      }
      alert(error.message || 'Could not update squad');
    }
  };

  const updateSquadTitleLocal = (templateId, squadId, title) => {
    if (page === 'builder') setEditorDirty(true);
    setTemplates((prev) => prev.map((template) => {
      if (template.id !== templateId) return template;
      return {
        ...template,
        squads: template.squads.map((squad) => (squad.id === squadId ? { ...squad, title } : squad))
      };
    }));
  };

  const updateOpSquadTitleLocal = (opId, squadId, title) => {
    if (page === 'scheduler-detail' || page === 'op-detail') setEditorDirty(true);
    setOps((prev) => prev.map((op) => {
      if (op.id !== opId) return op;
      return {
        ...op,
        squads: (op.squads || []).map((squad) => (squad.id === squadId ? { ...squad, title } : squad))
      };
    }));
  };

  const deleteSquad = async (templateId, squadId) => {
    if (!window.confirm('Are you sure you want to delete this squad?')) return;
    // determine whether this id belongs to a template or an op
    const isTemplate = templates.some((t) => String(t.id) === String(templateId));

    if (page === 'builder' || page === 'scheduler-detail' || page === 'op-detail') {
      setEditorDirty(true);
      if (isTemplate) setTemplates((prev) => prev.map((template) => String(template.id) !== String(templateId) ? template : { ...template, squads: template.squads.filter((squad) => squad.id !== squadId) }));
      else setOps((prev) => prev.map((op) => String(op.id) !== String(templateId) ? op : { ...op, squads: (op.squads || []).filter((squad) => squad.id !== squadId) }));
      return;
    }

    // If squadId is a temporary id (client-only), just remove locally and return
    if (Number.isNaN(Number(squadId))) {
      if (isTemplate) {
        setTemplates((prev) => prev.map((template) => {
          if (String(template.id) !== String(templateId)) return template;
          return { ...template, squads: template.squads.filter((squad) => squad.id !== squadId) };
        }));
      } else {
        setOps((prev) => prev.map((op) => {
          if (String(op.id) !== String(templateId)) return op;
          return { ...op, squads: (op.squads || []).filter((squad) => squad.id !== squadId) };
        }));
      }
      return;
    }

    if (isTemplate) {
      // optimistic: remove locally first
      const prevTemplates = templates;
      setTemplates((prev) => prev.map((template) => {
        if (String(template.id) !== String(templateId)) return template;
        return { ...template, squads: template.squads.filter((squad) => squad.id !== Number(squadId)) };
      }));

      try {
        const token = localStorage.getItem('token');
        console.debug('Deleting template squad', { templateId, squadId });
        const res = await fetch(`${API}/templates/${templateId}/squads/${squadId}`, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
        if (!res.ok) {
          let msg = `Could not delete squad (status ${res.status})`;
          try {
            const text = await res.text();
            console.error('Delete squad failed', res.status, text);
            const data = JSON.parse(text || '{}');
            if (res.status === 401) {
              msg = data.error || 'Login expired, please log in again';
              throw new Error(msg);
            }
            msg = data.error || msg;
          } catch (e) {
            console.error('Error reading delete squad response', e);
          }
          throw new Error(msg);
        }
        console.debug('Delete squad response ok', res.status);
      } catch (err) {
        alert(err.message || 'Could not delete squad');
        // revert
        setTemplates(prevTemplates);
        if (err.message?.toLowerCase().includes('log in again')) logout();
      }
    } else {
      // deleting a squad from an operation (scheduler)
      const prevOps = ops;
      setOps((prev) => prev.map((op) => {
        if (String(op.id) !== String(templateId)) return op;
        return { ...op, squads: (op.squads || []).filter((squad) => squad.id !== Number(squadId)) };
      }));

      try {
        const token = localStorage.getItem('token');
        console.debug('Deleting op squad', { opId: templateId, squadId });
        const res = await fetch(`${API}/ops/${templateId}/squads/${squadId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` }
        });

        // prefer JSON response with updated op; tolerate 204/no body
        if (res.status === 204) return;
        let data = null;
        const text = await res.text().catch(() => null);
        if (text) {
          try { data = JSON.parse(text); } catch (e) { /* ignore */ }
        }
        if (data && data.op) {
          const op = normalizeOp(data.op);
          setOps((prev) => prev.map((opItem) => (String(opItem.id) === String(op.id) ? op : opItem)));
        } else if (!res.ok) {
          const msg = data?.error || text || `Could not delete squad (status ${res.status})`;
          throw new Error(msg);
        }
      } catch (err) {
        alert(err.message || 'Could not delete squad');
        setOps(prevOps);
        if (err.message?.toLowerCase().includes('log in again')) logout();
      }
    }
  };

  const addSlot = async (templateId, squadId) => {
    const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const roleForNew = defaultOpSettings.defaultSlotRole || 'Rifleman';
    const tempSlot = {
      id: tempId,
      squadId,
      name: roleForNew,
      role: roleForNew,
      allowedRoles: [],
      notes: '',
      assignedUserId: null,
      _pendingCreate: true
    };

    if (page === 'scheduler-detail' || page === 'op-detail') {
      setEditorDirty(true);
      setOps((prev) => prev.map((op) => op.id !== templateId ? op : { ...op, squads: (op.squads || []).map((squad) => squad.id !== squadId ? squad : { ...squad, slots: [...(squad.slots || []), tempSlot] }) }));
      return;
    }

    setTemplates((prev) => prev.map((template) => {
      if (template.id !== templateId) return template;
      return {
        ...template,
        squads: template.squads.map((squad) => {
          if (squad.id !== squadId) return squad;
          return { ...squad, slots: [...squad.slots, tempSlot] };
        })
      };
    }));

    // If squadId is temporary (not yet persisted), don't attempt server call.
    if (Number.isNaN(Number(squadId))) {
      alert('Squad not yet saved. Please wait for the squad to be created before adding slots.');
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
        squadId: Number(squadId),
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
          squads: template.squads.map((squad) => {
            if (squad.id !== squadId) return squad;
            return { ...squad, slots: squad.slots.filter((s) => s.id !== tempId) };
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
          squads: template.squads.map((squad) => {
            if (squad.id !== squadId) return squad;
            return { ...squad, slots: squad.slots.filter((s) => s.id !== tempId) };
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
          squads: template.squads.map((squad) => {
            if (squad.id !== squadId) return squad;
            return { ...squad, slots: squad.slots.filter((s) => s.id !== tempId) };
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
          squads: template.squads.map((squad) => {
            if (squad.id !== squadId) return squad;
            return {
              ...squad,
              slots: squad.slots.map((slot) => (slot.id === tempId ? data.slot : slot))
            };
          })
        };
      }));
    } else {
      setTemplates((prev) => prev.map((template) => {
        if (template.id !== templateId) return template;
        return {
          ...template,
          squads: template.squads.map((squad) => {
            if (squad.id !== squadId) return squad;
            return { ...squad, slots: squad.slots.filter((slot) => slot.id !== tempId) };
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
        squads: template.squads.map((squad) => ({
          ...squad,
          slots: squad.slots.map((slot) => (slot.id === slotId ? { ...slot, ...updates } : slot))
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
          squads: template.squads.map((squad) => ({
            ...squad,
            slots: squad.slots.map((slot) => (slot.id === data.slot.id ? data.slot : slot))
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
    if (page === 'builder') {
      setEditorDirty(true);
      applySlotUpdatesLocally(templateId, slotId, updates);
      return;
    }
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

    if (page === 'builder' || page === 'scheduler-detail' || page === 'op-detail') {
      setEditorDirty(true);
      const updateSquads = (squads = []) => squads.map((squad) => ({ ...squad, slots: (squad.slots || []).filter((slot) => slot.id !== slotId) }));
      if (page === 'builder') setTemplates((prev) => prev.map((template) => template.id === templateId ? { ...template, squads: updateSquads(template.squads) } : template));
      else setOps((prev) => prev.map((op) => op.id === templateId ? { ...op, squads: updateSquads(op.squads) } : op));
      return;
    }

    if (Number.isNaN(Number(slotId))) {
      setTemplates((prev) => prev.map((template) => {
        if (template.id !== templateId) return template;
        return {
          ...template,
          squads: template.squads.map((squad) => ({
            ...squad,
            slots: squad.slots.filter((slot) => slot.id !== slotId)
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
        squads: template.squads.map((squad) => ({
          ...squad,
          slots: squad.slots.filter((slot) => slot.id !== slotId)
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

  const reorderTemplateSlots = async (templateId, squadId, slotIds) => {
    if (page === 'builder' || page === 'scheduler-detail' || page === 'op-detail') { setEditorDirty(true); return; }
    const token = localStorage.getItem('token');
    const res = await fetch(`${API}/templates/${templateId}/squads/${squadId}/slots/reorder`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ slotIds })
    });

    const data = await res.json();
    if (data.squad) {
      setTemplates((prev) => prev.map((template) => {
        if (template.id !== templateId) return template;
        return {
          ...template,
          squads: template.squads.map((squad) => (squad.id === squadId ? data.squad : squad))
        };
      }));
    } else {
      alert(data.error || 'Could not reorder slots');
      loadPrivateData();
    }
  };

  const moveTemplateSlot = (templateId, squadId, fromSlotId, toSlotId) => {
    if (!fromSlotId || !toSlotId || fromSlotId === toSlotId) return;

    const template = templates.find((item) => item.id === templateId);
    const squad = template?.squads?.find((item) => item.id === squadId);
    const slots = squad?.slots || [];
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
        squads: item.squads.map((itemSquad) => (
          itemSquad.id === squadId ? { ...itemSquad, slots: reordered } : itemSquad
        ))
      };
    }));

    reorderTemplateSlots(templateId, squadId, reordered.map((slot) => slot.id));
  };

  const handleSlotDragStart = (templateId, squadId, slotId, event) => {
    event.stopPropagation();
    setDraggedSlot({ templateId, squadId, slotId });
  };

  const handleSlotDragOver = (templateId, squadId, event) => {
    if (!draggedSlot) return;
    if (draggedSlot.templateId !== templateId || draggedSlot.squadId !== squadId) return;
    event.preventDefault();
  };

  const handleSlotDrop = (templateId, squadId, targetSlotId, event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!draggedSlot) return;
    if (draggedSlot.templateId !== templateId || draggedSlot.squadId !== squadId) return;

    moveTemplateSlot(templateId, squadId, draggedSlot.slotId, targetSlotId);
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
        squads: template.squads.map((squad) => ({
          ...squad,
          slots: squad.slots.map((slot) => (slot.id === slotId ? { ...slot, assignedUserId: auth.id, _pendingUpdate: true } : slot))
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
            squads: template.squads.map((squad) => ({
              ...squad,
              slots: squad.slots.map((slot) => (slot.id === data.slot.id ? data.slot : slot))
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
  const can = (capability) => {
    if (!auth) return false;
    // Backwards compatibility for admin JWT/session data created before
    // database-backed capabilities were introduced. Once capabilities are
    // loaded, the configured permission group remains authoritative.
    if (!auth.capabilities && auth.role === 'admin') return true;
    return auth.capabilities?.[capability] === true;
  };
  const effectiveOverviewMode = overviewMode === 'orbat' && isNarrowViewport ? 'cards' : overviewMode;
  const isWideCanvasPage = page === 'builder' || (page === 'overview' && effectiveOverviewMode === 'orbat');

  const normalizeRoleKey = (role) => role?.trim().toLowerCase();

  const selectedOp = useMemo(() => ops.find((op) => op.id === selectedOpId), [ops, selectedOpId]);

  const saveTemplateDraft = async () => {
    const template = templates.find((item) => item.id === selectedTemplateId);
    if (!template || savingEditor) return;
    setSavingEditor(true);
    try {
      const savedSquads = prepareSquadsForSave(template.squads);
      const res = await fetch(`${API}/templates/${template.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ name: template.name, squads: savedSquads })
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Could not save template');
      const savedIdByDraftId = new Map((template.squads || []).map((squad, index) => [String(squad.id), savedSquads[index]?.id]));
      setCanvasLayout((prev) => {
        const migrated = {};
        Object.entries(prev?.[template.id] || {}).forEach(([squadId, node]) => {
          const savedId = savedIdByDraftId.get(String(squadId)) ?? squadId;
          migrated[savedId] = { ...node, parentId: node.parentId == null ? null : (savedIdByDraftId.get(String(node.parentId)) ?? node.parentId) };
        });
        return { ...prev, [template.id]: migrated };
      });
      setFlowEdges((prev) => ({ ...prev, [template.id]: (prev?.[template.id] || []).map((edge) => ({
        ...edge,
        sourceId: savedIdByDraftId.get(String(edge.sourceId)) ?? edge.sourceId,
        targetId: savedIdByDraftId.get(String(edge.targetId)) ?? edge.targetId
      })) }));
      setTemplates((prev) => prev.map((item) => item.id === template.id ? { ...item, squads: savedSquads } : item));
      window.setTimeout(() => alignInactiveSquads(template.id, savedSquads), 0);
      setEditorDirty(false);
      showEditorSaved();
    } catch (error) {
      alert(error.message || 'Could not save template');
    } finally {
      setSavingEditor(false);
    }
  };

  const toggleOpAbsence = async (opId) => {
    if (!auth) return;
    const previousOps = ops;
    const operation = ops.find((op) => op.id === opId);
    const currentlyAbsent = (operation?.absentUserIds || []).some((id) => String(id) === String(auth.id));
    setOps((current) => current.map((op) => op.id === opId ? {
      ...op,
      absentUserIds: currentlyAbsent
        ? (op.absentUserIds || []).filter((id) => String(id) !== String(auth.id))
        : [...(op.absentUserIds || []), auth.id],
      squads: currentlyAbsent ? op.squads : (op.squads || []).map((squad) => ({
        ...squad,
        slots: (squad.slots || []).map((slot) => String(slot.assignedUserId) === String(auth.id) ? { ...slot, assignedUserId: null } : slot)
      }))
    } : op));
    try {
      const res = await fetch(`${API}/ops/${opId}/absence`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ absent: !currentlyAbsent })
      });
      const data = await res.json();
      if (!res.ok || !data.op) throw new Error(data.error || 'Could not update absence');
      const updated = normalizeOp(data.op);
      setOps((current) => current.map((op) => op.id === updated.id ? updated : op));
    } catch (error) {
      setOps(previousOps);
      alert(error.message || 'Could not update absence');
    }
  };

  const toggleRecurrenceAbsence = async (recurrenceId) => {
    if (!auth) return;
    const previousRecurrences = recurrences;
    const recurrence = recurrences.find((item) => item.id === recurrenceId);
    const absentIds = recurrence?.absentUserIds || recurrence?.rule?.absentUserIds || [];
    const currentlyAbsent = absentIds.some((id) => String(id) === String(auth.id));
    setRecurrences((current) => current.map((item) => item.id === recurrenceId ? {
      ...item,
      rule: {
        ...(item.rule || {}),
        absentUserIds: currentlyAbsent
          ? absentIds.filter((id) => String(id) !== String(auth.id))
          : [...absentIds, auth.id]
      }
    } : item));
    try {
      const res = await fetch(`${API}/recurrences/${recurrenceId}/absence`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ absent: !currentlyAbsent })
      });
      const data = await res.json();
      if (!res.ok || !data.recurrence) throw new Error(data.error || 'Could not update recurring absence');
      setRecurrences((current) => current.map((item) => item.id === recurrenceId ? { ...item, ...data.recurrence } : item));
    } catch (error) {
      setRecurrences(previousRecurrences);
      alert(error.message || 'Could not update recurring absence');
    }
  };

  const loadNotifications = async ({ quiet = false } = {}) => {
    const token = localStorage.getItem('token');
    if (!token) return;
    if (!quiet) setNotificationsLoading(true);
    try {
      const data = await apiFetch('/notifications', { headers: { Authorization: `Bearer ${token}` } });
      setNotifications(data.notifications || []);
    } catch (error) {
      if (error?.status !== 401) console.error('loadNotifications error', error);
    } finally {
      if (!quiet) setNotificationsLoading(false);
    }
  };

  const markNotificationRead = async (id) => {
    setNotifications((current) => current.map((item) => item.id === id ? { ...item, readAt: new Date().toISOString() } : item));
    await apiFetch(`/notifications/${id}/read`, { method: 'PUT', headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
  };

  const markAllNotificationsRead = async () => {
    const readAt = new Date().toISOString();
    setNotifications((current) => current.map((item) => ({ ...item, readAt: item.readAt || readAt })));
    await apiFetch('/notifications/read-all', { method: 'PUT', headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
  };

  useEffect(() => {
    if (!auth) { setNotifications([]); setNotificationsOpen(false); return undefined; }
    loadNotifications();
    const interval = window.setInterval(() => loadNotifications({ quiet: true }), 30000);
    return () => window.clearInterval(interval);
  }, [auth?.id]);

  const saveOperationDraft = async () => {
    if (!selectedOp || savingEditor) return;
    setSavingEditor(true);
    try {
      const savedSquads = prepareSquadsForSave(selectedOp.squads);
      const opRes = await fetch(`${API}/ops/${selectedOp.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({
          serverName: selectedOp.serverName || '',
          tsAddress: selectedOp.tsAddress || '',
          campaignId: selectedOp.campaignId ?? null,
          squads: savedSquads
        })
      });
      if (!opRes.ok) throw new Error((await opRes.json().catch(() => ({}))).error || 'Could not save operation');
      const savedIdByDraftId = new Map((selectedOp.squads || []).map((squad, index) => [String(squad.id), savedSquads[index]?.id]));
      setCanvasLayout((prev) => {
        const migrated = {};
        Object.entries(prev?.[selectedOp.id] || {}).forEach(([squadId, node]) => {
          const savedId = savedIdByDraftId.get(String(squadId)) ?? squadId;
          migrated[savedId] = { ...node, parentId: node.parentId == null ? null : (savedIdByDraftId.get(String(node.parentId)) ?? node.parentId) };
        });
        return { ...prev, [selectedOp.id]: migrated };
      });
      setFlowEdges((prev) => ({ ...prev, [selectedOp.id]: (prev?.[selectedOp.id] || []).map((edge) => ({
        ...edge,
        sourceId: savedIdByDraftId.get(String(edge.sourceId)) ?? edge.sourceId,
        targetId: savedIdByDraftId.get(String(edge.targetId)) ?? edge.targetId
      })) }));
      setOps((prev) => prev.map((item) => item.id === selectedOp.id ? { ...item, squads: savedSquads } : item));
      window.setTimeout(() => alignInactiveSquads(selectedOp.id, savedSquads), 0);
      const recurrence = selectedRecurrenceId ? recurrences.find((item) => item.id === selectedRecurrenceId) : null;
      if (recurrence) {
        const recurrenceRes = await fetch(`${API}/recurrences/${recurrence.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
          body: JSON.stringify(recurrence)
        });
        if (!recurrenceRes.ok) throw new Error((await recurrenceRes.json().catch(() => ({}))).error || 'Could not save recurrence');
      }
      setEditorDirty(false);
      showEditorSaved();
    } catch (error) {
      alert(error.message || 'Could not save operation');
    } finally {
      setSavingEditor(false);
    }
  };
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

  const squadStats = (squad) => {
    const total = squad?.slots?.length || 0;
    const occupied = squad?.slots?.filter((slot) => slot.assignedUserId).length || 0;
    return { occupied, total };
  };

  const getTemplateFlowEdges = (templateId, squads) => {
    const squadIds = new Set((squads || []).map((squad) => squad.id));
    return (flowEdges?.[templateId] || []).filter((edge) => squadIds.has(edge.sourceId) && squadIds.has(edge.targetId));
  };

  const copyTemplateCanvasToOperation = (templateId, op) => {
    if (!templateId || !op) return;
    const opSquads = op.squads || [];
    const squadByOriginalId = new Map(opSquads.map((squad) => [squad.originalSquadId, squad]));
    const mappedEdges = (flowEdges?.[templateId] || []).map((edge) => {
      const source = squadByOriginalId.get(edge.sourceId);
      const target = squadByOriginalId.get(edge.targetId);
      if (!source || !target) return null;
      return {
        id: `${op.id}-${source.id}-${target.id}-${edge.id}`,
        sourceId: source.id,
        targetId: target.id,
        sourceAnchor: edge.sourceAnchor || 'bottom',
        targetAnchor: edge.targetAnchor || 'top'
      };
    }).filter(Boolean);

    const templateLayout = canvasLayout?.[templateId] || {};
    const mappedLayout = {};
    opSquads.forEach((squad) => {
      const sourceNode = templateLayout?.[squad.originalSquadId];
      if (sourceNode) mappedLayout[squad.id] = { ...sourceNode, parentId: null };
    });

    setFlowEdges((prev) => ({ ...(prev || {}), [op.id]: mappedEdges }));
    setCanvasLayout((prev) => ({ ...(prev || {}), [op.id]: mappedLayout }));
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

  const trimCanvasTop = (templateId, squads = []) => {
    setCanvasLayout((prev) => {
      const templateLayout = prev?.[templateId] || {};
      if (!Array.isArray(squads) || squads.length === 0) return prev;

      const nodes = squads.map((squad, index) => ({
        id: squad.id,
        node: templateLayout?.[squad.id] || {
          x: 40 + (index % 3) * 300,
          y: 40 + Math.floor(index / 3) * 240,
          parentId: null
        }
      }));
      const minX = Math.min(...nodes.map(({ node }) => Number(node.x) || 0));
      const minY = Math.min(...nodes.map(({ node }) => Number(node.y) || 0));
      const offsetX = snapToCanvasGrid(minX) - 40;
      const offsetY = snapToCanvasGrid(minY) - 40;
      if (offsetX <= 0 && offsetY <= 0) return prev;

      const nextTemplateLayout = { ...templateLayout };
      nodes.forEach(({ id, node }) => {
        nextTemplateLayout[id] = {
          ...node,
          x: offsetX > 0 ? Math.max(40, node.x - offsetX) : node.x,
          y: offsetY > 0 ? Math.max(40, node.y - offsetY) : node.y
        };
      });
      return { ...prev, [templateId]: nextTemplateLayout };
    });
  };

  const autoLayoutTemplate = (templateId, layoutSquads, onlySquadId = null) => {
    // The scheduler uses an operation id as its canvas key, so it cannot always be
    // found in `templates`. Accepting its squads explicitly keeps both builders on
    // the exact same layout algorithm.
    const template = templates.find((t) => t.id === templateId);
    const squads = Array.isArray(layoutSquads) ? layoutSquads : (template?.squads || []);
    if (!template && !Array.isArray(layoutSquads)) return;

    const squadIds = new Set(squads.map((squad) => squad.id));
    const edges = getTemplateFlowEdges(templateId, squads);

    const MAX_COLUMNS = 4;
    const NODE_WIDTH = ORBAT_NODE_WIDTH;
    const HORIZONTAL_GAP = CANVAS_GRID_UNIT;
    const VERTICAL_GAP = 60;
    const START_X = 40;
    const START_Y = 40;

    const squadById = new Map(squads.map((squad) => [squad.id, squad]));
    const nodeHeight = (id) => getOrbatNodeHeight(squadById.get(id));

    const childrenMap = new Map();
    edges.forEach((edge) => {
      if (!squadIds.has(edge.sourceId) || !squadIds.has(edge.targetId)) return;
      if (!childrenMap.has(edge.sourceId)) childrenMap.set(edge.sourceId, []);
      childrenMap.get(edge.sourceId).push(edge.targetId);
    });

    const positions = {};
    let nextY = START_Y;
    const placed = new Set();
    const originalIndex = new Map(squads.map((squad, index) => [squad.id, index]));

    const placeRow = (rowIds, centre = true) => {
      // Centre short rows so a leader and its children share the same visual axis.
      const columnOffset = centre ? (MAX_COLUMNS - rowIds.length) / 2 : 0;
      rowIds.forEach((id, column) => {
        positions[id] = {
          x: START_X + (columnOffset + column) * (NODE_WIDTH + HORIZONTAL_GAP),
          y: nextY
        };
        placed.add(id);
      });
      const tallest = Math.max(...rowIds.map(nodeHeight));
      nextY += tallest + VERTICAL_GAP;
    };

    const layoutSection = (sectionSquads) => {
      const sectionIds = new Set(sectionSquads.map((squad) => squad.id));
      const sectionEdges = edges.filter((edge) => sectionIds.has(edge.sourceId) && sectionIds.has(edge.targetId));
      const assignedIds = new Set(sectionEdges.flatMap((edge) => [edge.sourceId, edge.targetId]));
      const hasParentInSection = new Set(sectionEdges.map((edge) => edge.targetId));
      const assignedSquads = sectionSquads.filter((squad) => assignedIds.has(squad.id));
      const unassignedSquads = sectionSquads.filter((squad) => !assignedIds.has(squad.id));
      const roots = assignedSquads
        .filter((squad) => !hasParentInSection.has(squad.id))
        .map((squad) => squad.id);
      const candidates = [...roots, ...assignedSquads.map((squad) => squad.id)];

      candidates.forEach((rootId) => {
        if (placed.has(rootId)) return;
        let levelIds = [rootId];
        const branchSeen = new Set();

        while (levelIds.length > 0) {
          const uniqueLevelIds = levelIds
            .filter((id, index, ids) => sectionIds.has(id) && !placed.has(id) && !branchSeen.has(id) && ids.indexOf(id) === index)
            .sort((a, b) => originalIndex.get(a) - originalIndex.get(b));
          if (uniqueLevelIds.length === 0) break;

          uniqueLevelIds.forEach((id) => branchSeen.add(id));
          for (let offset = 0; offset < uniqueLevelIds.length; offset += MAX_COLUMNS) {
            placeRow(uniqueLevelIds.slice(offset, offset + MAX_COLUMNS));
          }
          levelIds = uniqueLevelIds.flatMap((id) => childrenMap.get(id) || []);
        }
      });

      // Squads without a flow connection belong below the connected hierarchy.
      // Keep filling each row from left to right instead of centring every squad
      // on its own row as a separate root.
      for (let offset = 0; offset < unassignedSquads.length; offset += MAX_COLUMNS) {
        placeRow(unassignedSquads.slice(offset, offset + MAX_COLUMNS).map((squad) => squad.id), false);
      }
    };

    const activeSquads = squads.filter((squad) => squad.active !== false);
    const inactiveSquads = squads.filter((squad) => squad.active === false);
    layoutSection(activeSquads);
    if (inactiveSquads.length > 0) {
      // Keep disabled squads below the fixed visual divider, including when
      // there are no active squads to establish a lower boundary themselves.
      nextY = Math.max(
        nextY + (activeSquads.length > 0 ? VERTICAL_GAP : 0),
        360 + VERTICAL_GAP
      );
      layoutSection(inactiveSquads);
    }

    setCanvasLayout((prev) => {
      const templateLayout = { ...(prev?.[templateId] || {}) };
      Object.entries(positions).forEach(([squadId, pos]) => {
        if (onlySquadId != null && String(squadId) !== String(onlySquadId)) return;
        templateLayout[squadId] = {
          ...(templateLayout[squadId] || {}),
          x: snapToCanvasGrid(pos.x),
          y: snapToCanvasGrid(pos.y)
        };
      });
      return { ...prev, [templateId]: templateLayout };
    });
  };

  const alignInactiveSquads = (templateId, layoutSquads) => {
    const squads = Array.isArray(layoutSquads) ? layoutSquads : [];
    const activeSquads = squads.filter((squad) => squad.active !== false);
    const inactiveSquads = squads.filter((squad) => squad.active === false);
    if (inactiveSquads.length === 0) return;
    const activeBottom = activeSquads.reduce((bottom, squad, index) => {
      const node = getCanvasNode(templateId, squad.id, squads.indexOf(squad));
      return Math.max(bottom, node.y + getOrbatNodeHeight(squad));
    }, 300);
    const startY = snapToCanvasGrid(Math.max(360, activeBottom + 60) + 60);
    setCanvasLayout((prev) => {
      const nextLayout = { ...(prev?.[templateId] || {}) };
      let rowY = startY;
      for (let offset = 0; offset < inactiveSquads.length; offset += 4) {
        const row = inactiveSquads.slice(offset, offset + 4);
        row.forEach((squad, column) => {
          nextLayout[squad.id] = {
            ...(nextLayout[squad.id] || {}),
            x: 40 + column * (ORBAT_NODE_WIDTH + CANVAS_GRID_UNIT),
            y: rowY
          };
        });
        rowY += Math.max(...row.map(getOrbatNodeHeight)) + 60;
      }
      return { ...prev, [templateId]: nextLayout };
    });
  };

  const autoLayoutSingleSquad = (templateId, layoutSquads, squadId) => {
    const squads = Array.isArray(layoutSquads) ? layoutSquads : [];
    const targetIndex = squads.findIndex((squad) => String(squad.id) === String(squadId));
    if (targetIndex < 0) return;

    const target = squads[targetIndex];
    const NODE_WIDTH = 280;
    const GAP = CANVAS_GRID_UNIT;
    const VERTICAL_GAP = 60;
    const DEFAULT_HEIGHT = 124;
    const edges = getTemplateFlowEdges(templateId, squads);
    const incomingEdge = edges.find((edge) => String(edge.targetId) === String(squadId));
    const parentIndex = incomingEdge
      ? squads.findIndex((squad) => String(squad.id) === String(incomingEdge.sourceId))
      : -1;
    const parentNode = parentIndex >= 0
      ? getCanvasNode(templateId, squads[parentIndex].id, parentIndex)
      : null;

    const rectangles = squads
      .map((squad, index) => {
        if (String(squad.id) === String(squadId)) return null;
        const node = getCanvasNode(templateId, squad.id, index);
        return {
          x: node.x,
          y: node.y,
          width: NODE_WIDTH,
          height: nodeHeights[`flow-${templateId}-${squad.id}`] || DEFAULT_HEIGHT,
          active: squad.active !== false
        };
      })
      .filter(Boolean);

    let desiredY;
    if (target.active === false) {
      const activeBottom = rectangles
        .filter((rect) => rect.active)
        .reduce((bottom, rect) => Math.max(bottom, rect.y + rect.height), 40);
      desiredY = snapToCanvasGrid(activeBottom + VERTICAL_GAP);
    } else if (parentNode) {
      const parentHeight = nodeHeights[`flow-${templateId}-${incomingEdge.sourceId}`] || DEFAULT_HEIGHT;
      desiredY = snapToCanvasGrid(parentNode.y + parentHeight + VERTICAL_GAP);
    } else {
      const activeTop = rectangles
        .filter((rect) => rect.active)
        .reduce((top, rect) => Math.min(top, rect.y), Number.POSITIVE_INFINITY);
      desiredY = Number.isFinite(activeTop) ? snapToCanvasGrid(activeTop) : 40;
    }

    const currentNode = getCanvasNode(templateId, target.id, targetIndex);
    const rowRectangles = rectangles.filter((rect) => (
      desiredY < rect.y + rect.height + GAP
      && desiredY + (nodeHeights[`flow-${templateId}-${target.id}`] || DEFAULT_HEIGHT) + GAP > rect.y
    ));
    const rowCenter = rowRectangles.length
      ? (Math.min(...rowRectangles.map((rect) => rect.x)) + Math.max(...rowRectangles.map((rect) => rect.x + rect.width))) / 2
      : 40 + NODE_WIDTH / 2;
    const anchorX = parentNode ? parentNode.x : rowCenter - NODE_WIDTH / 2;
    const existingXs = rectangles.map((rect) => snapToCanvasGrid(rect.x));
    const xCandidates = [...new Set([
      snapToCanvasGrid(anchorX),
      ...existingXs.flatMap((x) => [x, x - (NODE_WIDTH + GAP), x + (NODE_WIDTH + GAP)]),
      40,
      40 + (NODE_WIDTH + GAP),
      40 + 2 * (NODE_WIDTH + GAP),
      40 + 3 * (NODE_WIDTH + GAP)
    ].filter((x) => x >= 40))];

    const compactRowScore = (x) => {
      if (parentNode) return Math.abs(x - anchorX);
      if (rowRectangles.length === 0) return Math.abs(x - 40);
      const minX = Math.min(x, ...rowRectangles.map((rect) => rect.x));
      const maxRight = Math.max(x + NODE_WIDTH, ...rowRectangles.map((rect) => rect.x + rect.width));
      const span = maxRight - minX;
      const candidateCenter = x + NODE_WIDTH / 2;
      return span * 10 + Math.abs(candidateCenter - rowCenter);
    };
    xCandidates.sort((a, b) => compactRowScore(a) - compactRowScore(b));

    const targetHeight = nodeHeights[`flow-${templateId}-${target.id}`] || DEFAULT_HEIGHT;
    const overlaps = (x, y) => rectangles.some((rect) => (
      x < rect.x + rect.width + GAP
      && x + NODE_WIDTH + GAP > rect.x
      && y < rect.y + rect.height + GAP
      && y + targetHeight + GAP > rect.y
    ));

    let position = null;
    const rowStep = Math.max(targetHeight, DEFAULT_HEIGHT) + VERTICAL_GAP;
    for (let row = 0; row < 20 && !position; row += 1) {
      const y = snapToCanvasGrid(desiredY + row * rowStep);
      const cardsOnRow = rectangles.filter((rect) => (
        y < rect.y + rect.height + GAP && y + targetHeight + GAP > rect.y
      )).length;
      if (cardsOnRow >= 4) continue;
      const freeX = xCandidates.find((x) => !overlaps(x, y));
      if (freeX !== undefined) position = { x: freeX, y };
    }
    if (!position) position = { x: 40, y: snapToCanvasGrid(desiredY + 20 * rowStep) };

    setCanvasLayout((prev) => ({
      ...prev,
      [templateId]: {
        ...(prev?.[templateId] || {}),
        [target.id]: {
          ...(prev?.[templateId]?.[target.id] || {}),
          ...position
        }
      }
    }));
    if (page === 'builder') return;
  };

  const handleFlowConnectorClick = (templateId, squadId, anchor, event) => {
    event.stopPropagation();

    if (!flowLinkSource || flowLinkSource.templateId !== templateId) {
      setFlowLinkSource({ templateId, squadId, anchor });
      return;
    }

    if (flowLinkSource.squadId === squadId && flowLinkSource.anchor === anchor) {
      setFlowLinkSource(null);
      return;
    }

    // A line always runs from a "bottom" dot (parent, emits downward) to a "top" dot
    // (child, receives from above) - which end is which never depends on click order.
    if (flowLinkSource.anchor === anchor) {
      // Both clicked dots are the same type (e.g. two "bottom" dots) - there is no valid
      // parent/child direction to infer from that, so treat this click as the start of a
      // fresh selection instead of guessing based on click order.
      setFlowLinkSource({ templateId, squadId, anchor });
      return;
    }

    const parentId = flowLinkSource.anchor === 'bottom' ? flowLinkSource.squadId : squadId;
    const childId = parentId === flowLinkSource.squadId ? squadId : flowLinkSource.squadId;

    addTemplateFlowEdge(templateId, parentId, childId, 'bottom', 'top');
    setFlowLinkSource(null);
  };

  const resolveSquadParentId = (templateId, squads, squadId, index) => {
    const explicitParent = getCanvasNode(templateId, squadId, index).parentId;
    if (explicitParent && squads.some((item) => item.id === explicitParent)) {
      return explicitParent;
    }
    if (index === 0) return null;
    return squads[0]?.id || null;
  };

  const updateSquadParent = (templateId, squadId, parentId) => {
    updateCanvasNode(templateId, squadId, { parentId: parentId || null });
  };

  const getCanvasNode = (templateId, squadId, index) => {
    const templateLayout = canvasLayout?.[templateId] || {};
    const existing = templateLayout?.[squadId];
    if (existing) return existing;

    return {
      x: 40 + (index % 3) * 300,
      y: 40 + Math.floor(index / 3) * 240,
      parentId: null
    };
  };

  const updateCanvasNode = (templateId, squadId, updates) => {
    setCanvasLayout((prev) => {
      const templateLayout = prev?.[templateId] || {};
      const nextNode = {
        ...(templateLayout?.[squadId] || {}),
        ...updates
      };

      return {
        ...prev,
        [templateId]: {
          ...templateLayout,
          [squadId]: nextNode
        }
      };
    });
  };

  const getCanvasSize = (template) => {
    let maxX = 0;
    let maxY = 0;

    const squads = template.squads || [];
    squads.forEach((squad, index) => {
      const node = getCanvasNode(template.id, squad.id, index);
      maxX = Math.max(maxX, node.x);
      maxY = Math.max(maxY, node.y + getOrbatNodeHeight(squad));
    });

    const expansion = canvasExpansion?.[template.id] || {};
    return {
      width: Math.max(1000, maxX + 360, expansion.width || 0),
      height: Math.max(700, maxY + 80, expansion.height || 0)
    };
  };

  const expandCanvas = (templateId, minimumSize) => {
    setCanvasExpansion((prev) => {
      const current = prev?.[templateId] || {};
      const next = {
        width: Math.max(current.width || 0, minimumSize?.width || 0),
        height: Math.max(current.height || 0, minimumSize?.height || 0)
      };
      if (next.width === current.width && next.height === current.height) return prev;
      return { ...prev, [templateId]: next };
    });
  };

  const prependCanvasSpace = (templateId, squads, amount) => {
    const shiftX = Math.max(0, amount?.x || 0);
    const shiftY = Math.max(0, amount?.y || 0);
    if (!shiftX && !shiftY) return;

    setCanvasLayout((prev) => {
      const templateLayout = prev?.[templateId] || {};
      const nextTemplateLayout = { ...templateLayout };
      (squads || []).forEach((squad, index) => {
        const node = templateLayout?.[squad.id] || {
          x: 40 + (index % 3) * 300,
          y: 40 + Math.floor(index / 3) * 240,
          parentId: null
        };
        nextTemplateLayout[squad.id] = {
          ...node,
          x: (Number(node.x) || 0) + shiftX,
          y: (Number(node.y) || 0) + shiftY
        };
      });
      return { ...prev, [templateId]: nextTemplateLayout };
    });
    setCanvasExpansion((prev) => {
      const current = prev?.[templateId] || {};
      return {
        ...prev,
        [templateId]: {
          width: (current.width || 1000) + shiftX,
          height: (current.height || 700) + shiftY
        }
      };
    });
  };

  const startCanvasDrag = (event, templateId, squadId, index) => {
    if (event.button !== 0) return;

    const canvasElement = event.currentTarget.closest('.drag-canvas');
    if (!canvasElement) return;

    const rect = canvasElement.getBoundingClientRect();
    const node = getCanvasNode(templateId, squadId, index);
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;

    setCanvasDrag({
      templateId,
      squadId,
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

    updateCanvasNode(template.id, canvasDrag.squadId, { x: nextX, y: nextY });
    setDragSnapPreview({
      templateId: template.id,
      squadId: canvasDrag.squadId,
      x: snapToCanvasGrid(nextX),
      y: snapToCanvasGrid(nextY)
    });
  };

  const nudgeCanvasDrag = (deltaX, deltaY) => {
    if (!canvasDrag || (!deltaX && !deltaY)) return;
    setCanvasLayout((prev) => {
      const templateLayout = prev?.[canvasDrag.templateId] || {};
      const current = templateLayout?.[canvasDrag.squadId];
      if (!current) return prev;
      const next = {
        ...current,
        x: Math.max(12, current.x + deltaX),
        y: Math.max(12, current.y + deltaY)
      };
      setDragSnapPreview({
        templateId: canvasDrag.templateId,
        squadId: canvasDrag.squadId,
        x: snapToCanvasGrid(next.x),
        y: snapToCanvasGrid(next.y)
      });
      return {
        ...prev,
        [canvasDrag.templateId]: { ...templateLayout, [canvasDrag.squadId]: next }
      };
    });
  };

  const stopCanvasDrag = () => {
    if (
      canvasDrag
      && dragSnapPreview
      && dragSnapPreview.templateId === canvasDrag.templateId
      && dragSnapPreview.squadId === canvasDrag.squadId
    ) {
      updateCanvasNode(canvasDrag.templateId, canvasDrag.squadId, {
        x: dragSnapPreview.x,
        y: dragSnapPreview.y
      });
      if (page === 'builder') {
        const template = templates.find((item) => item.id === canvasDrag.templateId);
        if (template) trimCanvasTop(template.id, template.squads || []);
      }
    }
    setCanvasDrag(null);
    setDragSnapPreview(null);
  };

  const setNodeHeightRef = (nodeKey) => {
    if (!nodeHeightRefCallbacks.current.has(nodeKey)) {
      nodeHeightRefCallbacks.current.set(nodeKey, (element) => {
        nodeHeightObservers.current.get(nodeKey)?.disconnect();
        nodeHeightObservers.current.delete(nodeKey);
        if (!element) return;

        const updateHeight = () => {
          const nextHeight = element.offsetHeight;
          setNodeHeights((prev) => (
            prev[nodeKey] === nextHeight ? prev : { ...prev, [nodeKey]: nextHeight }
          ));
        };

        updateHeight();
        const observer = new ResizeObserver(updateHeight);
        observer.observe(element);
        nodeHeightObservers.current.set(nodeKey, observer);
      });
    }
    return nodeHeightRefCallbacks.current.get(nodeKey);
  };

  useEffect(() => () => {
    nodeHeightObservers.current.forEach((observer) => observer.disconnect());
    nodeHeightObservers.current.clear();
    nodeHeightRefCallbacks.current.clear();
  }, []);

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
      template.squads?.forEach((squad) => {
        squad.slots?.forEach((slot) => {
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

  const updateDrillSergeant = async (userId, isDrillSergeant) => {
    const token = localStorage.getItem('token');
    const res = await fetch(`${API}/users/${userId}/permissions`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ isDrillSergeant })
    });
    const data = await res.json();
    if (!res.ok) { alert(data.error || 'Could not update Drill Sergeant status'); return; }
    setUsers((prev) => prev.map((user) => user.id === data.user.id ? { ...data.user, isDrillSergeant: Boolean(data.user.is_drill_sergeant ?? data.user.isDrillSergeant) } : user));
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
                <Notifications
                  open={notificationsOpen}
                  notifications={notifications}
                  loading={notificationsLoading}
                  onToggle={() => { setNotificationsOpen((value) => !value); if (!notificationsOpen) loadNotifications(); }}
                  onRead={markNotificationRead}
                  onReadAll={markAllNotificationsRead}
                  onOpenOperation={(id) => { setNotificationsOpen(false); showOpInScheduler(Number(id)); }}
                />
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
            <form onSubmit={login} autoComplete="on">
              <h2>Login</h2>
              <input
                name="username"
                autoComplete="username"
                placeholder="Username"
                value={loginForm.username}
                onChange={(e) => setLoginForm((prev) => ({ ...prev, username: e.target.value }))}
              />
              <input
                type="password"
                name="password"
                autoComplete="current-password"
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
          <form onSubmit={signup} className="signup-card" autoComplete="on">
            <div className="signup-fields-grid">
              <div className="signup-credentials-row">
                <div className="signup-field">
                  <label>Username</label>
                  <small>Choose a unique username for the unit.</small>
                  <input name="signup-username" autoComplete="username" placeholder="Username" value={signupForm.username} onChange={(e) => updateSignupField('username', e.target.value)} />
                  {signupErrors.username ? <div className="field-error">{signupErrors.username}</div> : null}
                </div>

                <div className="signup-field">
                  <label>Password</label>
                  <small>Pick a secure password (min 8 characters recommended).</small>
                  <input type="password" name="signup-password" autoComplete="new-password" placeholder="Password" value={signupForm.password} onChange={(e) => updateSignupField('password', e.target.value)} />
                  {signupErrors.password ? <div className="field-error">{signupErrors.password}</div> : null}
                </div>
              </div>

              <div className="signup-field">
                <label>Age</label>
                <small>Enter your age as a whole number.</small>
                <input type="number" min="0" max="120" step="1" value={signupForm.age} onChange={(e) => updateSignupField('age', e.target.value)} />
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
                <select value={signupForm.ok_multiple_modlists} onChange={(e) => updateSignupField('ok_multiple_modlists', e.target.value)}>
                  <option>Yes</option>
                  <option>No</option>
                </select>
                {signupErrors.ok_multiple_modlists ? <div className="field-error">{signupErrors.ok_multiple_modlists}</div> : null}
              </div>

              <div className="signup-field">
                <h4>Orders (Requirement)</h4>
                <small>Members must follow mission orders and instructions.</small>
                <select value={signupForm.ok_follow_orders} onChange={(e) => updateSignupField('ok_follow_orders', e.target.value)}>
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
            {auth ? (
            <div className="top-tabs">
              {can('view_overview') ? <button className={page === 'dashboard' ? 'tab active' : 'tab'} onClick={goToDashboard}>
                Overview
              </button> : null}
              {can('view_campaigns') ? <button className={page === 'campaigns' ? 'tab active' : 'tab'} onClick={goToCampaigns}>
                Campaigns
              </button> : null}
              {can('view_operations') ? <button className={(page === 'scheduler' || page === 'scheduler-detail') ? 'tab active' : 'tab'} onClick={goToSchedulerList}>
                Operation scheduler
              </button> : null}
              {can('view_templates') ? <button className={page === 'builder' ? 'tab active' : 'tab'} onClick={goToBuilder}>
                Template Builder
              </button> : null}
              {/* Roles and Ranks moved to Settings subtabs */}
              {can('view_players') ? <button className={page === 'players' ? 'tab active' : 'tab'} onClick={goToPlayers}>
                Player List
              </button> : null}
              {can('view_training') ? <button className={page === 'training' ? 'tab active' : 'tab'} onClick={() => setPage('training')}>
                Training
              </button> : null}
              {can('view_settings') ? <button className={page === 'settings' ? 'tab active' : 'tab'} onClick={goToSettings}>
                Settings
              </button> : null}
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
          {page === 'overview' && (!auth || can('view_overview')) ? (
            <section className="card">
              <div className="builder-toolbar">
                <div>
                  <h3>Overview</h3>
                </div>
              </div>

              <div className="template-list overview-operation-tabs">
                {sortedOps.length === 0 ? (
                  <div className="empty-state">No operations scheduled yet.</div>
                ) : (
                  sortedOps.map((op) => (
                    <div key={op.id} className="template-list-item">
                      <button className={selectedOpId === op.id ? 'selected' : ''} onClick={() => showOpOnDashboard(op.id)}>
                        <span>{op.name}</span>
                        <span className="overview-operation-date">{op.date}</span>
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
                  resolveSquadParentId={resolveSquadParentId}
                  getTemplateFlowEdges={getTemplateFlowEdges}
                  nodeHeights={nodeHeights}
                  setNodeHeightRef={setNodeHeightRef}
                  moveCanvasDrag={moveCanvasDrag}
                  stopCanvasDrag={stopCanvasDrag}
                  startCanvasDrag={startCanvasDrag}
                  updateSquadParent={updateSquadParent}
                  squadStats={squadStats}
                  joinOpSlot={joinOpSlot}
                  signOffOpSlot={signOffOpSlot}
                  updateOpSlot={updateOpSlot}
                  updateOpSlotDebounced={updateOpSlotDebounced}
                  flushOpSlotUpdate={flushOpSlotUpdate}
                    setShowLoginPanel={setShowLoginPanel}
                    showOpInScheduler={showOpInScheduler}
                    campaign={campaigns.find((campaignItem) => String(campaignItem.id) === String(op.campaignId)) || null}
                    toggleOpAbsence={toggleOpAbsence}
                />
              ))}
            </section>
          ) : null}
          {auth && can('view_settings') && page === 'settings' ? (
              <Settings
                  defaultOpSettings={defaultOpSettings}
                  setDefaultOpSettings={setDefaultOpSettings}
                  templates={templates}
                changePassword={changePassword}
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
                  can={can}
                  permissionGroups={permissionGroups}
                  permissionDefinitions={permissionDefinitions}
                  onPermissionGroupsChanged={(groups, definitions) => {
                    setPermissionGroups(groups);
                    setPermissionDefinitions(definitions);
                    setAuth((current) => {
                      if (!current) return current;
                      const currentGroup = groups.find((group) => group.slug === current.role);
                      return currentGroup ? { ...current, capabilities: currentGroup.permissions || {} } : current;
                    });
                  }}
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
          {auth && can('view_training') && page === 'training' ? (
            <Training auth={auth} users={users} roles={allRoles} onQualificationsChanged={loadPrivateData} />
          ) : null}
          {auth && can('view_operations') && page === 'scheduler' ? (
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
                    ...sortedOps.map((op) => ({
                      type: 'op',
                      id: op.id,
                      name: op.name,
                      date: op.date,
                      time: op.time,
                      templateId: op.templateId,
                      recurrenceId: null,
                      sortKey: String(op.date || '') + String(op.time || '')
                    })),
                    ...recurrences.map((rec) => ({
                      type: 'recurrence',
                      id: rec.id,
                      name: rec.name,
                      date: rec.startDate || '',
                      time: rec.time || '',
                      templateId: rec.templateId,
                      recurrenceId: rec.id,
                      sortKey: String(rec.startDate || '') + String(rec.time || '')
                    }))
                  ]
                    .sort((a, b) => {
                      const sa = a.sortKey || '';
                      const sb = b.sortKey || '';
                      return sa.localeCompare(sb, undefined, { numeric: true, sensitivity: 'base' });
                    })
                    .map((item) => (
                      <div
                        key={item.type + item.id}
                        className="op-list-row"
                      >
                        <button className="op-list-open" onClick={() => item.type === 'op'
                          ? showOpInScheduler(item.id, null)
                          : showOpInScheduler(item.id, item.recurrenceId)
                        }>
                        <div className="op-list-row-top">
                          <div className="op-list-name">{item.name}</div>
                          {item.type === 'recurrence' && <span className="op-list-badge">Recurring</span>}
                        </div>
                        <div className="op-list-meta">{item.date} &middot; {item.time} &middot; {getTemplateName(item.templateId)}</div>
                        </button>
                      </div>
                    ))
                )}
              </div>
            </section>
          ) : null}

          {auth && can('view_campaigns') && page === 'campaigns' ? (
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

          {auth && can('view_operations') && page === 'op-detail' && selectedOp ? (
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
                updateOpSquadMeta={updateOpSquadMeta}
                users={users}
                updateOpSlot={updateOpSlot}
                updateOpSlotDebounced={updateOpSlotDebounced}
                flushOpSlotUpdate={flushOpSlotUpdate}
                allRoles={allRoles}
                weekDayLabels={weekDayLabels}
                toggleRecurrenceWeeklyDay={toggleRecurrenceWeeklyDay}
                updateRecurrence={updateRecurrence}
                isMissionmaker={can('edit_operations')}
                uploadCustomMarker={uploadCustomMarker}
                recurrenceLabel={recurrenceLabel}
                isAdmin={can('edit_operations')}
                canAssignPlayers={can('assign_players')}
                getCanvasSize={getCanvasSize}
                getCanvasNode={getCanvasNode}
                resolveSquadParentId={resolveSquadParentId}
                getTemplateFlowEdges={getTemplateFlowEdges}
                nodeHeights={nodeHeights}
                setNodeHeightRef={setNodeHeightRef}
                moveCanvasDrag={moveCanvasDrag}
                stopCanvasDrag={stopCanvasDrag}
                startCanvasDrag={startCanvasDrag}
                updateSquadParent={updateSquadParent}
                squadStats={squadStats}
                auth={auth}
                joinOpSlot={joinOpSlot}
                signOffOpSlot={signOffOpSlot}
                setShowLoginPanel={setShowLoginPanel}
                flowLinkSource={flowLinkSource}
                addOpSquad={addOpSquad}
                clearTemplateFlowEdges={clearTemplateFlowEdges}
                resetTemplateCanvasLayout={resetTemplateCanvasLayout}
                handleFlowConnectorClick={handleFlowConnectorClick}
                updateSquadTitleLocal={updateSquadTitleLocal}
                updateSquadMeta={updateSquadMeta}
                updateOpSquadTitleLocal={updateOpSquadTitleLocal}
                deleteSquad={deleteSquad}
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
                alignInactiveSquads={alignInactiveSquads}
                autoLayoutSingleSquad={autoLayoutSingleSquad}
                squadTypes={squadTypes}
                saveDraft={saveOperationDraft}
                savingDraft={savingEditor}
                savedDraft={editorSaved}
              />
            </section>
          ) : null}

          {isAdmin ? (
            <>

              {auth && can('view_templates') && page === 'builder' && (
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
                            onChange={(e) => {
                              if (!confirmEditorNavigation()) return;
                              setEditorDirty(false);
                              setSelectedTemplateId(e.target.value ? Number(e.target.value) : null);
                            }}
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
                        <button type="button" onClick={saveTemplateDraft} disabled={!selectedTemplateId || savingEditor}>
                          {savingEditor ? 'Saving...' : editorSaved ? 'Saved' : 'Save'}
                        </button>
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
                          addSquadQuick={addSquadQuick}
                          clearTemplateFlowEdges={clearTemplateFlowEdges}
                          resetTemplateCanvasLayout={resetTemplateCanvasLayout}
                          autoLayoutTemplate={autoLayoutTemplate}
                          alignInactiveSquads={alignInactiveSquads}
                          autoLayoutSingleSquad={autoLayoutSingleSquad}
                          moveCanvasDrag={moveCanvasDrag}
                          stopCanvasDrag={stopCanvasDrag}
                          trimCanvasTop={trimCanvasTop}
                          expandCanvas={expandCanvas}
                          nudgeCanvasDrag={nudgeCanvasDrag}
                          prependCanvasSpace={prependCanvasSpace}
                          startCanvasDrag={startCanvasDrag}
                          setNodeHeightRef={setNodeHeightRef}
                          handleFlowConnectorClick={handleFlowConnectorClick}
                          updateSquadTitleLocal={updateSquadTitleLocal}
                          updateSquadMeta={updateSquadMeta}
                          deleteSquad={deleteSquad}
                          handleSlotDragOver={handleSlotDragOver}
                          handleSlotDrop={handleSlotDrop}
                          handleSlotDragStart={handleSlotDragStart}
                          setDraggedSlot={setDraggedSlot}
                          updateSlot={updateSlot}
                          flushSlotUpdate={flushSlotUpdate}
                          deleteSlot={deleteSlot}
                          addSlot={addSlot}
                          isAdmin={can('edit_templates')}
                          isMissionmaker={can('edit_templates')}
                          uploadCustomMarker={uploadCustomMarker}
                          squadTypes={squadTypes}
                        />
                      ))
                    ) : (
                      <div className="empty-state">Choose a template to edit first.</div>
                    )}
                  </section>
                </>
              )}

              {auth && can('view_players') && page === 'players' && (
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

                  {can('edit_players') ? <section className="card player-squad">
                    <h3>Create user</h3>
                    <form onSubmit={createUser} className="player-form" autoComplete="off">
                      <input
                        name="new-username"
                        autoComplete="off"
                        placeholder="Username"
                        value={userForm.username}
                        onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
                      />
                      <input
                        type="password"
                        name="new-password"
                        autoComplete="new-password"
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
                          {(permissionGroups.length ? permissionGroups : [
                            { slug: 'member', name: 'Member' },
                            { slug: 'missionmaker', name: 'Missionmaker' },
                            { slug: 'admin', name: 'Admin' }
                          ]).map((group) => <option key={group.slug} value={group.slug}>{group.name}</option>)}
                        </select>
                      </label>
                      <button type="submit">Save</button>
                    </form>
                  </section> : null}

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
                              <th>Drill Sergeant</th>
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
                                    disabled={!can('edit_players')}
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
                                    disabled={!can('edit_players')}
                                    onChange={(e) => updateUserRole(user.id, e.target.value)}
                                  >
                                    {permissionGroups.map((group) => (
                                      <option key={group.slug} value={group.slug}>{group.name}</option>
                                    ))}
                                  </select>
                                </td>
                                <td>
                                  <label className="checkbox-row">
                                    <input type="checkbox" checked={Boolean(user.isDrillSergeant ?? user.is_drill_sergeant)} disabled={!can('edit_players')} onChange={(e) => updateDrillSergeant(user.id, e.target.checked)} />
                                    {user.isDrillSergeant || user.is_drill_sergeant ? 'Yes' : 'No'}
                                  </label>
                                </td>
                                <td>
                                  <div className="roles-cell">
                                    {can('edit_players') ? <button className="secondary small" onClick={() => openRoleModal(user)}>
                                      Roles
                                    </button> : null}

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
                                  {can('edit_players') ? <button className="secondary small" onClick={() => deleteUser(user.id)}>
                                    Delete
                                  </button> : null}
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
