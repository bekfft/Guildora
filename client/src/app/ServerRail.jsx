import { Compass, Plus } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import BrandLogo from '../components/BrandLogo.jsx';

const COLORS = ['#5865f2', '#d05b9c', '#3ba55d', '#e67e22', '#3d8bfd', '#9b59b6'];

function colorForName(name) {
  const total = [...name].reduce((sum, character) => sum + character.charCodeAt(0), 0);
  return COLORS[total % COLORS.length];
}

function initials(name) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

export default function ServerRail({ guilds, activeGuildId, discoveryActive, onOpenGuildModal, onNavigate }) {
  const navigate = useNavigate();

  function guildPath(guildId) {
    const saved = localStorage.getItem(`guildora:last-channel:${guildId}`);
    return saved ? `/app/channels/${guildId}/${saved}` : `/app/channels/${guildId}`;
  }

  return (
    <nav className="server-rail" aria-label="Server">
      <Link
        className={`server-button server-button--home ${!activeGuildId && !discoveryActive ? 'is-active' : ''}`}
        to="/app/channels/@me"
        data-tooltip="Start"
        onClick={onNavigate}
        aria-label="Guildora Start"
      >
        <span className="server-button__pill" />
        <BrandLogo decorative />
      </Link>
      <span className="server-rail__divider" />
      <div className="server-rail__guilds">
        {guilds.map((guild) => (
          <button
            className={`server-button ${activeGuildId === guild.id ? 'is-active' : ''}`}
            type="button"
            key={guild.id}
            data-tooltip={guild.name}
            aria-label={guild.name}
            onClick={() => {
              navigate(guildPath(guild.id));
              onNavigate?.();
            }}
          >
            <span className="server-button__pill" />
            {guild.icon_url
              ? <img src={guild.icon_url} alt="" />
              : <span className="server-button__initials" style={{ background: colorForName(guild.name) }}>{initials(guild.name)}</span>}
            {guild.unread_count > 0 && (
              <span className="server-unread-count">{guild.unread_count > 99 ? '99+' : guild.unread_count}</span>
            )}
          </button>
        ))}
      </div>
      <button className="server-button server-button--utility" type="button" data-tooltip="Server hinzufügen" aria-label="Server hinzufügen" onClick={onOpenGuildModal}>
        <Plus size={24} />
      </button>
      <Link
        className={`server-button server-button--utility ${discoveryActive ? 'is-active' : ''}`}
        to="/app/discovery"
        data-tooltip="Server entdecken"
        aria-label="Server entdecken"
        onClick={onNavigate}
      >
        <span className="server-button__pill" />
        <Compass size={23} />
      </Link>
    </nav>
  );
}
