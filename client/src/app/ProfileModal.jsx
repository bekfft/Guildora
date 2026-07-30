import {
  BadgeCheck,
  Ban,
  Bug,
  Check,
  Crown,
  Edit3,
  Flag,
  Gem,
  Handshake,
  Heart,
  LoaderCircle,
  MessageCircle,
  Plus,
  Search,
  ShieldCheck,
  UserMinus,
  UserPlus,
  Users,
  X
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { socket } from '../lib/socket.js';
import Modal from './Modal.jsx';

const BADGE_ICONS = {
  'badge-check': BadgeCheck,
  bug: Bug,
  crown: Crown,
  gem: Gem,
  handshake: Handshake,
  heart: Heart
};

function BadgeIcon({ name, size = 15 }) {
  const Icon = BADGE_ICONS[name] || ShieldCheck;
  return <Icon aria-hidden="true" size={size} strokeWidth={2.2} />;
}

function nameOf(user) {
  return user?.display_name || user?.username || 'Unbekannt';
}

export default function ProfileModal({
  userId,
  guildId,
  member,
  roles = [],
  canManageRoles,
  onClose,
  onEditProfile,
  onOpenDm,
  onRolesChanged,
  onSocialChanged,
  onToast
}) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [activeBadgeId, setActiveBadgeId] = useState(null);
  const [rolePickerOpen, setRolePickerOpen] = useState(false);
  const [roleQuery, setRoleQuery] = useState('');

  const loadProfile = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const result = await api.profile(userId, guildId);
      setProfile(result.profile);
    } catch (error) {
      onToast(error.message, 'error');
      onClose();
    } finally {
      if (!silent) setLoading(false);
    }
  }, [guildId, onClose, onToast, userId]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    const refreshSocialProfile = (payload = {}) => {
      if (!payload.userId || payload.userId === userId) loadProfile(true);
    };
    const refreshGuildProfile = ({ guildId: changedGuildId, scopes = [] } = {}) => {
      if (guildId && changedGuildId === guildId && scopes.includes('members')) loadProfile(true);
    };
    socket.on('social:refresh', refreshSocialProfile);
    socket.on('guild:refresh', refreshGuildProfile);
    return () => {
      socket.off('social:refresh', refreshSocialProfile);
      socket.off('guild:refresh', refreshGuildProfile);
    };
  }, [guildId, loadProfile, userId]);

  const customRoles = roles.filter((role) => !role.is_default);
  const assignedRoles = member?.roles?.filter((role) => !role.is_default) || [];
  const filteredRoles = useMemo(() => customRoles.filter((role) => (
    role.name.toLowerCase().includes(roleQuery.trim().toLowerCase())
  )), [customRoles, roleQuery]);
  const visibleBadges = profile?.badges.filter((badge) => badge.is_visible) || [];
  const activeBadge = visibleBadges.find((badge) => badge.id === activeBadgeId) || null;

  async function socialAction(action, success) {
    setBusy('social');
    try {
      await action();
      await loadProfile();
      onSocialChanged?.();
      if (success) onToast(success, 'success');
    } catch (error) {
      onToast(error.message, 'error');
    } finally {
      setBusy(null);
    }
  }

  async function openDm() {
    setBusy('dm');
    try {
      const result = await api.openConversation(profile.id);
      onSocialChanged?.();
      onClose();
      onOpenDm(result.conversation.id);
    } catch (error) {
      onToast(error.message, 'error');
    } finally {
      setBusy(null);
    }
  }

  async function toggleRole(roleId, add) {
    if (!member || !canManageRoles || busy) return;
    const current = assignedRoles.map((role) => role.id);
    const next = add ? [...new Set([...current, roleId])] : current.filter((id) => id !== roleId);
    setBusy(`role:${roleId}`);
    try {
      await api.updateMemberRoles(guildId, member.id, next);
      await onRolesChanged?.();
      onToast('Rollen aktualisiert.', 'success');
    } catch (error) {
      onToast(error.message, 'error');
    } finally {
      setBusy(null);
    }
  }

  function reportProfile() {
    const reason = window.prompt('Warum möchtest du dieses Profil melden?');
    if (!reason) return;
    socialAction(() => api.reportProfile(profile.id, reason), 'Profil wurde dem Guildora-Team gemeldet.');
  }

  function blockProfile() {
    if (!window.confirm(`${nameOf(profile)} blockieren? Freundschaft und Direktnachrichten werden dadurch beendet.`)) return;
    socialAction(() => api.blockUser(profile.id), 'Nutzer blockiert.');
  }

  if (loading) {
    return (
      <Modal title="Profil" onClose={onClose}>
        <div className="profile-modal-loading"><LoaderCircle className="spin" size={24} /> Profil wird geladen …</div>
      </Modal>
    );
  }
  if (!profile) return null;

  const relationship = profile.relationship?.state;
  return (
    <Modal title="Profil" onClose={onClose}>
      <article className="full-profile">
        <div
          className="full-profile__banner"
          style={profile.banner_url ? { backgroundImage: `url("${profile.banner_url}")` } : undefined}
        />
        <div className="full-profile__identity">
          <div className="full-profile__avatar">
            {profile.avatar_url ? <img src={profile.avatar_url} alt="" /> : nameOf(profile)[0].toUpperCase()}
            <i className={`status-dot status-dot--${profile.status}`} />
          </div>
          <div>
            <h2>{nameOf(profile)}</h2>
            <p>@{profile.username}</p>
            {profile.custom_status && <span>{profile.custom_status}</span>}
          </div>
        </div>

        <div className="full-profile__actions">
          {profile.is_self ? (
            <button type="button" className="is-primary" onClick={() => { onClose(); onEditProfile(); }}>
              <Edit3 size={16} /> Profil bearbeiten
            </button>
          ) : (
            <>
              {relationship === 'accepted' && (
                <button type="button" className="is-primary" disabled={Boolean(busy)} onClick={openDm}>
                  <MessageCircle size={16} /> Nachricht
                </button>
              )}
              {!relationship && (
                <button type="button" className="is-primary" disabled={Boolean(busy)} onClick={() => socialAction(
                  () => api.addFriend(profile.username),
                  'Freundschaftsanfrage gesendet.'
                )}>
                  <UserPlus size={16} /> Freund hinzufügen
                </button>
              )}
              {relationship === 'incoming' && (
                <button type="button" className="is-primary" disabled={Boolean(busy)} onClick={() => socialAction(
                  () => api.respondFriend(profile.relationship.id, 'accept'),
                  'Freundschaftsanfrage angenommen.'
                )}>
                  <Check size={16} /> Annehmen
                </button>
              )}
              {relationship === 'outgoing' && (
                <button type="button" disabled={Boolean(busy)} onClick={() => socialAction(
                  () => api.removeFriend(profile.relationship.id),
                  'Freundschaftsanfrage zurückgezogen.'
                )}>
                  <X size={16} /> Anfrage zurückziehen
                </button>
              )}
              {relationship === 'blocked' && (
                <button type="button" disabled={Boolean(busy)} onClick={() => socialAction(
                  () => api.unblockUser(profile.id),
                  'Blockierung aufgehoben.'
                )}>
                  <UserPlus size={16} /> Entblockieren
                </button>
              )}
              {relationship === 'accepted' && (
                <button type="button" disabled={Boolean(busy)} onClick={() => socialAction(
                  () => api.removeFriend(profile.relationship.id),
                  'Freund entfernt.'
                )}>
                  <UserMinus size={16} /> Entfernen
                </button>
              )}
              {!['blocked', 'blocked_by_other'].includes(relationship) && (
                <button type="button" className="is-danger" disabled={Boolean(busy)} onClick={blockProfile}>
                  <Ban size={16} /> Blockieren
                </button>
              )}
              <button type="button" disabled={Boolean(busy)} onClick={reportProfile}>
                <Flag size={16} /> Melden
              </button>
            </>
          )}
        </div>

        {visibleBadges.length > 0 && (
          <section className="full-profile__section">
            <h3>Abzeichen</h3>
            <div className="full-profile-badges">
              {visibleBadges.map((badge) => (
                <button
                  type="button"
                  className={activeBadgeId === badge.id ? 'is-active' : ''}
                  style={{ '--badge-start': badge.color_start, '--badge-end': badge.color_end }}
                  title={badge.name}
                  aria-label={`${badge.name}: ${badge.description}`}
                  onClick={() => setActiveBadgeId((current) => current === badge.id ? null : badge.id)}
                  key={badge.id}
                >
                  <BadgeIcon name={badge.icon} />
                </button>
              ))}
            </div>
            {activeBadge && <p className="full-profile-badge-detail"><strong>{activeBadge.name}</strong>{activeBadge.description}</p>}
          </section>
        )}

        <section className="full-profile__section">
          <h3>Über mich</h3>
          <p>{profile.bio || 'Noch keine Profilbeschreibung vorhanden.'}</p>
          <small>Bei Guildora seit {new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' }).format(new Date(profile.created_at))}</small>
        </section>

        {profile.server_profile && (
          <section className="full-profile__section">
            <h3>Rollen auf diesem Server</h3>
            <div className="full-profile-roles">
              {assignedRoles.map((role) => (
                <span key={role.id}>
                  <i style={{ background: role.color || '#949ba4' }} />{role.name}
                  {canManageRoles && <button type="button" disabled={Boolean(busy)} onClick={() => toggleRole(role.id, false)} aria-label={`${role.name} entfernen`}><X size={11} /></button>}
                </span>
              ))}
              {!assignedRoles.length && <small>Keine zusätzlichen Rollen</small>}
              {canManageRoles && <button type="button" onClick={() => setRolePickerOpen((open) => !open)}><Plus size={13} /> Rolle</button>}
            </div>
            {canManageRoles && rolePickerOpen && (
              <div className="full-profile-role-picker">
                <label><Search size={14} /><input value={roleQuery} onChange={(event) => setRoleQuery(event.target.value)} placeholder="Rolle suchen" /></label>
                <div>
                  {filteredRoles.map((role) => {
                    const assigned = assignedRoles.some((item) => item.id === role.id);
                    return (
                      <button type="button" className={assigned ? 'is-assigned' : ''} disabled={Boolean(busy)} onClick={() => toggleRole(role.id, !assigned)} key={role.id}>
                        <i style={{ background: role.color || '#949ba4' }} /><span>{role.name}</span>{assigned && <Check size={14} />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        )}

        {!profile.is_self && (
          <div className="full-profile__mutual">
            <section>
              <h3><Users size={15} /> Gemeinsame Server · {profile.mutual_guilds.length}</h3>
              {profile.mutual_guilds.slice(0, 4).map((guild) => <span key={guild.id}>{guild.icon_url ? <img src={guild.icon_url} alt="" /> : guild.name[0]}{guild.name}</span>)}
              {!profile.mutual_guilds.length && <small>Keine gemeinsamen Server</small>}
            </section>
            <section>
              <h3><Users size={15} /> Gemeinsame Freunde · {profile.mutual_friends.length}</h3>
              {profile.mutual_friends.slice(0, 4).map((friend) => <span key={friend.id}>{friend.avatar_url ? <img src={friend.avatar_url} alt="" /> : nameOf(friend)[0]}{nameOf(friend)}</span>)}
              {!profile.mutual_friends.length && <small>Keine gemeinsamen Freunde</small>}
            </section>
          </div>
        )}
      </article>
    </Modal>
  );
}
