import { Hash, Lock, Save, Trash2, Volume2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { ChannelPermissionEditor } from './ServerSettingsModal.jsx';

export default function ChannelSettingsModal({
  guildData,
  channel,
  onClose,
  onRefresh,
  onToast,
  onDeleted
}) {
  const [tab, setTab] = useState('overview');
  const [closing, setClosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: channel.name,
    type: channel.type,
    categoryId: channel.category_id,
    topic: channel.topic || '',
    position: channel.position
  });
  const dialogRef = useRef(null);

  useEffect(() => {
    const previousFocus = document.activeElement;
    dialogRef.current?.focus();
    const handleKey = (event) => event.key === 'Escape' && requestClose();
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
      previousFocus?.focus();
    };
  }, []);

  function requestClose() {
    if (closing || busy) return;
    setClosing(true);
    const delay = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 180;
    window.setTimeout(onClose, delay);
  }

  async function saveChannel(event) {
    event.preventDefault();
    if (!form.name.trim() || busy) return;
    setBusy(true);
    try {
      await api.updateChannel(guildData.guild.id, channel.id, {
        ...form,
        name: form.name.trim(),
        categoryId: form.categoryId || null,
        topic: form.topic.trim() || null
      });
      await onRefresh();
      onToast('Channel aktualisiert.', 'success');
    } catch (error) {
      onToast(error.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function deleteChannel() {
    if (busy || !window.confirm(`Channel „${channel.name}“ dauerhaft löschen?`)) return;
    setBusy(true);
    try {
      await api.deleteChannel(guildData.guild.id, channel.id);
      await onRefresh();
      onToast('Channel gelöscht.', 'success');
      onDeleted?.(channel);
      setClosing(true);
      window.setTimeout(onClose, 180);
    } catch (error) {
      onToast(error.message, 'error');
      setBusy(false);
    }
  }

  const ChannelIcon = channel.type === 'text' ? Hash : Volume2;

  return (
    <div className={`server-settings-overlay channel-settings-overlay ${closing ? 'is-closing' : ''}`}>
      <section
        className="server-settings channel-settings"
        role="dialog"
        aria-modal="true"
        aria-label={`Kanaleinstellungen für ${channel.name}`}
        ref={dialogRef}
        tabIndex={-1}
      >
        <aside className="server-settings__sidebar channel-settings__sidebar">
          <div className="channel-settings__channel-name">
            <ChannelIcon size={15} />
            <span>{channel.name}</span>
            <small>{guildData.categories.find((item) => item.id === channel.category_id)?.name || 'Ohne Kategorie'}</small>
          </div>
          <nav aria-label="Kanaleinstellungen">
            <button className={tab === 'overview' ? 'is-active' : ''} type="button" onClick={() => setTab('overview')}>
              <Hash size={17} /> Übersicht
            </button>
            <button className={tab === 'permissions' ? 'is-active' : ''} type="button" onClick={() => setTab('permissions')}>
              <Lock size={17} /> Berechtigungen
            </button>
          </nav>
          <button className="channel-settings__delete" type="button" disabled={busy} onClick={deleteChannel}>
            <Trash2 size={17} /> Kanal löschen
          </button>
        </aside>

        <main className="server-settings__content">
          <button className="server-settings__close" type="button" onClick={requestClose} aria-label="Kanaleinstellungen schließen">
            <X size={22} /><span>ESC</span>
          </button>

          {tab === 'overview' ? (
            <form className="settings-page channel-settings__page" onSubmit={saveChannel}>
              <header>
                <h2>Übersicht</h2>
                <p>Bearbeite Name, Typ, Kategorie und Thema dieses Channels.</p>
              </header>
              <label className="settings-field">
                <span>Channelname</span>
                <input value={form.name} maxLength={80} onChange={(event) => setForm({ ...form, name: event.target.value })} />
              </label>
              <label className="settings-field">
                <span>Channeltyp</span>
                <select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>
                  <option value="text">Text</option>
                  <option value="voice">Sprache</option>
                </select>
              </label>
              <label className="settings-field">
                <span>Kategorie</span>
                <select value={form.categoryId || ''} onChange={(event) => setForm({ ...form, categoryId: event.target.value || null })}>
                  <option value="">Keine Kategorie</option>
                  {guildData.categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}
                </select>
              </label>
              <label className="settings-field">
                <span>Channelthema</span>
                <textarea
                  value={form.topic}
                  maxLength={1024}
                  rows={5}
                  placeholder="Erkläre allen, wie dieser Channel genutzt wird."
                  onChange={(event) => setForm({ ...form, topic: event.target.value })}
                />
                <small>{form.topic.length}/1024</small>
              </label>
              <button className="settings-primary" type="submit" disabled={busy || !form.name.trim()}>
                <Save size={17} /> Änderungen speichern
              </button>
            </form>
          ) : (
            <div className="settings-page settings-page--wide channel-settings__page">
              <header>
                <h2>Berechtigungen</h2>
                <p>Lege wie bei Discord fest, welche Rollen diesen Channel verwenden dürfen.</p>
              </header>
              <ChannelPermissionEditor
                guildId={guildData.guild.id}
                channel={channel}
                roles={guildData.roles}
                onToast={onToast}
              />
            </div>
          )}
        </main>
      </section>
    </div>
  );
}
