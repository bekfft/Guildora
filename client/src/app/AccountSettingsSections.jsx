import { useEffect, useState } from 'react';
import Button from '../components/Button.jsx';
import { api } from '../lib/api.js';
import { useGuildoraDialog } from '../context/GuildoraDialogContext.jsx';

export function Switch({ label, description, checked, onChange }) {
  return (
    <label className="user-setting-switch">
      <span><strong>{label}</strong>{description && <small>{description}</small>}</span>
      <input type="checkbox" checked={Boolean(checked)} onChange={(event) => onChange(event.target.checked)} />
      <i aria-hidden="true" />
    </label>
  );
}

function Field({ label, hint, children }) {
  return <label className="user-setting-field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

function SaveBar({ saving, onSave }) {
  return <div className="user-settings-save"><Button type="button" loading={saving} onClick={onSave}>Änderungen speichern</Button></div>;
}

export function AccountSection({ user, refreshUser, logout, onClose, onToast }) {
  const dialog = useGuildoraDialog();
  const [identity, setIdentity] = useState({ username: user.username, email: user.email, currentPassword: '' });
  const [password, setPassword] = useState({ currentPassword: '', newPassword: '', repeat: '' });
  const [sessions, setSessions] = useState([]);
  const [twoFactor, setTwoFactor] = useState({ enabled: false, secret: '', code: '', password: '' });
  const [busy, setBusy] = useState('');

  async function reloadSecurity() {
    const [sessionResult, status] = await Promise.all([api.sessions(), api.twoFactorStatus()]);
    setSessions(sessionResult.sessions);
    setTwoFactor((current) => ({ ...current, enabled: status.enabled }));
  }

  useEffect(() => { reloadSecurity().catch((error) => onToast(error.message, 'error')); }, []);

  async function saveIdentity() {
    setBusy('identity');
    try {
      await api.updateAccount(identity);
      await refreshUser();
      setIdentity((current) => ({ ...current, currentPassword: '' }));
      onToast('Accountdaten gespeichert.', 'success');
    } catch (error) { onToast(error.message, 'error'); } finally { setBusy(''); }
  }

  async function savePassword() {
    if (password.newPassword !== password.repeat) return onToast('Die neuen Passwörter stimmen nicht überein.', 'error');
    setBusy('password');
    try {
      await api.updatePassword({ currentPassword: password.currentPassword, newPassword: password.newPassword });
      setPassword({ currentPassword: '', newPassword: '', repeat: '' });
      await reloadSecurity();
      onToast('Passwort geändert. Andere Sitzungen wurden beendet.', 'success');
    } catch (error) { onToast(error.message, 'error'); } finally { setBusy(''); }
  }

  async function startTwoFactor() {
    setBusy('2fa');
    try {
      const result = await api.setupTwoFactor(twoFactor.password);
      setTwoFactor((current) => ({ ...current, secret: result.secret, code: '', password: '' }));
    } catch (error) { onToast(error.message, 'error'); } finally { setBusy(''); }
  }

  async function confirmTwoFactor() {
    setBusy('2fa');
    try {
      await api.confirmTwoFactor(twoFactor.code);
      setTwoFactor((current) => ({ ...current, enabled: true, secret: '', code: '' }));
      onToast('Zwei-Faktor-Authentifizierung aktiviert.', 'success');
    } catch (error) { onToast(error.message, 'error'); } finally { setBusy(''); }
  }

  async function disableTwoFactor() {
    setBusy('2fa');
    try {
      await api.disableTwoFactor(twoFactor.password, twoFactor.code);
      setTwoFactor({ enabled: false, secret: '', code: '', password: '' });
      onToast('Zwei-Faktor-Authentifizierung deaktiviert.', 'success');
    } catch (error) { onToast(error.message, 'error'); } finally { setBusy(''); }
  }

  async function revoke(id) {
    await api.revokeSession(id);
    await reloadSecurity();
    onToast('Sitzung beendet.', 'success');
  }

  async function deactivate() {
    const currentPassword = await dialog.prompt({
      title: 'Account deaktivieren?',
      message: 'Du wirst auf allen Geräten abgemeldet. Der Account kann später wieder aktiviert werden.',
      label: 'Aktuelles Passwort',
      inputType: 'password',
      required: true,
      tone: 'danger',
      confirmLabel: 'Account deaktivieren'
    });
    if (!currentPassword) return;
    await api.deactivateAccount(currentPassword);
    await logout(); onClose();
  }

  async function removeAccount() {
    const confirmation = await dialog.prompt({
      title: 'Account endgültig löschen?',
      message: 'Diese Aktion kann nicht rückgängig gemacht werden. Gib zur Bestätigung LÖSCHEN ein.',
      label: 'Bestätigung',
      placeholder: 'LÖSCHEN',
      required: true,
      tone: 'danger',
      confirmLabel: 'Weiter',
      validate: (value) => value === 'LÖSCHEN' ? '' : 'Bitte gib exakt LÖSCHEN ein.'
    });
    if (confirmation !== 'LÖSCHEN') return;
    const currentPassword = await dialog.prompt({
      title: 'Löschung bestätigen',
      message: 'Bestätige die endgültige Löschung mit deinem aktuellen Passwort.',
      label: 'Aktuelles Passwort',
      inputType: 'password',
      required: true,
      tone: 'danger',
      confirmLabel: 'Account endgültig löschen'
    });
    if (!currentPassword) return;
    await api.deleteAccount(currentPassword, confirmation);
    await logout(); onClose();
  }

  return (
    <div className="user-settings-stack">
      <section className="user-settings-card">
        <h4>Account-Info</h4>
        <div className="user-settings-grid">
          <Field label="Benutzername"><input value={identity.username} onChange={(e) => setIdentity({ ...identity, username: e.target.value })} /></Field>
          <Field label="E-Mail-Adresse"><input type="email" value={identity.email} onChange={(e) => setIdentity({ ...identity, email: e.target.value })} /></Field>
          <Field label="Aktuelles Passwort" hint="Wird zur Bestätigung benötigt."><input type="password" value={identity.currentPassword} onChange={(e) => setIdentity({ ...identity, currentPassword: e.target.value })} /></Field>
        </div>
        <SaveBar saving={busy === 'identity'} onSave={saveIdentity} />
      </section>
      <section className="user-settings-card">
        <h4>Passwort & Sicherheit</h4>
        <div className="user-settings-grid">
          <Field label="Aktuelles Passwort"><input type="password" value={password.currentPassword} onChange={(e) => setPassword({ ...password, currentPassword: e.target.value })} /></Field>
          <Field label="Neues Passwort"><input type="password" value={password.newPassword} onChange={(e) => setPassword({ ...password, newPassword: e.target.value })} /></Field>
          <Field label="Neues Passwort wiederholen"><input type="password" value={password.repeat} onChange={(e) => setPassword({ ...password, repeat: e.target.value })} /></Field>
        </div>
        <SaveBar saving={busy === 'password'} onSave={savePassword} />
      </section>
      <section className="user-settings-card">
        <h4>Zwei-Faktor-Authentifizierung</h4>
        <p>{twoFactor.enabled ? 'Dein Account wird mit einem Authenticator-Code geschützt.' : 'Schütze deinen Account zusätzlich mit einer Authenticator-App.'}</p>
        <div className="user-settings-inline">
          <input type="password" placeholder="Aktuelles Passwort" value={twoFactor.password} onChange={(e) => setTwoFactor({ ...twoFactor, password: e.target.value })} />
          {(twoFactor.secret || twoFactor.enabled) && <input inputMode="numeric" placeholder="6-stelliger Code" value={twoFactor.code} onChange={(e) => setTwoFactor({ ...twoFactor, code: e.target.value.replace(/\D/g, '').slice(0, 6) })} />}
          {!twoFactor.enabled && !twoFactor.secret && <Button loading={busy === '2fa'} onClick={startTwoFactor}>Einrichten</Button>}
          {!twoFactor.enabled && twoFactor.secret && <Button loading={busy === '2fa'} onClick={confirmTwoFactor}>Aktivieren</Button>}
          {twoFactor.enabled && <Button variant="secondary" loading={busy === '2fa'} onClick={disableTwoFactor}>Deaktivieren</Button>}
        </div>
        {twoFactor.secret && <div className="totp-secret"><strong>Secret für deine Authenticator-App</strong><code>{twoFactor.secret}</code><small>Speichere es in der App und bestätige anschließend den erzeugten Code.</small></div>}
      </section>
      <section className="user-settings-card">
        <div className="user-settings-card__heading"><div><h4>Geräte & Sitzungen</h4><p>Alle aktuell gültigen Anmeldungen.</p></div><Button variant="secondary" onClick={async () => { await api.revokeOtherSessions(); await reloadSecurity(); onToast('Andere Sitzungen beendet.', 'success'); }}>Andere beenden</Button></div>
        <div className="session-list">{sessions.map((session) => <div key={session.id}><span><strong>{session.device}</strong><small>Angemeldet {new Date(session.created_at).toLocaleString('de-DE')} · gültig bis {new Date(session.expires_at).toLocaleDateString('de-DE')}</small></span>{!session.current && <button type="button" onClick={() => revoke(session.id)}>Abmelden</button>}</div>)}</div>
      </section>
      <section className="user-settings-card user-settings-card--danger">
        <h4>Accountstatus</h4><p>Eine Deaktivierung meldet dich überall ab. Das Löschen entfernt deinen Account endgültig.</p>
        <div className="user-settings-inline"><Button variant="secondary" onClick={() => deactivate().catch((e) => onToast(e.message, 'error'))}>Account deaktivieren</Button><button className="danger-button" type="button" onClick={() => removeAccount().catch((e) => onToast(e.message, 'error'))}>Account löschen</button></div>
      </section>
    </div>
  );
}

export function PrivacySection({ settings, save, onToast }) {
  const [form, setForm] = useState(settings);
  const [safety, setSafety] = useState({ blocked: [], reports: [] });
  useEffect(() => { api.accountSafety().then(setSafety).catch((e) => onToast(e.message, 'error')); }, []);
  const patch = (key, value) => setForm({ ...form, [key]: value });
  return <div className="user-settings-stack">
    <section className="user-settings-card"><h4>Datenschutz & Sicherheit</h4><div className="user-settings-grid">
      <Field label="Freundschaftsanfragen"><select value={form.friend_requests} onChange={(e) => patch('friend_requests', e.target.value)}><option value="everyone">Alle</option><option value="shared_servers">Mitglieder gemeinsamer Server</option><option value="none">Niemand</option></select></Field>
      <Field label="Direktnachrichten"><select value={form.direct_messages} onChange={(e) => patch('direct_messages', e.target.value)}><option value="everyone">Alle</option><option value="shared_servers">Gemeinsame Server</option><option value="friends">Nur Freunde</option><option value="none">Niemand</option></select></Field>
      <Field label="Inhaltsfilter"><select value={form.content_filter} onChange={(e) => patch('content_filter', e.target.value)}><option value="all">Alle Nachrichten prüfen</option><option value="non_friends">Nur Nicht-Freunde prüfen</option><option value="off">Aus</option></select></Field>
    </div><SaveBar onSave={() => save(form)} /></section>
    <section className="user-settings-card"><h4>Blockierte Nutzer</h4><div className="simple-list">{safety.blocked.length ? safety.blocked.map((u) => <div key={u.id}><span><strong>{u.display_name}</strong><small>@{u.username}</small></span><button onClick={async () => { await api.unblockUser(u.id); setSafety({ ...safety, blocked: safety.blocked.filter((x) => x.id !== u.id) }); }}>Entblocken</button></div>) : <p>Du hast niemanden blockiert.</p>}</div></section>
    <section className="user-settings-card"><h4>Meldeverlauf</h4><div className="simple-list">{safety.reports.length ? safety.reports.map((r) => <div key={`${r.source}-${r.id}`}><span><strong>{r.reason}</strong><small>{new Date(r.created_at).toLocaleString('de-DE')}</small></span><em>{r.status}</em></div>) : <p>Noch keine Meldungen.</p>}</div></section>
  </div>;
}

export function VoiceSettingsSection({ settings, save, onToast }) {
  const [form, setForm] = useState(settings);
  const [devices, setDevices] = useState([]);
  const [testing, setTesting] = useState(false);
  useEffect(() => { navigator.mediaDevices?.enumerateDevices().then(setDevices).catch(() => {}); }, []);
  const patch = (key, value) => setForm({ ...form, [key]: value });
  async function micTest() {
    setTesting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      onToast('Mikrofon funktioniert. Sprich jetzt – der Test endet nach drei Sekunden.', 'success');
      window.setTimeout(() => { stream.getTracks().forEach((track) => track.stop()); setTesting(false); }, 3000);
    } catch (error) { setTesting(false); onToast(error.message, 'error'); }
  }
  return <div className="user-settings-stack"><section className="user-settings-card"><h4>Voice & Video</h4><div className="user-settings-grid">
    <Field label="Eingabegerät"><select value={form.voice_input_device || ''} onChange={(e) => patch('voice_input_device', e.target.value || null)}><option value="">Systemstandard</option>{devices.filter((d) => d.kind === 'audioinput').map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Mikrofon ${i + 1}`}</option>)}</select></Field>
    <Field label="Ausgabegerät"><select value={form.voice_output_device || ''} onChange={(e) => patch('voice_output_device', e.target.value || null)}><option value="">Systemstandard</option>{devices.filter((d) => d.kind === 'audiooutput').map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Lautsprecher ${i + 1}`}</option>)}</select></Field>
    <Field label="Kamera"><select value={form.voice_camera_device || ''} onChange={(e) => patch('voice_camera_device', e.target.value || null)}><option value="">Systemstandard</option>{devices.filter((d) => d.kind === 'videoinput').map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Kamera ${i + 1}`}</option>)}</select></Field>
    <Field label="Eingabemodus"><select value={form.voice_input_mode} onChange={(e) => patch('voice_input_mode', e.target.value)}><option value="voice_activity">Sprachaktivität</option><option value="push_to_talk">Push-to-Talk</option></select></Field>
    <Field label={`Empfindlichkeit: ${form.voice_sensitivity}`}><input type="range" min="0" max="100" value={form.voice_sensitivity} onChange={(e) => patch('voice_sensitivity', Number(e.target.value))} /></Field>
    {form.voice_input_mode === 'push_to_talk' && <Field label="Push-to-Talk-Taste"><input value={form.push_to_talk_key} onChange={(e) => patch('push_to_talk_key', e.target.value)} /></Field>}
  </div>
  <Switch label="Rauschunterdrückung" checked={form.voice_noise_suppression} onChange={(v) => patch('voice_noise_suppression', v)} />
  <Switch label="Echounterdrückung" checked={form.voice_echo_cancellation} onChange={(v) => patch('voice_echo_cancellation', v)} />
  <Switch label="Automatische Verstärkung" checked={form.voice_auto_gain} onChange={(v) => patch('voice_auto_gain', v)} />
  <div className="user-settings-inline"><Button variant="secondary" loading={testing} onClick={micTest}>Mikrofon testen</Button><Button onClick={() => save(form)}>Speichern</Button></div>
  </section></div>;
}

export function PreferencesSection({ kind, settings, save }) {
  const [form, setForm] = useState(settings);
  const patch = (key, value) => setForm({ ...form, [key]: value });
  const views = {
    notifications: <><h4>Benachrichtigungen</h4><Switch label="Desktop-Benachrichtigungen" checked={form.desktop_notifications} onChange={(v) => patch('desktop_notifications', v)} /><Switch label="Töne" checked={form.notification_sounds} onChange={(v) => patch('notification_sounds', v)} /><Switch label="Erwähnungen" checked={form.notify_mentions} onChange={(v) => patch('notify_mentions', v)} /><Switch label="Direktnachrichten" checked={form.notify_direct_messages} onChange={(v) => patch('notify_direct_messages', v)} /><Switch label="Freundschaftsanfragen" checked={form.notify_friend_requests} onChange={(v) => patch('notify_friend_requests', v)} /><div className="user-settings-grid"><Field label="Ruhezeit von"><input type="time" value={form.quiet_hours_start || ''} onChange={(e) => patch('quiet_hours_start', e.target.value || null)} /></Field><Field label="Ruhezeit bis"><input type="time" value={form.quiet_hours_end || ''} onChange={(e) => patch('quiet_hours_end', e.target.value || null)} /></Field></div></>,
    appearance: <><h4>Erscheinungsbild</h4><div className="theme-options">{['dark', 'light', 'system'].map((value) => <button className={form.theme === value ? 'is-active' : ''} type="button" onClick={() => patch('theme', value)} key={value}><i className={`theme-swatch theme-swatch--${value}`} /><span>{value === 'dark' ? 'Dunkel' : value === 'light' ? 'Hell' : 'System'}</span></button>)}</div><div className="user-settings-grid"><Field label="Akzentfarbe"><input type="color" value={form.accent_color} onChange={(e) => patch('accent_color', e.target.value)} /></Field><Field label="Nachrichtendichte"><select value={form.message_density} onChange={(e) => patch('message_density', e.target.value)}><option value="cozy">Gemütlich</option><option value="compact">Kompakt</option></select></Field><Field label={`Schriftgröße: ${form.font_scale}%`}><input type="range" min="80" max="140" value={form.font_scale} onChange={(e) => patch('font_scale', Number(e.target.value))} /></Field><Field label={`Zoom: ${form.app_zoom}%`}><input type="range" min="80" max="150" value={form.app_zoom} onChange={(e) => patch('app_zoom', Number(e.target.value))} /></Field></div></>,
    accessibility: <><h4>Barrierefreiheit</h4><Switch label="Bewegungen reduzieren" description="Deaktiviert Animationen und Übergänge." checked={form.reduce_motion} onChange={(v) => patch('reduce_motion', v)} /><Switch label="Hoher Kontrast" checked={form.high_contrast} onChange={(v) => patch('high_contrast', v)} /><Switch label="Screenreader-Optimierung" checked={form.screen_reader} onChange={(v) => patch('screen_reader', v)} /><Switch label="Untertitel vorbereiten" description="Zeigt Untertitel in unterstützten Voice-Funktionen." checked={form.captions} onChange={(v) => patch('captions', v)} /><Field label="Farbsehschwäche"><select value={form.color_vision} onChange={(e) => patch('color_vision', e.target.value)}><option value="none">Keine Anpassung</option><option value="deuteranopia">Deuteranopie</option><option value="protanopia">Protanopie</option><option value="tritanopia">Tritanopie</option></select></Field></>,
    locale: <><h4>Sprache & Region</h4><div className="user-settings-grid"><Field label="Sprache"><select value={form.language} onChange={(e) => patch('language', e.target.value)}><option value="de">Deutsch</option><option value="en">English (regionale Formate)</option></select></Field><Field label="Datumsformat"><select value={form.date_format} onChange={(e) => patch('date_format', e.target.value)}><option value="de-DE">31.12.2026</option><option value="en-GB">31/12/2026</option><option value="en-US">12/31/2026</option></select></Field><Field label="Zeitformat"><select value={form.time_format} onChange={(e) => patch('time_format', e.target.value)}><option value="24h">24 Stunden</option><option value="12h">12 Stunden</option></select></Field><Field label="Zeitzone"><input value={form.timezone} onChange={(e) => patch('timezone', e.target.value)} /></Field></div><Switch label="Rechtschreibprüfung" checked={form.spellcheck} onChange={(v) => patch('spellcheck', v)} /></>
  };
  return <section className="user-settings-card">{views[kind]}<SaveBar onSave={() => save(form)} /></section>;
}

export function ConnectionsSection({ onToast }) {
  const [connections, setConnections] = useState([]);
  useEffect(() => { api.connections().then((r) => setConnections(r.connections)).catch((e) => onToast(e.message, 'error')); }, []);
  return <div className="user-settings-stack"><section className="user-settings-card"><h4>Verbundene Konten</h4><p>Hier erscheinen externe Konten, sobald Guildora eine Verbindung unterstützt.</p><div className="simple-list">{connections.length ? connections.map((c) => <div key={c.id}><span><strong>{c.provider}</strong><small>{c.display_name}</small></span><button onClick={async () => { await api.deleteConnection(c.id); setConnections(connections.filter((x) => x.id !== c.id)); }}>Trennen</button></div>) : <p>Noch keine Konten verbunden.</p>}</div></section><section className="user-settings-card"><h4>Autorisierte Apps & Integrationen</h4><p>Guildora zeigt hier zukünftig autorisierte Bots und OAuth-Anwendungen. Aktuell hat keine externe App Zugriff auf deinen Account.</p></section></div>;
}
