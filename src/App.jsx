import { useEffect, useMemo, useRef, useState } from 'react';
import OrbatOverview from './OrbatOverview';
import OrbatScheduler from './OrbatScheduler';
import OrbatTemplate from './OrbatTemplate';
import Settings from './Settings';

const API = '/api';

function App() {
  const [auth, setAuth] = useState(null);
  const [users, setUsers] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [ops, setOps] = useState([]);
  const [recurrences, setRecurrences] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);
  const [schedulerLoadTemplateId, setSchedulerLoadTemplateId] = useState('');
  const [selectedOpId, setSelectedOpId] = useState(null);
  const [selectedRecurrenceId, setSelectedRecurrenceId] = useState(null);
  const [page, setPage] = useState('overview');
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
  const [nodeHeights, setNodeHeights] = useState({});
  const [draggedSlot, setDraggedSlot] = useState(null);
  const slotSaveTimersRef = useRef({});
  const pendingSlotUpdatesRef = useRef({});
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
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [changePasswordForm, setChangePasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
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
  const [userForm, setUserForm] = useState({ username: '', password: '', role: 'member', rank: '', status: 'Active' });
  const [opForm, setOpForm] = useState({ name: '', templateId: null, date: '', time: '', serverName: '', tsAddress: '', recurrence: 'none', weeklyDays: [], monthlyDay: '' });
  const [defaultOpSettings, setDefaultOpSettings] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('defaultOpSettings') || '{}');
    } catch (e) {
      return {};
    }
  });
  const changePassword = async (currentPassword, newPassword) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API}/change-password`, {
        method: 'POST',
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
  const setTemplateOverride = async (templateId, enabled) => {
    // optimistic: update locally first, then persist; revert on error
    setTemplates((prev) => prev.map((t) => (t.id === templateId ? { ...t, allowMissionmakerOverrides: Boolean(enabled) } : t)));
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API}/templates/${templateId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ allowMissionmakerOverrides: Boolean(enabled) })
      });
      const data = await res.json();
      if (data.template) {
        setTemplates((prev) => prev.map((t) => (t.id === data.template.id ? data.template : t)));
      } else {
        throw new Error(data.error || 'Could not update template');
      }
    } catch (err) {
      alert(err.message || 'Could not update template');
      // revert: reload from server to get canonical state
      loadPrivateData();
    }
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
    setRecurrences(data.recurrences || []);
    setAuth(nextAuth);
    setSelectedTemplateId(templateList?.[0]?.id || null);
    setSelectedOpId(null);
    setOpForm((prev) => ({ ...prev, templateId: templateList?.[0]?.id || null }));
    setPage('overview');
  };

  const loadPrivateData = async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    const res = await fetch(`${API}/data`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    applyLoadedData(data, data.user || null);
  };

  const loadPublicData = async () => {
    const res = await fetch(`${API}/public-data`);
    const data = await res.json();
    applyLoadedData(data, null);
  };

  const goToOverview = () => setPage('overview');
  const goToScheduler = () => setPage('scheduler');
  const goToBuilder = () => setPage('builder');
  const goToRoles = () => setPage('roles');
  const goToPlayers = () => setPage('players');
  const goToDashboard = () => setPage('overview');
  const goToSettings = () => setPage('settings');
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
    const res = await fetch(`${API}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(loginForm)
    });
    const data = await res.json();
    if (data.token) {
      localStorage.setItem('token', data.token);
      setLoginForm({ username: '', password: '' });
      setShowLoginPanel(false);
      loadPrivateData();
    } else {
      alert(data.error || 'Login failed');
    }
  };

  const submitChangePassword = async (e) => {
    e.preventDefault();

    if (!changePasswordForm.currentPassword || !changePasswordForm.newPassword) {
      alert('Fill in both passwords.');
      return;
    }

    if (changePasswordForm.newPassword.length < 6) {
      alert('New password must be at least 6 characters.');
      return;
    }

    if (changePasswordForm.newPassword !== changePasswordForm.confirmPassword) {
      alert('Passwords do not match.');
      return;
    }

    const token = localStorage.getItem('token');
    const res = await fetch(`${API}/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        currentPassword: changePasswordForm.currentPassword,
        newPassword: changePasswordForm.newPassword
      })
    });

    const data = await res.json();

    if (res.ok) {
      alert('Password updated successfully');
      setChangePasswordForm({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      });
      setShowChangePassword(false);
    } else {
      alert(data.error || 'Could not change password');
    }
  };

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

    const res = await fetch(`${API}/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.token) {
      localStorage.setItem('token', data.token);
      setSignupForm({ username: '', password: '', rank: '', status: 'Active', role: 'member' });
      setShowSignup(false);
      loadPrivateData();
    } else {
      alert(data.error || 'Signup failed');
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

  const createOp = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem('token');
    if (!opForm.name || !opForm.templateId || !opForm.date || !opForm.time) {
      alert('Fill in name, template, date and time.');
      return;
    }
    if ((opForm.recurrence === 'weekly' || opForm.recurrence === 'biweekly') && opForm.weeklyDays.length === 0) {
      alert('Select at least one weekday for recurring operations.');
      return;
    }
    if (opForm.recurrence === 'monthly' && (!opForm.monthlyDay || opForm.monthlyDay < 1 || opForm.monthlyDay > 31)) {
      alert('Enter a valid day of the month.');
      return;
    }
    const res = await fetch(`${API}/ops`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        name: opForm.name,
        templateId: opForm.templateId,
        date: opForm.date,
        time: opForm.time,
        serverName: opForm.serverName,
        tsAddress: opForm.tsAddress,
        recurrence: opForm.recurrence,
        weeklyDays: opForm.weeklyDays,
        monthlyDay: opForm.monthlyDay || null
      })
    });
    const data = await res.json();
    if (data.op) {
      setOps((prev) => [...prev, data.op]);
    }
    if (data.recurrence) {
      setRecurrences((prev) => [...prev, data.recurrence]);
    }
    setOpForm((prev) => ({
      ...prev,
      name: '',
      date: '',
      time: defaultOpSettings.time || '',
      serverName: defaultOpSettings.serverName || '',
      modlist: defaultOpSettings.modlist || '',
      tsAddress: defaultOpSettings.tsAddress || '',
      recurrence: defaultOpSettings.recurrence || 'none',
      weeklyDays: [],
      monthlyDay: ''
    }));
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
      const res = await fetch(`${API}/ops/${opId}/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (data.op) {
        setOps((prev) => prev.map((op) => (op.id === data.op.id ? data.op : op)));
      } else {
        throw new Error(data.error || 'Could not update slot');
      }
    } catch (err) {
      alert(err.message || 'Could not update slot');
      setOps(prevOps);
    }
  };

  const signOffOpSlot = async (opId, slotId) => {
    if (!auth) return;
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
      const res = await fetch(`${API}/ops/${opId}/signoff`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ slotId })
      });
      const data = await res.json();
      if (data.op) {
        setOps((prev) => prev.map((op) => (op.id === data.op.id ? data.op : op)));
      } else {
        throw new Error(data.error || 'Could not sign off');
      }
    } catch (err) {
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

  const uploadFile = async (file) => {
    const token = localStorage.getItem('token');
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${API}/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'Upload failed');
      return null;
    }
    return data.url;
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
      } else {
        throw new Error(data.error || 'Could not add section');
      }
    } catch (err) {
      alert(err.message || 'Could not add section');
      setTemplates((prev) => prev.map((template) => {
        if (template.id !== templateId) return template;
        return { ...template, sections: template.sections.filter((s) => s.id !== tempId) };
      }));
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

  const deleteSection = async (templateId, sectionId) => {
    if (!window.confirm('Are you sure you want to delete this section?')) return;
    // optimistic: remove locally first
    const prevTemplates = templates;
    setTemplates((prev) => prev.map((template) => {
      if (template.id !== templateId) return template;
      return { ...template, sections: template.sections.filter((section) => section.id !== sectionId) };
    }));

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API}/templates/${templateId}/sections/${sectionId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (!res.ok) throw new Error('Could not delete section');
    } catch (err) {
      alert(err.message || 'Could not delete section');
      // revert
      setTemplates(prevTemplates);
    }
  };

  const addSlot = async (templateId, sectionId) => {
    const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const tempSlot = {
      id: tempId,
      sectionId,
      name: 'New slot',
      role: 'Rifleman',
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

    const token = localStorage.getItem('token');
    const res = await fetch(`${API}/templates/${templateId}/slots`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        sectionId,
        name: 'New slot',
        role: 'Rifleman',
        allowedRoles: [],
        notes: ''
      })
    });
    const data = await res.json();
    if (data.slot) {
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
      alert(data.error || 'Could not add slot');
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
    setShowChangePassword(false);
    loadPublicData();
  };

  const isAdmin = auth?.role === 'admin';
  const isMissionmaker = auth?.role === 'missionmaker';
  const effectiveOverviewMode = overviewMode === 'orbat' && isNarrowViewport ? 'cards' : overviewMode;
  const isWideCanvasPage = page === 'builder' || (page === 'overview' && effectiveOverviewMode === 'orbat');

  const normalizeRoleKey = (role) => role?.trim().toLowerCase();

  const selectedOp = useMemo(() => ops.find((op) => op.id === selectedOpId), [ops, selectedOpId]);
  const getTemplateName = (templateId) => templates.find((template) => template.id === Number(templateId))?.name || 'Unknown template';
  const sortedOps = useMemo(() => {
    return [...ops].sort((a, b) => {
      if (a.date === b.date) return a.time.localeCompare(b.time);
      return a.date.localeCompare(b.date);
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

    addTemplateFlowEdge(templateId, flowLinkSource.sectionId, sectionId, flowLinkSource.anchor || 'bottom', anchor || 'top');
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

    template.sections.forEach((section, index) => {
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
  };

  const stopCanvasDrag = () => setCanvasDrag(null);

  const setNodeHeightRef = (nodeKey) => (element) => {
    if (!element) return;
    const nextHeight = element.offsetHeight;
    setNodeHeights((prev) => (prev[nodeKey] === nextHeight ? prev : { ...prev, [nodeKey]: nextHeight }));
  };

  const [extraRoles, setExtraRoles] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('extraRoles'));
      if (stored && stored.length > 0) return stored;
    } catch (error) {
      // ignore parse errors, fall through to defaults
    }
    return [
      'PLT leader',
      'Medic',
      'SQL',
      'AR',
      'Marksman',
      'Rifleman',
      'Anti-tank',
      'Engineer',
      'Grenadier',
      'JTAC/FO',
      'Sniper',
      'Spotter',
      'Heli pilot',
      'Jet pilot',
      'Commander',
      'Driver',
      'Ground vehicle gunner',
      'Fire support gunner',
      'FS TL',
      'Zeus',
      'Anti air',
      'Drone Operator'
    ];
  });
  const [newRoleName, setNewRoleName] = useState('');
  const [renamingRole, setRenamingRole] = useState(null);
  const [renameValue, setRenameValue] = useState('');

  useEffect(() => {
    localStorage.setItem('extraRoles', JSON.stringify(extraRoles));
  }, [extraRoles]);

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
    extraRoles.forEach((role) => addRoleToMap(role));
    return Array.from(roleMap.values()).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [templates, extraRoles]);

  const permissionColumns = useMemo(() => {
    return allRoles.filter((role) => !['member', 'admin'].includes(normalizeRoleKey(role)));
  }, [allRoles]);

  const addRole = (e) => {
    e.preventDefault();
    const name = newRoleName.trim();
    if (!name) return;
    const key = normalizeRoleKey(name);
    if (allRoles.some((existing) => normalizeRoleKey(existing) === key)) {
      alert('Role aldready exist');
      return;
    }
    setExtraRoles((prev) => [...prev, name]);
    setNewRoleName('');
  };

  const deleteRole = (role) => {
    if (!window.confirm(`Are you sure you want to delete the role "${role}"?`)) {
      return;
    }
    setExtraRoles((prev) => prev.filter((item) => normalizeRoleKey(item) !== normalizeRoleKey(role)));
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
      if (extraRoles.includes(oldName)) {
        setExtraRoles((prev) => prev.map((r) => (r === oldName ? trimmed : r)));
      }
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

  {/*const changePassword = async (currentPassword, newPassword) => {
    const token = localStorage.getItem('token');
    const res = await fetch(`${API}/users/me/password`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ currentPassword, newPassword })
    });
    const data = await res.json();
    if (res.ok) {
      alert('Password changed successfully');
      return true;
    } else {
      alert(data.error || 'Could not change password');
      return false;
    }
  };*/}

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
                <button className="secondary" onClick={() => setShowChangePassword(true)}>
                  Change password
                </button>
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

      {auth && showChangePassword ? (
          <div className="login-popover" role="dialog" aria-modal="true">
            <div className="login-modal">
              <form onSubmit={submitChangePassword}>
              <h2>Change password</h2>

                <input
                    type="password"
                    placeholder="Current password"
                    value={changePasswordForm.currentPassword}
                    onChange={(e) => setChangePasswordForm((prev) => ({ ...prev, currentPassword: e.target.value }))}
                />

                <input
                    type="password"
                    placeholder="New password"
                    value={changePasswordForm.newPassword}
                    onChange={(e) => setChangePasswordForm((prev) => ({ ...prev, newPassword: e.target.value }))}
                />

                <input
                    type="password"
                    placeholder="Confirm new password"
                    value={changePasswordForm.confirmPassword}
                    onChange={(e) => setChangePasswordForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                />

                <div className="login-panel-actions">
                  <button
                      type="button"
                      className="secondary"
                      onClick={() => setShowChangePassword(false)}
                  >
                    Cancel
                  </button>
                  <button type="submit">Save</button>
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
              <button className={(page === 'scheduler' || page === 'scheduler-detail') ? 'tab active' : 'tab'} onClick={goToSchedulerList}>
                Operation scheduler
              </button>
              <button className={page === 'builder' ? 'tab active' : 'tab'} onClick={goToBuilder}>
                Template Builder
              </button>
              <button className={page === 'roles' ? 'tab active' : 'tab'} onClick={goToRoles}>
                Roles
              </button>
              <button className={page === 'players' ? 'tab active' : 'tab'} onClick={goToPlayers}>
                Player List
              </button>
              <button className={page === 'settings' ? 'tab active' : 'tab'} onClick={goToSettings}>
                Settings
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

              {overviewOps.map((op) => (
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
                    setShowLoginPanel={setShowLoginPanel}
                    showOpInScheduler={showOpInScheduler}
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
                  changePasswordForm={changePasswordForm}
                  setChangePasswordForm={setChangePasswordForm}
              />
          ) : null}
          {auth && (isAdmin || isMissionmaker) && page === 'scheduler' ? (
            <section className="card">
              <div className="builder-toolbar">
                <div>
                  <h3>Operation scheduler</h3>
                  <p>Create and manage scheduled and recurring operations.</p>
                </div>
              </div>

              <section className="card role-add-section">
                <h4>Schedule new operation</h4>
                <form className="role-add-form" onSubmit={createOp}>
                  <input
                    placeholder="Operation name"
                    value={opForm.name}
                    onChange={(e) => setOpForm((prev) => ({ ...prev, name: e.target.value }))}
                  />
                  <select
                    value={opForm.templateId || ''}
                    onChange={(e) => setOpForm((prev) => ({ ...prev, templateId: Number(e.target.value) }))}
                  >
                    <option value="">Choose template</option>
                    {templates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="date"
                    value={opForm.date}
                    onChange={(e) => setOpForm((prev) => ({ ...prev, date: e.target.value }))}
                  />
                  <input
                    type="time"
                    value={opForm.time}
                    onChange={(e) => setOpForm((prev) => ({ ...prev, time: e.target.value }))}
                  />
                  <input
                    placeholder="Server name (optional)"
                    value={opForm.serverName}
                    onChange={(e) => setOpForm((prev) => ({ ...prev, serverName: e.target.value }))}
                  />
                  <input
                    placeholder="Modlist URL (optional)"
                    value={opForm.modlist}
                    onChange={(e) => setOpForm((prev) => ({ ...prev, modlist: e.target.value }))}
                  />
                  <input
                    placeholder="TS3 address (optional)"
                    value={opForm.tsAddress}
                    onChange={(e) => setOpForm((prev) => ({ ...prev, tsAddress: e.target.value }))}
                  />
                  <select
                    value={opForm.recurrence}
                    onChange={(e) => setOpForm((prev) => ({ ...prev, recurrence: e.target.value }))}
                  >
                    <option value="none">No recurrence</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="biweekly">Every 2 weeks</option>
                    <option value="monthly">Monthly</option>
                  </select>

                  {(opForm.recurrence === 'weekly' || opForm.recurrence === 'biweekly') && (
                    <div className="weekly-days">
                      <label>Choose days:</label>
                      <div className="weekday-grid">
                        {weekDayLabels.map((dayOption) => (
                          <label key={dayOption.value}>
                            <input
                              type="checkbox"
                              checked={opForm.weeklyDays.includes(dayOption.value)}
                              onChange={() => toggleWeeklyDay(dayOption.value)}
                            />
                            {dayOption.label}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  {opForm.recurrence === 'monthly' ? (
                    <input
                      type="number"
                      min="1"
                      max="31"
                      value={opForm.monthlyDay}
                      onChange={(e) => setOpForm((prev) => ({ ...prev, monthlyDay: Number(e.target.value) }))}
                      placeholder="Day of month"
                    />
                  ) : null}
                  <div className="role-add-submit-row">
                    <button type="submit" className="small create-op-button">Create operation</button>
                  </div>
                </form>
              </section>

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
                loadTemplateIntoOp={loadTemplateIntoOp}
                deleteRecurrence={deleteRecurrence}
                deleteOp={deleteOp}
                updateOpMeta={updateOpMeta}
                handleModlistDragOver={handleModlistDragOver}
                handleModlistDrop={handleModlistDrop}
                updateOpSectionMeta={updateOpSectionMeta}
                users={users}
                updateOpSlot={updateOpSlot}
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
                deleteSection={deleteSection}
                handleSlotDragOver={handleSlotDragOver}
                handleSlotDrop={handleSlotDrop}
                handleSlotDragStart={handleSlotDragStart}
                setDraggedSlot={setDraggedSlot}
                updateSlot={updateSlot}
                flushSlotUpdate={flushSlotUpdate}
                deleteSlot={deleteSlot}
                addSlot={addSlot}
                setTemplateOverride={setTemplateOverride}
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
                          flowLinkSource={flowLinkSource}
                          getCanvasSize={getCanvasSize}
                          getCanvasNode={getCanvasNode}
                          getTemplateFlowEdges={getTemplateFlowEdges}
                          addSectionQuick={addSectionQuick}
                          clearTemplateFlowEdges={clearTemplateFlowEdges}
                          resetTemplateCanvasLayout={resetTemplateCanvasLayout}
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
                          setTemplateOverride={setTemplateOverride}
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
                      <input
                        placeholder="Rank"
                        value={userForm.rank}
                        onChange={(e) => setUserForm({ ...userForm, rank: e.target.value })}
                      />
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
                                <td>{user.rank || '-'}</td>
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

              {page === 'roles' && (
                <section className="card">
                  <div className="playerlist-toolbar">
                    <button onClick={goToDashboard} className="secondary small">
                      Back to dashboard
                    </button>
                    <div>
                      <h3>All roles</h3>
                      <p>View all roles currently available in the system.</p>
                    </div>
                  </div>
                  <section className="card role-add-section">
                    <h4>Add new role</h4>
                    <form className="role-add-form" onSubmit={addRole}>
                      <input
                        placeholder="New role name"
                        value={newRoleName}
                        onChange={(e) => setNewRoleName(e.target.value)}
                      />
                      <button type="submit">Add</button>
                    </form>
                  </section>
                  {allRoles.length === 0 ? (
                    <p>No roles defined yet. Add slots to templates to make roles available.</p>
                  ) : (
                    <div className="role-grid">
                      {allRoles.map((role) => {
                        const assignedCount = templates.reduce((count, template) => {
                          return count + template.sections?.reduce((sectionCount, section) => {
                            return sectionCount + section.slots?.filter((slot) => slot.role === role && slot.assignedUserId).length;
                          }, 0);
                        }, 0);
                        const slotCount = templates.reduce((count, template) => {
                          return count + template.sections?.reduce((sectionCount, section) => {
                            return sectionCount + section.slots?.filter((slot) => slot.role === role).length;
                          }, 0);
                        }, 0);
                        const allowedCount = templates.reduce((count, template) => {
                          return count + template.sections?.reduce((sectionCount, section) => {
                            return sectionCount + section.slots?.filter((slot) => slot.allowedRoles?.includes(role)).length;
                          }, 0);
                        }, 0);
                        const isRemovable = extraRoles.includes(role);
                      return (
                          <div key={role} className="role-card">
                            <div className="role-card-header">
                              {renamingRole === role ? (
                                <form
                                  className="role-rename-form"
                                  onSubmit={(e) => { e.preventDefault(); renameRole(role, renameValue); }}
                                >
                                  <input
                                    autoFocus
                                    value={renameValue}
                                    onChange={(e) => setRenameValue(e.target.value)}
                                    className="role-rename-input"
                                  />
                                  <button type="submit" className="small">Save</button>
                                  <button type="button" className="secondary small" onClick={() => setRenamingRole(null)}>Cancel</button>
                                </form>
                              ) : (
                                <h4>{role}</h4>
                              )}
                              <div style={{display:'flex',gap:'0.4rem'}}>
                                {renamingRole !== role ? (
                                  <button
                                    type="button"
                                    className="secondary small"
                                    onClick={() => { setRenamingRole(role); setRenameValue(role); }}
                                  >
                                    Rename
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  className="secondary small"
                                  disabled={!isRemovable}
                                  onClick={() => deleteRole(role)}
                                >
                                  {isRemovable ? 'Delete' : 'System'}
                                </button>
                              </div>
                            </div>
                            <p>Occupied: {assignedCount}</p>
                            <p>Slots: {slotCount}</p>
                            <p>Allowed in: {allowedCount}</p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              )}
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
