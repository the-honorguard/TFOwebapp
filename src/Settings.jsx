import { useState } from 'react';

export default function Settings({ defaultOpSettings, setDefaultOpSettings, templates }) {
  const [local, setLocal] = useState({
    templateId: defaultOpSettings.templateId || '',
    time: defaultOpSettings.time || '',
    serverName: defaultOpSettings.serverName || '',
    modlist: defaultOpSettings.modlist || '',
    tsAddress: defaultOpSettings.tsAddress || '',
    recurrence: defaultOpSettings.recurrence || 'none'
  });

  const save = (e) => {
    e.preventDefault();
    setDefaultOpSettings({
      templateId: local.templateId || null,
      time: local.time || '',
      serverName: local.serverName || '',
      modlist: local.modlist || '',
      tsAddress: local.tsAddress || '',
      recurrence: local.recurrence || 'none'
    });
    alert('Standaardwaarden opgeslagen');
  };

  return (
    <section className="card">
      <h3>Standaardwaarden voor nieuwe operatie</h3>
      <form onSubmit={save}>
        <div className="form-row">
          <label>Template</label>
          <select value={local.templateId || ''} onChange={(e) => setLocal((s) => ({ ...s, templateId: e.target.value }))}>
            <option value="">-- Geen --</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
        <div className="form-row">
          <label>Tijd</label>
          <input value={local.time} onChange={(e) => setLocal((s) => ({ ...s, time: e.target.value }))} />
        </div>
        <div className="form-row">
          <label>Server naam</label>
          <input value={local.serverName} onChange={(e) => setLocal((s) => ({ ...s, serverName: e.target.value }))} />
        </div>
        <div className="form-row">
          <label>Modlist</label>
          <input value={local.modlist} onChange={(e) => setLocal((s) => ({ ...s, modlist: e.target.value }))} />
        </div>
        <div className="form-row">
          <label>TS adres</label>
          <input value={local.tsAddress} onChange={(e) => setLocal((s) => ({ ...s, tsAddress: e.target.value }))} />
        </div>
        <div className="form-row">
          <label>Recurrence</label>
          <select value={local.recurrence} onChange={(e) => setLocal((s) => ({ ...s, recurrence: e.target.value }))}>
            <option value="none">None</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="biweekly">Biweekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>
        <div className="form-row">
          <button type="submit">Opslaan</button>
        </div>
      </form>
    </section>
  );
}
