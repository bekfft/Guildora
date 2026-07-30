import { Folder, Save, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';

export default function CategorySettingsModal({
  guildData,
  category,
  onClose,
  onRefresh,
  onToast
}) {
  const [name, setName] = useState(category.name);
  const [busy, setBusy] = useState(false);
  const [closing, setClosing] = useState(false);
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

  async function saveCategory(event) {
    event.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await api.updateCategory(guildData.guild.id, category.id, {
        name: name.trim(),
        position: category.position
      });
      await onRefresh();
      onToast('Kategorie aktualisiert.', 'success');
      setName(name.trim().toUpperCase());
    } catch (error) {
      onToast(error.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function deleteCategory() {
    if (busy || !window.confirm(`Kategorie „${category.name}“ löschen? Die enthaltenen Channels bleiben erhalten.`)) return;
    setBusy(true);
    try {
      await api.deleteCategory(guildData.guild.id, category.id);
      await onRefresh();
      onToast('Kategorie gelöscht. Die Channels wurden nicht gelöscht.', 'success');
      setClosing(true);
      window.setTimeout(onClose, 180);
    } catch (error) {
      onToast(error.message, 'error');
      setBusy(false);
    }
  }

  return (
    <div className={`server-settings-overlay category-settings-overlay ${closing ? 'is-closing' : ''}`}>
      <section
        className="server-settings channel-settings category-settings"
        role="dialog"
        aria-modal="true"
        aria-label={`Kategorieeinstellungen für ${category.name}`}
        ref={dialogRef}
        tabIndex={-1}
      >
        <aside className="server-settings__sidebar channel-settings__sidebar">
          <div className="channel-settings__channel-name">
            <Folder size={16} />
            <span>{category.name}</span>
            <small>Kategorie</small>
          </div>
          <nav aria-label="Kategorieeinstellungen">
            <button className="is-active" type="button">
              <Folder size={17} /> Übersicht
            </button>
          </nav>
          <button className="channel-settings__delete" type="button" disabled={busy} onClick={deleteCategory}>
            <Trash2 size={17} /> Kategorie löschen
          </button>
        </aside>

        <main className="server-settings__content">
          <button className="server-settings__close" type="button" onClick={requestClose} aria-label="Kategorieeinstellungen schließen">
            <X size={22} /><span>ESC</span>
          </button>
          <form className="settings-page channel-settings__page" onSubmit={saveCategory}>
            <header>
              <h2>Übersicht</h2>
              <p>Bearbeite den Namen dieser Kategorie.</p>
            </header>
            <label className="settings-field">
              <span>Kategoriename</span>
              <input value={name} maxLength={60} onChange={(event) => setName(event.target.value)} />
            </label>
            <div className="settings-info-note category-settings__note">
              <Folder size={18} />
              <span><strong>Channels bleiben geschützt</strong><small>Beim Löschen einer Kategorie bleiben ihre Channels bestehen und werden unter „Ohne Kategorie“ einsortiert.</small></span>
            </div>
            <button className="settings-primary" type="submit" disabled={busy || !name.trim()}>
              <Save size={17} /> Änderungen speichern
            </button>
          </form>
        </main>
      </section>
    </div>
  );
}
