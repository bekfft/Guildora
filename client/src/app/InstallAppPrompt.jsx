import { Download, Share, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useDesktop } from '../context/DesktopContext.jsx';

const DISMISS_KEY = 'guildora:install-prompt-dismissed';

export default function InstallAppPrompt() {
  const desktop = useDesktop();
  const [installEvent, setInstallEvent] = useState(null);
  const [visible, setVisible] = useState(false);
  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent);

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    const mobile = window.matchMedia('(max-width: 700px), (pointer: coarse)').matches;
    if (desktop?.isDesktop || standalone || !mobile || localStorage.getItem(DISMISS_KEY)) return undefined;

    const reveal = window.setTimeout(() => setVisible(true), 2800);
    const capture = (event) => {
      event.preventDefault();
      setInstallEvent(event);
      setVisible(true);
    };
    window.addEventListener('beforeinstallprompt', capture);
    return () => {
      window.clearTimeout(reveal);
      window.removeEventListener('beforeinstallprompt', capture);
    };
  }, [desktop?.isDesktop]);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, '1');
    setVisible(false);
  }

  async function install() {
    if (!installEvent) return;
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === 'accepted') dismiss();
    setInstallEvent(null);
  }

  if (!visible || (!isIos && !installEvent)) return null;

  return (
    <aside className="install-app-prompt" aria-label="Guildora installieren">
      <span className="install-app-prompt__icon">{isIos ? <Share size={20} /> : <Download size={20} />}</span>
      <span>
        <strong>Guildora als App nutzen</strong>
        <small>{isIos ? 'Tippe auf Teilen und dann auf „Zum Home-Bildschirm“.' : 'Installiere Guildora für einen schnellen Vollbild-Start.'}</small>
      </span>
      {installEvent && <button className="install-app-prompt__action" type="button" onClick={install}>Installieren</button>}
      <button className="install-app-prompt__close" type="button" onClick={dismiss} aria-label="Installationshinweis schließen"><X size={18} /></button>
    </aside>
  );
}
