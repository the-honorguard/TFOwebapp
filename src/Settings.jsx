import { useEffect, useState } from 'react';

export default function Settings({
                                   defaultOpSettings,
                                   setDefaultOpSettings,
                                   templates,
                                   changePassword
                                 }) {
  const [local, setLocal] = useState({
    templateId: defaultOpSettings.templateId || '',
    time: defaultOpSettings.time || '',
    serverName: defaultOpSettings.serverName || '',
    modlist: defaultOpSettings.modlist || '',
    tsAddress: defaultOpSettings.tsAddress || '',
    recurrence: defaultOpSettings.recurrence || 'none',
    minSignupAge: defaultOpSettings.minSignupAge ?? 17
  });

  useEffect(() => {
    setLocal({
      templateId: defaultOpSettings.templateId || '',
      time: defaultOpSettings.time || '',
      serverName: defaultOpSettings.serverName || '',
      modlist: defaultOpSettings.modlist || '',
      tsAddress: defaultOpSettings.tsAddress || '',
      recurrence: defaultOpSettings.recurrence || 'none',
      minSignupAge: defaultOpSettings.minSignupAge ?? 17
    });
  }, [defaultOpSettings]);

  const save = (e) => {
    e.preventDefault();
    setDefaultOpSettings({
      templateId: local.templateId || null,
      time: local.time || '',
      serverName: local.serverName || '',
      modlist: local.modlist || '',
      tsAddress: local.tsAddress || '',
      recurrence: local.recurrence || 'none',
      minSignupAge: Number(local.minSignupAge) || 17
    });
    alert('Default settings saved');
  };

  return (
      <section className="card">
        <h3>Default values for new operations</h3>

        <form onSubmit={save}>
          <div className="form-row">
            <label>Template</label>
            <select
                value={local.templateId || ''}
                onChange={(e) => setLocal((s) => ({ ...s, templateId: e.target.value }))}
            >
              <option value="">-- None --</option>
              {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
              ))}
            </select>
          </div>

          <div className="form-row">
            <label>Time</label>
            <input
                value={local.time}
                onChange={(e) => setLocal((s) => ({ ...s, time: e.target.value }))}
            />
          </div>

          <div className="form-row">
            <label>Server name</label>
            <input
                value={local.serverName}
                onChange={(e) => setLocal((s) => ({ ...s, serverName: e.target.value }))}
            />
          </div>

          <div className="form-row">
            <label>Modlist</label>
            <input
                value={local.modlist}
                onChange={(e) => setLocal((s) => ({ ...s, modlist: e.target.value }))}
            />
          </div>

          <div className="form-row">
            <label>TS address</label>
            <input
                value={local.tsAddress}
                onChange={(e) => setLocal((s) => ({ ...s, tsAddress: e.target.value }))}
            />
          </div>

          <div className="form-row">
            <label>Recurrence</label>
            <select
                value={local.recurrence}
                onChange={(e) => setLocal((s) => ({ ...s, recurrence: e.target.value }))}
            >
              <option value="none">None</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="biweekly">Biweekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>

          <div className="form-row">
            <label>Minimum signup age</label>
            <input
                type="number"
                min="13"
                max="120"
                value={local.minSignupAge}
                onChange={(e) => setLocal((s) => ({ ...s, minSignupAge: e.target.value }))}
            />
          </div>

          <div className="form-row">
            <small>
              Users must be older than this age to complete signup; signup will validate integer age
              and reject younger users.
            </small>
          </div>

          <div className="form-row">
            <button type="submit">Save</button>
          </div>
        </form>

        <section className="card" style={{ marginTop: '1.5rem' }}>
          <h3>Change password</h3>
          <ChangePasswordForm changePassword={changePassword} />
        </section>
      </section>
  );
}

function ChangePasswordForm({ changePassword }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
  }, []);

  const submit = async (e) => {
    e.preventDefault();

    if (!changePassword) {
      alert('Password change is not available');
      return;
    }

    if (newPassword !== confirmPassword) {
      alert('New passwords do not match');
      return;
    }

    const success = await changePassword(currentPassword, newPassword);
    if (success) {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    }
  };

  return (
      <form onSubmit={submit}>
        <div className="form-row">
          <label>Current password</label>
          <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
          />
        </div>

        <div className="form-row">
          <label>New password</label>
          <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
          />
        </div>

        <div className="form-row">
          <label>Confirm new password</label>
          <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </div>

        <div className="form-row">
          <button type="submit">Save password</button>
        </div>
      </form>
  );
}