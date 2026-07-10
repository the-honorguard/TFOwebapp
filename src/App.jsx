import { useEffect, useMemo, useState } from 'react';

const API = '/api';

function App() {
  const [auth, setAuth] = useState(null);
  const [users, setUsers] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [ops, setOps] = useState([]);
  const [recurrences, setRecurrences] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);
  const [selectedOpId, setSelectedOpId] = useState(null);
  const [selectedRecurrenceId, setSelectedRecurrenceId] = useState(null);
  const [page, setPage] = useState('overview');
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [showLoginPanel, setShowLoginPanel] = useState(false);
  const [userForm, setUserForm] = useState({ username: '', password: '', role: 'member', rank: '', status: 'Active' });
  const [opForm, setOpForm] = useState({ name: '', templateId: null, date: '', time: '', recurrence: 'none', weeklyDays: [], monthlyDay: '' });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme((current) => (current === 'dark' ? 'light' : 'dark'));

  const weekDayLabels = [
    { label: 'Ma', value: 1 },
    { label: 'Di', value: 2 },
    { label: 'Wo', value: 3 },
    { label: 'Do', value: 4 },
    { label: 'Vr', value: 5 },
    { label: 'Za', value: 6 },
    { label: 'Zo', value: 0 }
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
  const showOpOnDashboard = (opId) => {
    setSelectedOpId(opId);
    setPage('overview');
  };
  const showOpInScheduler = (opId, recurrenceId = null) => {
    setSelectedOpId(opId);
    setSelectedRecurrenceId(recurrenceId);
    setPage('scheduler-detail');
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

  const createTemplate = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem('token');
    const name = prompt('Template name');
    if (!name) return;
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
      setTemplates((prev) => [...prev, data.template]);
      setSelectedTemplateId(data.template.id);
      setOpForm((prev) => ({ ...prev, templateId: data.template.id }));
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
    setOpForm((prev) => ({ ...prev, name: '', date: '', time: '', recurrence: 'none', weeklyDays: [], monthlyDay: '' }));
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
      alert(data.error || 'Kon slot niet bijwerken');
    }
  };

  const updateOpSlot = async (opId, slotId, updates) => {
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
      alert(data.error || 'Could not update operation slot');
    }
  };

  const loadTemplateIntoOp = async (opId) => {
    if (!window.confirm('Reload the current template into this operation? Existing matching assignments will be kept, but manual slot edits will be replaced.')) {
      return;
    }

    const token = localStorage.getItem('token');
    const res = await fetch(`${API}/ops/${opId}/load-template`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    const data = await res.json();
    if (data.op) {
      setOps((prev) => prev.map((op) => (op.id === data.op.id ? data.op : op)));
    } else {
      alert(data.error || 'Could not reload template into operation');
    }
  };

  const addSection = async (templateId) => {
    const token = localStorage.getItem('token');
    const title = prompt('Section title');
    if (!title) return;
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
        return { ...template, sections: [...template.sections, data.section] };
      }));
    }
  };

  const renameSection = async (templateId, sectionId, currentTitle) => {
    const token = localStorage.getItem('token');
    const title = prompt('Section title', currentTitle);
    if (!title || title === currentTitle) return;

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
      alert(data.error || 'Could not rename section');
    }
  };

  const deleteSection = async (templateId, sectionId) => {
    if (!window.confirm('Are you sure you want to delete this section?')) return;

    const token = localStorage.getItem('token');
    const res = await fetch(`${API}/templates/${templateId}/sections/${sectionId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (res.ok) {
      setTemplates((prev) => prev.map((template) => {
        if (template.id !== templateId) return template;
        return {
          ...template,
          sections: template.sections.filter((section) => section.id !== sectionId)
        };
      }));
    } else {
      alert('Could not delete section');
    }
  };

  const addSlot = async (templateId, sectionId) => {
    const token = localStorage.getItem('token');
    const res = await fetch(`${API}/templates/${templateId}/slots`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        sectionId,
        name: 'Nieuwe slot',
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
            return { ...section, slots: [...section.slots, data.slot] };
          })
        };
      }));
    }
  };

  const updateSlot = async (templateId, slotId, updates) => {
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
    }
  };

  const deleteSlot = async (templateId, slotId) => {
    if (!window.confirm('Are you sure you want to delete this slot?')) return;
    const token = localStorage.getItem('token');
    const res = await fetch(`${API}/templates/${templateId}/slots/${slotId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    if (res.ok) {
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
    } else {
      alert('Could not delete slot');
    }
  };

  const joinSlot = async (templateId, slotId) => {
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
      alert(data.error || 'Kon slot niet bijwerken');
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

  const normalizeRoleKey = (role) => role?.trim().toLowerCase();

  const permissionColumns = useMemo(() => {
    const cols = new Set();
    templates.forEach((template) => {
      template.sections?.forEach((section) => {
        section.slots?.forEach((slot) => {
          if (slot.role && !['member', 'admin'].includes(normalizeRoleKey(slot.role))) cols.add(slot.role);
        });
      });
    });
    return Array.from(cols);
  }, [templates]);

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

  const [extraRoles, setExtraRoles] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('extraRoles') || '[]');
    } catch (error) {
      return [];
    }
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

  const addRole = (e) => {
    e.preventDefault();
    const name = newRoleName.trim();
    if (!name) return;
    const key = normalizeRoleKey(name);
    if (allRoles.some((existing) => normalizeRoleKey(existing) === key)) {
      alert('Deze rol bestaat al.');
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

  const deleteTemplate = async (templateId) => {
    if (!window.confirm('Are you sure you want to delete this template?')) return;
    const token = localStorage.getItem('token');
    const res = await fetch(`${API}/templates/${templateId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    if (res.ok) {
      setTemplates((prev) => prev.filter((template) => template.id !== templateId));
      if (selectedTemplateId === templateId) {
        setSelectedTemplateId((prev) => {
          const nextTemplates = templates.filter((template) => template.id !== templateId);
          return nextTemplates?.[0]?.id || null;
        });
      }
    } else {
      alert('Could not delete template');
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
    <div className="app-shell">
      <header>
        <h1>TFO Attendance</h1>
        <div className="header-actions">
          <button className="theme-toggle" onClick={toggleTheme}>
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
          {auth ? <button onClick={logout}>Logout</button> : <button onClick={() => setShowLoginPanel((prev) => !prev)}>Login</button>}
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

      <div className="dashboard">
        <section className="card header-card">
          <div>
            <h2>{auth ? `Welcome, ${auth.username}` : 'TFO Overview'}</h2>
            <p>{auth ? `Role: ${auth.role}` : 'View the next operation now. Login when you want to claim a slot.'}</p>
          </div>
          {isAdmin ? (
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
                <section key={op.id} className="card">
                  <div className="builder-toolbar">
                    <div>
                      <h4>{op.name}</h4>
                      <p>{op.date} at {op.time} using {getTemplateName(op.templateId)}.</p>
                    </div>
                  </div>
                  <div className="builder-grid">
                    {op.sections?.length === 0 ? (
                      <div className="empty-state">This operation has no sections.</div>
                    ) : (
                      op.sections.map((section, index) => (
                        <div key={section.id} className={`builder-panel panel-${index % 5}`}>
                          <div className="panel-title">
                            <strong>{section.title}</strong>
                          </div>
                          <div className="panel-content">
                            {section.slots.length === 0 ? (
                              <p className="panel-empty">No slots in this section.</p>
                            ) : (
                              section.slots.map((slot) => {
                                const assignedUser = users.find((user) => user.id === slot.assignedUserId);
                                const allowedRoles = slot.allowedRoles || [];
                                const canJoin = !assignedUser && (allowedRoles.length === 0 || allowedRoles.includes(auth?.role) || auth?.role === 'admin');

                                return (
                                  <div key={slot.id} className="slot-card">
                                    <div>
                                      {auth?.role === 'admin' ? (
                                        <>
                                          <input
                                            className="slot-name-input"
                                            value={slot.name}
                                            placeholder="Slot name"
                                            onChange={(e) => updateOpSlot(op.id, slot.id, { name: e.target.value })}
                                          />
                                          <textarea
                                            className="slot-notes-input"
                                            value={slot.notes}
                                            placeholder="Place extra notes here"
                                            onChange={(e) => updateOpSlot(op.id, slot.id, { notes: e.target.value })}
                                          />
                                          <div className="slot-meta-row">
                                            <select
                                              value={slot.role}
                                              onChange={(e) => updateOpSlot(op.id, slot.id, { role: e.target.value })}
                                            >
                                              {allRoles.length > 0
                                                ? allRoles.map((roleOption) => (
                                                    <option key={roleOption} value={roleOption}>
                                                      {roleOption}
                                                    </option>
                                                  ))
                                                : ['Rifleman', 'Admin'].map((roleOption) => (
                                                    <option key={roleOption} value={roleOption}>
                                                      {roleOption}
                                                    </option>
                                                  ))}
                                            </select>
                                          </div>
                                        </>
                                      ) : (
                                        <>
                                          <strong>{slot.name}</strong>
                                          <p className="slot-meta">{slot.role}</p>
                                          {slot.notes ? <p className="slot-meta">{slot.notes}</p> : null}
                                        </>
                                      )}
                                    </div>
                                    <div className="slot-footer">
                                      <span>{assignedUser ? `Occupied by ${assignedUser.username}` : 'Available'}</span>
                                      {auth && canJoin ? (
                                        <button className="secondary small" onClick={() => joinOpSlot(op.id, slot.id)}>
                                          Join
                                        </button>
                                      ) : !auth && !assignedUser ? (
                                        <button className="secondary small" onClick={() => setShowLoginPanel(true)}>
                                          Login to join
                                        </button>
                                      ) : null}
                                    </div>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </section>
              ))}
            </section>
          ) : null}

          {auth && isAdmin && page === 'scheduler' ? (
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
                  <button type="submit">Create operation</button>
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

          {auth && isAdmin && page === 'scheduler-detail' && selectedOp ? (() => {
            const selectedRecurrence = selectedRecurrenceId ? recurrences.find((r) => r.id === selectedRecurrenceId) : null;
            return (
            <section className="card">
              <div className="builder-toolbar">
                <button className="secondary small" onClick={goToSchedulerList}>
                  ← Back to operations
                </button>
                <div>
                  <h3>{selectedOp.name}{selectedRecurrence ? <span className="op-list-badge" style={{marginLeft:'0.5rem'}}>Recurring</span> : null}</h3>
                  <p>{selectedOp.date} at {selectedOp.time} &middot; {getTemplateName(selectedOp.templateId)}</p>
                </div>
                <div style={{display:'flex',gap:'0.5rem'}}>
                  <button className="secondary" onClick={() => loadTemplateIntoOp(selectedOp.id)}>
                    Load template
                  </button>
                  {selectedRecurrence
                    ? <button className="secondary small" onClick={() => { deleteRecurrence(selectedRecurrence.id); goToSchedulerList(); }}>Delete</button>
                    : <button className="secondary small" onClick={() => deleteOp(selectedOp.id)}>Delete</button>
                  }
                </div>
              </div>

              {selectedOp.sections?.length === 0 ? (
                <div className="empty-state">This operation has no sections. Load a template to add slots.</div>
              ) : (
                <div className="builder-grid">
                  {selectedOp.sections.map((section, index) => (
                    <div key={section.id} className={`builder-panel panel-${index % 5}`}>
                      <div className="panel-title">
                        <strong>{section.title}</strong>
                      </div>
                      <div className="panel-content">
                        {section.slots.length === 0 ? (
                          <p className="panel-empty">No slots in this section.</p>
                        ) : (
                          section.slots.map((slot) => {
                            const assignedUser = users.find((user) => user.id === slot.assignedUserId);
                            const allowedRoles = slot.allowedRoles || [];
                            const canJoin = !assignedUser && (allowedRoles.length === 0 || allowedRoles.includes(auth?.role) || auth?.role === 'admin');

                            return (
                              <div key={slot.id} className="slot-card builder-slot">
                                <div>
                                  <input
                                    className="slot-name-input"
                                    value={slot.name}
                                    placeholder="Slot name"
                                    onChange={(e) => updateOpSlot(selectedOp.id, slot.id, { name: e.target.value })}
                                  />
                                  <textarea
                                    className="slot-notes-input"
                                    value={slot.notes}
                                    placeholder="Place extra notes here"
                                    onChange={(e) => updateOpSlot(selectedOp.id, slot.id, { notes: e.target.value })}
                                  />
                                  <div className="slot-meta-row">
                                    <select
                                      value={slot.role}
                                      onChange={(e) => updateOpSlot(selectedOp.id, slot.id, { role: e.target.value })}
                                    >
                                      {allRoles.length > 0
                                        ? allRoles.map((roleOption) => (
                                            <option key={roleOption} value={roleOption}>
                                              {roleOption}
                                            </option>
                                          ))
                                        : ['Rifleman', 'Admin'].map((roleOption) => (
                                            <option key={roleOption} value={roleOption}>
                                              {roleOption}
                                            </option>
                                          ))}
                                    </select>
                                  </div>
                                </div>
                                <div className="slot-footer">
                                  <span>{assignedUser ? `Occupied by ${assignedUser.username}` : 'Available'}</span>
                                  {canJoin ? (
                                    <button className="secondary small" onClick={() => joinOpSlot(selectedOp.id, slot.id)}>
                                      Join
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {selectedRecurrence ? (
                <section className="card">
                  <h4>Recurring settings</h4>
                  <div className="recurring-settings-form">
                    <label>
                      Repeat pattern
                      <select
                        value={selectedRecurrence.recurrence}
                        onChange={(e) => updateRecurrence(selectedRecurrence.id, { recurrence: e.target.value })}
                      >
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                        <option value="biweekly">Every 2 weeks</option>
                        <option value="monthly">Monthly</option>
                      </select>
                    </label>

                    {(selectedRecurrence.recurrence === 'weekly' || selectedRecurrence.recurrence === 'biweekly') && (
                      <div className="weekly-days">
                        <label>Choose days:</label>
                        <div className="weekday-grid">
                          {weekDayLabels.map((dayOption) => (
                            <label key={dayOption.value}>
                              <input
                                type="checkbox"
                                checked={(selectedRecurrence.weeklyDays || []).includes(dayOption.value)}
                                onChange={() => toggleRecurrenceWeeklyDay(selectedRecurrence, dayOption.value)}
                              />
                              {dayOption.label}
                            </label>
                          ))}
                        </div>
                      </div>
                    )}

                    {selectedRecurrence.recurrence === 'monthly' ? (
                      <label>
                        Day of month
                        <input
                          type="number"
                          min="1"
                          max="31"
                          value={selectedRecurrence.monthlyDay || ''}
                          onChange={(e) => updateRecurrence(selectedRecurrence.id, { monthlyDay: Number(e.target.value) })}
                        />
                      </label>
                    ) : null}

                    <label>
                      Start date
                      <input
                        type="date"
                        value={selectedRecurrence.startDate || ''}
                        onChange={(e) => updateRecurrence(selectedRecurrence.id, { startDate: e.target.value })}
                      />
                    </label>

                    <label>
                      Time
                      <input
                        type="time"
                        value={selectedRecurrence.time || ''}
                        onChange={(e) => updateRecurrence(selectedRecurrence.id, { time: e.target.value })}
                      />
                    </label>

                    <label>
                      Repeat until (optional)
                      <input
                        type="date"
                        value={selectedRecurrence.repeatUntil || ''}
                        onChange={(e) => updateRecurrence(selectedRecurrence.id, { recurrenceEndDate: e.target.value || null })}
                      />
                    </label>
                  </div>
                  <div className="recurring-settings">
                    <p><strong>Pattern:</strong> {recurrenceLabel(selectedRecurrence)}</p>
                    {selectedRecurrence.nextDateTime ? <p><strong>Next occurrence:</strong> {selectedRecurrence.nextDateTime?.slice(0, 10)} {selectedRecurrence.nextDateTime?.slice(11, 16)}</p> : <p><strong>Next occurrence:</strong> None scheduled</p>}
                  </div>
                </section>
              ) : null}
            </section>
            );
          })() : null}

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
                        {templates.map((template) => (
                          <div key={template.id} className="template-list-item">
                            <button
                              className={selectedTemplateId === template.id ? 'selected' : ''}
                              onClick={() => setSelectedTemplateId(template.id)}
                            >
                              {template.name}
                            </button>
                            <button className="secondary small" onClick={() => deleteTemplate(template.id)}>
                              Delete
                            </button>
                          </div>
                        ))}
                      </div>
                      <div className="builder-actions">
                        <button onClick={createTemplate}>New template</button>
                      </div>
                    </div>
                  </section>

                  <section className="card">
                    <div className="builder-toolbar">
                      <div>
                        <h3>Configure template</h3>
                        <p>Edit the selected template contents.</p>
                      </div>
                      {selectedTemplateId ? (
                        <button onClick={() => addSection(selectedTemplateId)} className="secondary">
                          Add section
                        </button>
                      ) : null}
                    </div>

                    {selectedTemplateId ? (
                      templates.filter((template) => template.id === selectedTemplateId).map((template) => (
                        <div key={template.id} className="builder-grid">
                          {template.sections.length === 0 ? (
                            <div className="empty-state">This template has no sections yet. Add a section to start.</div>
                          ) : (
                            template.sections.map((section, index) => (
                              <div key={section.id} className={`builder-panel panel-${index % 5}`}>
                                <div className="panel-title">
                                  <strong>{section.title}</strong>
                                  <div className="slot-actions">
                                    <button
                                      onClick={() => renameSection(template.id, section.id, section.title)}
                                      className="secondary small"
                                    >
                                      Rename
                                    </button>
                                    <button onClick={() => deleteSection(template.id, section.id)} className="secondary small">
                                      Delete
                                    </button>
                                    <button onClick={() => addSlot(template.id, section.id)} className="secondary small">
                                      Add slot
                                    </button>
                                  </div>
                                </div>
                                <div className="panel-content">
                                  {section.slots.length === 0 ? (
                                    <p className="panel-empty">No slots in this section.</p>
                                  ) : (
                                    section.slots.map((slot) => {
                                      const assignedUser = users.find((user) => user.id === slot.assignedUserId);
                                      return (
                                        <div key={slot.id} className="slot-card builder-slot">
                                          <div>
                                            <input
                                              className="slot-name-input"
                                              value={slot.name}
                                              placeholder="Slot name"
                                              onChange={(e) => updateSlot(template.id, slot.id, { name: e.target.value })}
                                            />
                                            <textarea
                                              className="slot-notes-input"
                                              value={slot.notes}
                                              placeholder="Place extra notes here"
                                              onChange={(e) => updateSlot(template.id, slot.id, { notes: e.target.value })}
                                            />
                                            <div className="slot-meta-row">
                                              <select
                                                value={slot.role}
                                                onChange={(e) => updateSlot(template.id, slot.id, { role: e.target.value })}
                                              >
                                                {allRoles.length > 0
                                                  ? allRoles.map((roleOption) => (
                                                      <option key={roleOption} value={roleOption}>
                                                        {roleOption}
                                                      </option>
                                                    ))
                                                  : ['Rifleman', 'Admin'].map((roleOption) => (
                                                      <option key={roleOption} value={roleOption}>
                                                        {roleOption}
                                                      </option>
                                                    ))}
                                              </select>
                                            </div>
                                          </div>
                                          <div className="slot-footer">
                                            <span>{assignedUser ? `Occupied by ${assignedUser.username}` : 'Free'}</span>
                                            <div className="slot-actions">
                                              <button
                                                type="button"
                                                className="secondary small"
                                                onClick={() => deleteSlot(template.id, slot.id)}
                                              >
                                                Delete slot
                                              </button>
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })
                                  )}
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      ))
                    ) : (
                      <div className="empty-state">Choose a template to edit first.</div>
                    )}
                  </section>
                </>
              )}

              {page === 'op-detail' && selectedOp ? (
                <section className="card">
                  <div className="builder-toolbar">
                    <button onClick={goToDashboard} className="secondary small">
                      Back to overview
                    </button>
                    <div>
                      <h3>{selectedOp.name}</h3>
                      <p>Template: {getTemplateName(selectedOp.templateId)}</p>
                      <p>Date: {selectedOp.date} Time: {selectedOp.time}</p>
                    </div>
                  </div>

                  {selectedOp.sections?.length === 0 ? (
                    <div className="empty-state">This operation has no sections.</div>
                  ) : (
                    <div className="builder-grid">
                      {selectedOp.sections.map((section, index) => (
                        <div key={section.id} className={`builder-panel panel-${index % 5}`}>
                          <div className="panel-title">
                            <strong>{section.title}</strong>
                          </div>
                          <div className="panel-content">
                            {section.slots.length === 0 ? (
                              <p className="panel-empty">No slots in this section.</p>
                            ) : (
                              section.slots.map((slot) => {
                                const assignedUser = users.find((user) => user.id === slot.assignedUserId);
                                const canJoin = !assignedUser && (slot.allowedRoles.length === 0 || slot.allowedRoles.includes(auth.role) || auth.role === 'admin');
                                return (
                                  <div key={slot.id} className="slot-card">
                                    <div>
                                      {auth?.role === 'admin' ? (
                                        <>
                                          <input
                                            className="slot-name-input"
                                            value={slot.name}
                                            placeholder="Slot name"
                                            onChange={(e) => updateOpSlot(selectedOp.id, slot.id, { name: e.target.value })}
                                          />
                                          <textarea
                                            className="slot-notes-input"
                                            value={slot.notes}
                                            placeholder="Place extra notes here"
                                            onChange={(e) => updateOpSlot(selectedOp.id, slot.id, { notes: e.target.value })}
                                          />
                                          <div className="slot-meta-row">
                                            <select
                                              value={slot.role}
                                              onChange={(e) => updateOpSlot(selectedOp.id, slot.id, { role: e.target.value })}
                                            >
                                              {allRoles.length > 0
                                                ? allRoles.map((roleOption) => (
                                                    <option key={roleOption} value={roleOption}>
                                                      {roleOption}
                                                    </option>
                                                  ))
                                                : ['Rifleman', 'Admin'].map((roleOption) => (
                                                    <option key={roleOption} value={roleOption}>
                                                      {roleOption}
                                                    </option>
                                                  ))}
                                            </select>
                                          </div>
                                        </>
                                      ) : (
                                        <>
                                          <strong>{slot.name}</strong>
                                          <p className="slot-meta">{slot.role}</p>
                                          {slot.notes ? <p className="slot-meta">{slot.notes}</p> : null}
                                        </>
                                      )}
                                    </div>
                                    <div className="slot-footer">
                                      <span>{assignedUser ? `Occupied by ${assignedUser.username}` : 'Available'}</span>
                                      {canJoin ? (
                                        <button className="secondary small" onClick={() => joinOpSlot(selectedOp.id, slot.id)}>
                                          Join
                                        </button>
                                      ) : null}
                                    </div>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              ) : null}

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
                              {permissionColumns.map((permission) => (
                                <th key={permission}>{permission}</th>
                              ))}
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
                                  </select>
                                </td>
                                <td>
                                  <button className="secondary small" onClick={() => openRoleModal(user)}>
                                    Roles
                                  </button>
                                </td>
                                {permissionColumns.map((permission) => (
                                  <td key={permission}>
                                    <input
                                      type="checkbox"
                                      checked={Boolean(user.permissions?.[permission])}
                                      onChange={() => togglePermission(user.id, permission)}
                                    />
                                  </td>
                                ))}
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
                    {permissionColumns.length === 0 ? (
                      <p>Create a template with slots to display permissions.</p>
                    ) : null}
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
                <div className="role-list">
                  {permissionColumns.map((permission) => (
                    <label key={permission}>
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
