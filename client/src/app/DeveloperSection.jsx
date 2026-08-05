import { Bot, Check, Clipboard, KeyRound, LoaderCircle, Plus, Server, Terminal, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import Button from '../components/Button.jsx';
import { api } from '../lib/api.js';

const DEFAULT_SCOPES = ['messages.write', 'commands', 'events.read'];

export default function DeveloperSection({ onToast }) {
  const [apps, setApps] = useState([]);
  const [guilds, setGuilds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: '', description: '' });
  const [token, setToken] = useState('');
  const [install, setInstall] = useState({});
  const [command, setCommand] = useState({});

  async function reload() {
    const [appResult, guildResult] = await Promise.all([api.developerApps(), api.myGuilds()]);
    setApps(appResult.apps);
    setGuilds(guildResult.guilds || guildResult);
  }

  useEffect(() => {
    reload().catch((error) => onToast(error.message, 'error')).finally(() => setLoading(false));
  }, [onToast]);

  async function run(action, success) {
    if (busy) return;
    setBusy(true);
    try { await action(); await reload(); if (success) onToast(success, 'success'); }
    catch (error) { onToast(error.message, 'error'); }
    finally { setBusy(false); }
  }

  async function create(event) {
    event.preventDefault();
    await run(async () => {
      const result = await api.createDeveloperApp(form);
      setToken(result.token);
      setForm({ name: '', description: '' });
    }, 'Bot-Anwendung erstellt. Speichere den Token jetzt sicher.');
  }

  async function copy(value) {
    await navigator.clipboard.writeText(value);
    onToast('In die Zwischenablage kopiert.', 'success');
  }

  if (loading) return <div className="profile-settings-loading"><LoaderCircle className="spin" size={20} /> Entwicklerbereich wird geladen …</div>;

  return (
    <div className="developer-settings">
      <section className="developer-hero settings-large-panel">
        <span><Terminal size={18} /> GUILDORA DEVELOPER PLATFORM</span>
        <h4>Bots, Events und Slash-Commands</h4>
        <p>Erstelle echte Bot-Nutzer, installiere sie auf deinen Servern und steuere sie über die öffentliche REST-API.</p>
      </section>

      {token && (
        <section className="developer-token" role="status">
          <div><KeyRound size={18} /><span><strong>Token nur jetzt sichtbar</strong><small>Teile ihn niemals öffentlich oder in Screenshots.</small></span></div>
          <code>{token}</code>
          <Button type="button" onClick={() => copy(token)}><Clipboard size={16} /> Kopieren</Button>
          <button type="button" onClick={() => setToken('')}>Ich habe ihn gespeichert</button>
        </section>
      )}

      <form className="developer-create settings-large-panel" onSubmit={create}>
        <h4><Plus size={18} /> Neue Anwendung</h4>
        <label className="settings-field"><span>Name</span><input value={form.name} minLength={2} maxLength={48} placeholder="Mein Guildora Bot" onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
        <label className="settings-field"><span>Beschreibung</span><textarea value={form.description} maxLength={300} rows={3} placeholder="Was kann dein Bot?" onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
        <Button variant="primary" type="submit" disabled={busy || !form.name.trim()}><Bot size={17} /> Anwendung erstellen</Button>
      </form>

      {apps.map((app) => {
        const setup = install[app.id] || { guildId: guilds[0]?.id || '', scopes: DEFAULT_SCOPES };
        const draft = command[app.id] || { name: '', description: '', responseTemplate: '' };
        return (
          <section className="developer-app settings-large-panel" key={app.id}>
            <header><span className="developer-app__icon"><Bot size={22} /></span><span><h4>{app.name}</h4><small>{app.description || 'Keine Beschreibung'}</small></span><i className={app.enabled ? 'is-online' : ''}>{app.enabled ? 'Aktiv' : 'Pausiert'}</i></header>
            <div className="developer-app__actions">
              <Button type="button" onClick={() => run(async () => { const result = await api.rotateDeveloperToken(app.id); setToken(result.token); }, 'Token erneuert.')}><KeyRound size={15} /> Token erneuern</Button>
              <Button type="button" onClick={() => run(() => api.updateDeveloperApp(app.id, { enabled: !app.enabled }), app.enabled ? 'Bot pausiert.' : 'Bot aktiviert.')}><Check size={15} /> {app.enabled ? 'Pausieren' : 'Aktivieren'}</Button>
              <button className="developer-danger" type="button" onClick={() => run(() => api.deleteDeveloperApp(app.id), 'Bot gelöscht.')}><Trash2 size={15} /> Löschen</button>
            </div>

            <div className="developer-grid">
              <div>
                <h5><Server size={16} /> Auf Server installieren</h5>
                <select value={setup.guildId} onChange={(e) => setInstall({ ...install, [app.id]: { ...setup, guildId: e.target.value } })}>
                  {!guilds.length && <option value="">Kein Server verfügbar</option>}
                  {guilds.map((guild) => <option value={guild.id} key={guild.id}>{guild.name}</option>)}
                </select>
                <div className="developer-scopes">
                  {DEFAULT_SCOPES.map((scope) => <label key={scope}><input type="checkbox" checked={setup.scopes.includes(scope)} onChange={(e) => setInstall({ ...install, [app.id]: { ...setup, scopes: e.target.checked ? [...setup.scopes, scope] : setup.scopes.filter((item) => item !== scope) } })} /> {scope}</label>)}
                </div>
                <Button type="button" disabled={!setup.guildId || !setup.scopes.length} onClick={() => run(() => api.installDeveloperApp(app.id, setup), 'Bot installiert.')}><Plus size={15} /> Installieren/aktualisieren</Button>
                {app.guilds.map((guild) => <div className="developer-installation" key={guild.guild_id}><span><strong>{guild.name}</strong><small>{guild.scopes.join(' · ')}</small></span><button type="button" onClick={() => run(() => api.uninstallDeveloperApp(app.id, guild.guild_id), 'Bot entfernt.')}><Trash2 size={14} /></button></div>)}
              </div>
              <div>
                <h5><Terminal size={16} /> Slash-Command</h5>
                <input value={draft.name} placeholder="status" onChange={(e) => setCommand({ ...command, [app.id]: { ...draft, name: e.target.value } })} />
                <input value={draft.description} placeholder="Zeigt den Bot-Status" onChange={(e) => setCommand({ ...command, [app.id]: { ...draft, description: e.target.value } })} />
                <textarea value={draft.responseTemplate} rows={3} placeholder="Hallo {user}, Argumente: {args}" onChange={(e) => setCommand({ ...command, [app.id]: { ...draft, responseTemplate: e.target.value } })} />
                <Button type="button" disabled={!draft.name || !draft.description} onClick={() => run(async () => { await api.createDeveloperCommand(app.id, draft); setCommand({ ...command, [app.id]: { name: '', description: '', responseTemplate: '' } }); }, 'Slash-Command erstellt.')}><Plus size={15} /> Command anlegen</Button>
                {app.commands.map((item) => <div className="developer-command" key={item.id}><span><code>/{item.name}</code><small>{item.description}</small></span><button type="button" onClick={() => run(() => api.deleteDeveloperCommand(app.id, item.id), 'Command gelöscht.')}><Trash2 size={14} /></button></div>)}
              </div>
            </div>
          </section>
        );
      })}

      <section className="developer-docs settings-large-panel">
        <h4>API-Schnellstart</h4>
        <p>Basis-URL: <code>{location.origin}/api/v1</code></p>
        <pre><code>{`const response = await fetch('${location.origin}/api/v1/channels/CHANNEL_ID/messages', {
  method: 'POST',
  headers: { Authorization: 'Bearer BOT_TOKEN', 'Content-Type': 'application/json' },
  body: JSON.stringify({ content: 'Hallo von meinem Bot!' })
});`}</code></pre>
        <p>Events abrufen: <code>GET /events</code> · Interaktion beantworten: <code>POST /interactions/EVENT_ID/callback</code></p>
      </section>
    </div>
  );
}
