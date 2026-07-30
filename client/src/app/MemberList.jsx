import {
  BadgeCheck,
  Bug,
  Check,
  Crown,
  Gem,
  Handshake,
  Heart,
  Plus,
  Search,
  ShieldCheck,
  Users,
  X
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';

function memberName(member) {
  return member.nickname || member.display_name || member.username;
}

const BADGE_ICONS = {
  'badge-check': BadgeCheck,
  bug: Bug,
  crown: Crown,
  gem: Gem,
  handshake: Handshake,
  heart: Heart
};

function BadgeIcon({ name }) {
  const Icon = BADGE_ICONS[name] || ShieldCheck;
  return <Icon aria-hidden="true" size={14} strokeWidth={2.2} />;
}

export default function MemberList({
  guildId,
  members,
  roles,
  canManageRoles,
  loading,
  onClose,
  onRolesChanged,
  onToast
}) {
  const [selectedId, setSelectedId] = useState(null);
  const [closing, setClosing] = useState(false);
  const [roleBusy, setRoleBusy] = useState(null);
  const [rolePickerOpen, setRolePickerOpen] = useState(false);
  const [roleQuery, setRoleQuery] = useState('');
  const [activeBadgeId, setActiveBadgeId] = useState(null);
  const selected = members.find((member) => member.id === selectedId) || null;
  const selectedBadges = selected?.badges?.slice(0, 6) || [];
  const activeBadge = selectedBadges.find((badge) => badge.id === activeBadgeId) || null;
  const customRoles = roles.filter((role) => !role.is_default);
  const filteredRoles = customRoles.filter((role) => role.name.toLowerCase().includes(roleQuery.trim().toLowerCase()));

  function closeProfile() {
    if (!selected || closing) return;
    setRolePickerOpen(false);
    setRoleQuery('');
    setActiveBadgeId(null);
    setClosing(true);
    const delay = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 160;
    window.setTimeout(() => {
      setSelectedId(null);
      setClosing(false);
    }, delay);
  }

  useEffect(() => {
    function close(event) {
      if (event.key !== 'Escape') return;
      if (rolePickerOpen) {
        setRolePickerOpen(false);
        setRoleQuery('');
      } else {
        closeProfile();
      }
    }
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [selected, closing, rolePickerOpen]);

  useEffect(() => {
    setRolePickerOpen(false);
    setRoleQuery('');
    setActiveBadgeId(null);
  }, [selectedId]);

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

  async function toggleRole(roleId, checked) {
    if (!selected || roleBusy || !canManageRoles) return;
    const current = selected.roles.filter((role) => !role.is_default).map((role) => role.id);
    const next = checked ? [...new Set([...current, roleId])] : current.filter((id) => id !== roleId);
    setRoleBusy(roleId);
    try {
      await api.updateMemberRoles(guildId, selected.id, next);
      await onRolesChanged();
      onToast('Rollen aktualisiert.', 'success');
    } catch (error) {
      onToast(error.message, 'error');
    } finally {
      setRoleBusy(null);
    }
  }

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
            <button className="member-row" type="button" key={member.id} onClick={() => { setClosing(false); setSelectedId(member.id); }}>
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
          {selectedBadges.length > 0 && (
            <section className="profile-badges" aria-label="Globale Profilabzeichen">
              <div className="profile-badges__row">
                {selectedBadges.map((badge) => (
                  <button
                    type="button"
                    className={activeBadgeId === badge.id ? 'is-active' : ''}
                    style={{
                      '--badge-start': badge.color_start,
                      '--badge-end': badge.color_end
                    }}
                    aria-label={`${badge.name}: ${badge.description}`}
                    aria-pressed={activeBadgeId === badge.id}
                    title={badge.name}
                    onClick={() => setActiveBadgeId((current) => current === badge.id ? null : badge.id)}
                    key={badge.id}
                  >
                    <BadgeIcon name={badge.icon} />
                  </button>
                ))}
              </div>
              {activeBadge && (
                <div className="profile-badge-detail" aria-live="polite">
                  <span
                    style={{
                      '--badge-start': activeBadge.color_start,
                      '--badge-end': activeBadge.color_end
                    }}
                  >
                    <BadgeIcon name={activeBadge.icon} />
                  </span>
                  <div>
                    <strong>{activeBadge.name}</strong>
                    <p>{activeBadge.description}</p>
                  </div>
                </div>
              )}
            </section>
          )}
          <div className="profile-popover__section">
            <strong>Mitglied seit</strong>
            <span>{new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' }).format(new Date(selected.joined_at))}</span>
          </div>
          <div className="role-chips profile-role-chips">
            {selected.roles.filter((role) => !role.is_default).map((role) => (
              <span className="profile-role-chip" key={role.id}>
                <i style={{ background: role.color || '#949ba4' }} />
                <span>{role.name}</span>
                {canManageRoles && (
                  <button
                    type="button"
                    disabled={Boolean(roleBusy)}
                    onClick={() => toggleRole(role.id, false)}
                    aria-label={`${role.name} entfernen`}
                    title={`${role.name} entfernen`}
                  >
                    <X size={12} />
                  </button>
                )}
              </span>
            ))}
            {!selected.roles.some((role) => !role.is_default) && <span className="profile-role-chip"><i style={{ background: '#949ba4' }} /><span>@everyone</span></span>}
            {canManageRoles && (
              <button
                className="profile-role-add"
                type="button"
                aria-expanded={rolePickerOpen}
                onClick={() => setRolePickerOpen((current) => !current)}
              >
                <Plus size={14} /> Rolle
              </button>
            )}
          </div>
          {canManageRoles && rolePickerOpen && (
            <div className="profile-role-picker">
              <header>
                <strong>Rollen</strong>
                <button type="button" onClick={() => { setRolePickerOpen(false); setRoleQuery(''); }} aria-label="Rollenauswahl schließen"><X size={16} /></button>
              </header>
              <label className="profile-role-search">
                <Search size={15} />
                <input
                  value={roleQuery}
                  onChange={(event) => setRoleQuery(event.target.value)}
                  placeholder="Rolle suchen"
                  aria-label="Rolle suchen"
                  autoFocus
                />
              </label>
              <div className="profile-role-options">
                {filteredRoles.map((role) => {
                  const assigned = selected.roles.some((item) => item.id === role.id);
                  return (
                    <button
                      type="button"
                      className={assigned ? 'is-assigned' : ''}
                      disabled={Boolean(roleBusy)}
                      aria-pressed={assigned}
                      onClick={() => toggleRole(role.id, !assigned)}
                      key={role.id}
                    >
                      <i style={{ background: role.color || '#949ba4' }} />
                      <span>{role.name}</span>
                      {assigned && <Check size={16} />}
                    </button>
                  );
                })}
                {filteredRoles.length === 0 && <p>{customRoles.length ? 'Keine Rolle gefunden.' : 'Noch keine Rollen vorhanden.'}</p>}
              </div>
            </div>
          )}
          <div className="profile-popover__note"><ShieldCheck size={15} /> Guildora-Mitglied</div>
        </div>
      )}
    </aside>
  );
}
