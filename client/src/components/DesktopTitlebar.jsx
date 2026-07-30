import { Copy, Maximize2, Minus, X } from 'lucide-react';
import { useDesktop } from '../context/DesktopContext.jsx';
import BrandLogo from './BrandLogo.jsx';

export default function DesktopTitlebar() {
  const desktop = useDesktop();
  if (!desktop?.isDesktop) return null;
  const progress = desktop.update.type === 'progress' ? desktop.update.percent : 0;
  return (
    <header className="desktop-titlebar">
      <div className="desktop-titlebar__brand">
        <BrandLogo decorative />
        <span>Guildora</span>
      </div>
      <div className="desktop-titlebar__drag">
        {desktop.notice && <span className="desktop-titlebar__notice">{desktop.notice}</span>}
      </div>
      <div className="desktop-titlebar__controls">
        <button type="button" aria-label="Minimieren" onClick={desktop.minimize}><Minus size={16} /></button>
        <button type="button" aria-label={desktop.maximized ? 'Wiederherstellen' : 'Maximieren'} onClick={desktop.maximize}>
          {desktop.maximized ? <Copy size={13} /> : <Maximize2 size={13} />}
        </button>
        <button className="desktop-titlebar__close" type="button" aria-label="Schließen" onClick={desktop.close}><X size={17} /></button>
      </div>
      {progress > 0 && <span className="desktop-titlebar__progress" style={{ width: `${progress}%` }} />}
    </header>
  );
}
