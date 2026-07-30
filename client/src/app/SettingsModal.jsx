import { LogOut } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../components/Button.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useDesktop } from '../context/DesktopContext.jsx';
import Modal from './Modal.jsx';

const TABS = ['Mein Konto', 'Profil', 'Erscheinungsbild'];

export default function SettingsModal({ onClose }) {
  const [tab, setTab] = useState('Mein Konto');
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const desktop = useDesktop();
  const tabs = desktop?.isDesktop ? [...TABS, 'Über'] : TABS;

  function updateStatus() {
    const state = desktop.update;
    if (state.type === 'checking') return 'Suche nach Updates …';
    if (state.type === 'available') return `Version ${state.version} wird geladen …`;
    if (state.type === 'progress') return `Update wird geladen … ${state.percent} %`;
    if (state.type === 'downloaded') return `Version ${state.version} ist bereit.`;
    if (state.type === 'error') return state.message;
    return 'Du bist auf dem neuesten Stand.';
  }

  async function handleLogout() {
    await logout();
    onClose();
    navigate('/login', { replace: true });
  }

  return (
    <Modal title="Einstellungen" onClose={onClose}>
      <div className="settings-layout">
        <nav aria-label="Einstellungsbereiche">{tabs.map((item) => <button className={tab === item ? 'is-active' : ''} type="button" onClick={() => setTab(item)} key={item}>{item}</button>)}</nav>
        <div className="settings-content">
          <h3>{tab}</h3>
          {tab === 'Mein Konto' && <div className="account-card"><div>{user.username[0].toUpperCase()}</div><span><strong>{user.display_name || user.username}</strong><small>@{user.username}</small><small>{user.email}</small></span></div>}
          {tab === 'Profil' && <p>Serverbezogene Profile und Spitznamen folgen in einer späteren Phase.</p>}
          {tab === 'Erscheinungsbild' && <p>Guildora verwendet aktuell das optimierte dunkle Erscheinungsbild.</p>}
          {tab === 'Über' && desktop?.isDesktop && (
            <div className="desktop-about">
              <p><strong>Guildora Desktop</strong><span>Version {desktop.version}</span></p>
              <Button variant="primary" onClick={desktop.checkForUpdates}>Nach Updates suchen</Button>
              <small>{updateStatus()}</small>
              {desktop.update.type === 'progress' && <div className="desktop-about__progress"><span style={{ width: `${desktop.update.percent}%` }} /></div>}
              <label><input type="checkbox" checked={Boolean(desktop.settings?.autostart)} onChange={(event) => desktop.setSettings({ autostart: event.target.checked })} /> Guildora beim Anmelden starten</label>
              <label><input type="checkbox" checked={desktop.settings?.minimizeToTray !== false} onChange={(event) => desktop.setSettings({ minimizeToTray: event.target.checked })} /> Beim Schließen in den Infobereich minimieren</label>
            </div>
          )}
          {tab !== 'Über' && <Button variant="ghost" className="logout-action" onClick={handleLogout}><LogOut size={18} /> Abmelden</Button>}
        </div>
      </div>
    </Modal>
  );
}
