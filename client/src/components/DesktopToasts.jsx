import { useCallback, useEffect, useState } from 'react';
import { useDesktop } from '../context/DesktopContext.jsx';
import { api } from '../lib/api.js';
import { APP_VERSION, isNewerVersion } from '../lib/appVersion.js';

const BROWSER_UPDATE_INTERVAL_MS = 60 * 1000;

export default function DesktopToasts() {
  const desktop = useDesktop();
  const [browserUpdate, setBrowserUpdate] = useState(null);
  const [reloading, setReloading] = useState(false);

  const checkBrowserUpdate = useCallback(async () => {
    if (desktop?.isDesktop) return;
    try {
      const release = await api.latestRelease();
      setBrowserUpdate(isNewerVersion(release?.version, APP_VERSION) ? release : null);
    } catch {
      // Ein vorübergehender Release-Fehler darf die laufende App nicht stören.
    }
  }, [desktop?.isDesktop]);

  useEffect(() => {
    if (desktop?.isDesktop) return undefined;
    checkBrowserUpdate();
    const interval = window.setInterval(checkBrowserUpdate, BROWSER_UPDATE_INTERVAL_MS);
    const checkWhenVisible = () => {
      if (document.visibilityState === 'visible') checkBrowserUpdate();
    };
    window.addEventListener('online', checkBrowserUpdate);
    window.addEventListener('focus', checkBrowserUpdate);
    document.addEventListener('visibilitychange', checkWhenVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('online', checkBrowserUpdate);
      window.removeEventListener('focus', checkBrowserUpdate);
      document.removeEventListener('visibilitychange', checkWhenVisible);
    };
  }, [checkBrowserUpdate, desktop?.isDesktop]);

  async function reloadBrowserApp() {
    setReloading(true);
    try {
      await fetch(window.location.href, { cache: 'reload', credentials: 'include' });
    } finally {
      window.location.reload();
    }
  }

  const desktopDownloading = desktop?.isDesktop && ['available', 'progress'].includes(desktop.update.type);
  const desktopReady = desktop?.isDesktop && desktop.update.type === 'downloaded';
  const hasToast = desktop?.trayHint || desktopDownloading || desktopReady || browserUpdate;
  if (!hasToast) return null;

  return (
    <div className="desktop-toasts" aria-live="polite">
      {desktop?.trayHint && (
        <div className="desktop-toast">
          <strong>Guildora läuft weiter</strong>
          <span>Du findest die App im Infobereich der Taskleiste.</span>
          <button type="button" onClick={desktop.dismissTrayHint}>Verstanden</button>
        </div>
      )}
      {desktopDownloading && (
        <div className="desktop-toast app-update-toast" role="status" aria-label="Guildora-Update wird geladen">
          <strong>Neue Version {desktop.update.version || ''} verfügbar</strong>
          <span>
            {desktop.update.type === 'progress'
              ? `Das Update wird automatisch geladen – ${desktop.update.percent || 0} %.`
              : 'Das Update wird jetzt automatisch im Hintergrund geladen.'}
          </span>
          {desktop.update.type === 'progress' && (
            <div className="app-update-toast__progress" aria-hidden="true">
              <span style={{ width: `${desktop.update.percent || 0}%` }} />
            </div>
          )}
        </div>
      )}
      {desktopReady && (
        <div className="desktop-toast app-update-toast" role="status" aria-label="Guildora-Update ist bereit">
          <strong>Version {desktop.update.version} ist bereit</strong>
          <span>Guildora startet neu und öffnet anschließend automatisch die aktuelle Version.</span>
          <div>
            <button type="button" onClick={desktop.installUpdate}>Neu starten &amp; aktualisieren</button>
            <button type="button" onClick={desktop.dismissUpdate}>Später</button>
          </div>
        </div>
      )}
      {!desktop?.isDesktop && browserUpdate && (
        <div className="desktop-toast app-update-toast" role="status" aria-label="Guildora-Update verfügbar">
          <strong>Neue Guildora-Version verfügbar</strong>
          <span>Version {browserUpdate.version} ist bereit. Lade die App neu, um die aktuelle Version zu verwenden.</span>
          <div>
            <button type="button" disabled={reloading} onClick={reloadBrowserApp}>
              {reloading ? 'Wird neu geladen …' : 'Jetzt neu laden'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
