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
  const [page, setPage] = useState('dashboard');
  const [view, setView] = useState('login');
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');
  const [form, setForm] = useState({ username: '', password: '', role: 'member', rank: '', status: 'Active' });
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

  const loadData = async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    const res = await fetch(`${API}/data`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    const templates = (data.templates || []).map((template) => ({
      ...template,
      sections: template.sections || []
    }));
    setUsers(data.users || []);
    setTemplates(templates);
    setOps(data.ops || []);
    setRecurrences(data.recurrences || []);
    setAuth(data.user);
    setSelectedTemplateId(templates?.[0]?.id || null);
    setSelectedOpId(data.ops?.[0]?.id || null);
    setOpForm((prev) => ({ ...prev, templateId: templates?.[0]?.id || null }));
    setView('dashboard');
    setPage('dashboard');
  };

  const goToBuilder = () => setPage('builder');
  const goToRoles = () => setPage('roles');
  const goToPlayers = () => setPage('players');
  const goToDashboard = () => setPage('dashboard');
  const goToOpDetail = (opId) => {
    setSelectedOpId(opId);
    setPage('op-detail');
  };

  useEffect(() => {
    loadData();
  }, []);

  const login = async (e) => {
    e.preventDefault();
    const res = await fetch(`${API}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: form.username, password: form.password })
    });
    const data = await res.json();
    if (data.token) {
      localStorage.setItem('token', data.token);
      setAuth(data.user);
      setView('dashboard');
      loadData();
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
        setPage('dashboard');
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
      body: JSON.stringify(form)
    });
    const data = await res.json();
    if (data.user) {
      setUsers((prev) => [...prev, data.user]);
      setForm((prev) => ({ ...prev, username: '', password: '', role: 'member', rank: '', status: 'Active' }));
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    setAuth(null);
    setView('login');
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
  const getTemplateName = (templateId) => templates.find((template) => template.id === Number(templateId))?.name || 'Onbekend template';
  const sortedOps = useMemo(() => {
    return [...ops].sort((a, b) => {
      if (a.date === b.date) return a.time.localeCompare(b.time);
      return a.date.localeCompare(b.date);
    });
  }, [ops]);

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
          {auth ? <button onClick={logout}>Logout</button> : null}
        </div>
      </header>

      {!auth ? (
        <form className="card" onSubmit={login}>
          <h2>Login</h2>
          <input
            placeholder="Username"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
          />
          <input
            type="password"
            placeholder="Password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
          <button type="submit">Login</button>
        </form>
      ) : (
        <div className="dashboard">
          <section className="card header-card">
            <div>
              <h2>Welcome, {auth.username}</h2>
              <p>Role: {auth.role}</p>
            </div>
            {isAdmin ? (
              <div className="top-tabs">
                <button className={page === 'dashboard' ? 'tab active' : 'tab'} onClick={goToDashboard}>
                  Dashboard
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

          {isAdmin ? (
            <>
              {page === 'dashboard' && (
                <section className="card">
                      <div className="builder-toolbar">
                        <div>
                          <h3>Upcoming operations</h3>
                          <p>Create an operation with date, time and selected template.</p>
                        </div>
                        <button onClick={createTemplate}>New template</button>
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

                      <div className="template-list">
                        {sortedOps.length === 0 ? (
                          <div className="empty-state">No operations scheduled yet.</div>
                        ) : (
                          sortedOps.map((op) => (
                            <div key={op.id} className="template-list-item">
                              <button className={selectedOpId === op.id ? 'selected' : ''} onClick={() => goToOpDetail(op.id)}>
                                {op.name} - {op.date} {op.time} ({getTemplateName(op.templateId)})
                              </button>
                              <button className="secondary small" onClick={() => deleteOp(op.id)}>
                                Delete
                              </button>
                            </div>
                          ))
                        )}
                      </div>

                      <section className="card">
                        <h4>Recurring operations</h4>
                        {recurrences.length === 0 ? (
                          <p>No recurring operations set.</p>
                        ) : (
                          recurrences.map((recurrence) => (
                            <div key={recurrence.id} className="template-list-item">
                              <div>
                                <strong>{recurrence.name}</strong>
                                <p>{getTemplateName(recurrence.templateId)}</p>
                                <p>{recurrenceLabel(recurrence)} at {recurrence.time}</p>
                                {recurrence.repeatUntil ? <p>Until {recurrence.repeatUntil}</p> : null}
                              </div>
                              <button className="secondary small" onClick={() => deleteRecurrence(recurrence.id)}>
                                Delete
                              </button>
                            </div>
                          ))
                        )}
                      </section>
                    </section>
                  )}

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
                                  <button onClick={() => addSlot(template.id, section.id)} className="secondary small">
                                    Add slot
                                  </button>
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
                                      <strong>{slot.name}</strong>
                                      <p className="slot-meta">{slot.role}</p>
                                      {slot.notes ? <p className="slot-meta">{slot.notes}</p> : null}
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

              {page === 'players' && (
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
                        value={form.username}
                        onChange={(e) => setForm({ ...form, username: e.target.value })}
                      />
                      <input
                        type="password"
                        placeholder="Password"
                        value={form.password}
                        onChange={(e) => setForm({ ...form, password: e.target.value })}
                      />
                      <input
                        placeholder="Rank"
                        value={form.rank}
                        onChange={(e) => setForm({ ...form, rank: e.target.value })}
                      />
                      <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                        <option value="Active">Active</option>
                        <option value="Inactive">Inactive</option>
                        <option value="LoA">LoA</option>
                      </select>
                      <label>
                        Admin status
                        <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
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
                              <h4>{role}</h4>
                              <button
                                type="button"
                                className="secondary small"
                                disabled={!isRemovable}
                                onClick={() => deleteRole(role)}
                              >
                                {isRemovable ? 'Delete' : 'System'}
                              </button>
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
      )}
    </div>
  );
}

export default App;
