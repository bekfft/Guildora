import { ShieldCheck, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

function memberName(member) {
  return member.nickname || member.display_name || member.username;
}

export default function MemberList({ members, loading }) {
  const [selected, setSelected] = useState(null);
  const [closing, setClosing] = useState(false);

  function closeProfile() {
    if (!selected || closing) return;
    setClosing(true);
    const delay = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 160;
    window.setTimeout(() => {
      setSelected(null);
      setClosing(false);
    }, delay);
  }

  useEffect(() => {
    function close(event) {
      if (event.key === 'Escape') closeProfile();
    }
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [selected, closing]);

  const groups = useMemo(() => {
    const grouped = new Map();
    for (const member of members) {
      const highestRole = member.roles.find((item) => !item.is_default);
      const role = highestRole || {
        name: member.status === 'online' ? 'Online' : 'Offline',
        color: null,
        position: member.status === 'online' ? 0 : -1
      };
      const key = role.name;
      if (!grouped.has(key)) grouped.set(key, { role, members: [] });
      grouped.get(key).members.push(member);
    }
    return [...grouped.values()].sort((a, b) => (b.role.position || 0) - (a.role.position || 0));
  }, [members]);

  return (
    <aside className="member-list" aria-label="Mitglieder">
      {loading ? (
        <div className="member-skeleton">{[1, 2, 3, 4].map((item) => <span key={item} />)}</div>
      ) : groups.length ? groups.map((group) => (
        <section className="member-group" key={group.role.name}>
          <h3 style={{ color: group.role.color || 'var(--channel-idle)' }}>{group.role.name.toUpperCase()} — {group.members.length}</h3>
          {group.members.map((member) => (
            <button className="member-row" type="button" key={member.id} onClick={() => { setClosing(false); setSelected(member); }}>
              <span className="member-avatar">{memberName(member)[0].toUpperCase()}<i className={`status-dot status-dot--${member.status}`} /></span>
              <span style={{ color: group.role.color || 'var(--channel-hover)' }}>{memberName(member)}</span>
            </button>
          ))}
        </section>
      )) : <p className="member-list__empty">Noch keine weiteren Mitglieder.</p>}
      {selected && (
        <div className={`profile-popover ${closing ? 'is-closing' : ''}`} role="dialog" aria-label={`Profil von ${memberName(selected)}`}>
          <button className="icon-button profile-popover__close" type="button" onClick={closeProfile} aria-label="Profil schließen"><X size={17} /></button>
          <div className="profile-popover__banner" />
          <div className="profile-popover__avatar">{memberName(selected)[0].toUpperCase()}</div>
          <h3>{memberName(selected)}</h3>
          <p>@{selected.username}</p>
          <div className="profile-popover__section">
            <strong>Mitglied seit</strong>
            <span>{new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' }).format(new Date(selected.joined_at))}</span>
          </div>
          <div className="role-chips">
            {selected.roles.filter((role) => !role.is_default).map((role) => <span key={role.id}><i style={{ background: role.color || '#949ba4' }} />{role.name}</span>)}
            {!selected.roles.some((role) => !role.is_default) && <span><i style={{ background: '#949ba4' }} />@everyone</span>}
          </div>
          <div className="profile-popover__note"><ShieldCheck size={15} /> Guildora-Mitglied</div>
        </div>
      )}
    </aside>
  );
}
