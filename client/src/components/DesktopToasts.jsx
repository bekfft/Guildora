import { useDesktop } from '../context/DesktopContext.jsx';

export default function DesktopToasts() {
  const desktop = useDesktop();
  if (!desktop?.isDesktop) return null;
  return (
    <div className="desktop-toasts">
      {desktop.trayHint && (
        <div className="desktop-toast">
          <strong>Guildora läuft weiter</strong>
          <span>Du findest die App im Infobereich der Taskleiste.</span>
          <button type="button" onClick={desktop.dismissTrayHint}>Verstanden</button>
        </div>
      )}
      {desktop.update.type === 'downloaded' && (
        <div className="desktop-toast">
          <strong>Version {desktop.update.version} ist bereit</strong>
          <span>Jetzt still aktualisieren oder beim nächsten vollständigen Beenden automatisch installieren.</span>
          <div>
            <button type="button" onClick={desktop.installUpdate}>Jetzt neu starten</button>
            <button type="button" onClick={desktop.dismissUpdate}>Später</button>
          </div>
        </div>
      )}
    </div>
  );
}
