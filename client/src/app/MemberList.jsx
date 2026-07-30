import { Users, X } from 'lucide-react';
import { useMemo } from 'react';

function memberName(member) {
  return member.nickname || member.display_name || member.username;
}

export default function MemberList({ members, loading, onClose, onOpenProfile }) {
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
      <div className="member-list__header">
        <span><Users size={18} /><strong>Mitglieder</strong></span>
        <button className="icon-button" type="button" onClick={onClose} aria-label="Mitgliederliste schließen"><X size={20} /></button>
      </div>
      {loading ? (
        <div className="member-skeleton">{[1, 2, 3, 4].map((item) => <span key={item} />)}</div>
      ) : groups.length ? groups.map((group) => (
        <section className="member-group" key={group.role.name}>
          <h3 style={{ color: group.role.color || 'var(--channel-idle)' }}>{group.role.name.toUpperCase()} — {group.members.length}</h3>
          {group.members.map((member) => (
            <button className="member-row" type="button" key={member.id} onClick={() => onOpenProfile(member.user_id)}>
              <span className="member-avatar">
                {member.avatar_url ? <img src={member.avatar_url} alt="" /> : memberName(member)[0].toUpperCase()}
                <i className={`status-dot status-dot--${member.status}`} />
              </span>
              <span style={{ color: group.role.color || 'var(--channel-hover)' }}>{memberName(member)}</span>
            </button>
          ))}
        </section>
      )) : <p className="member-list__empty">Noch keine weiteren Mitglieder.</p>}
    </aside>
  );
}
