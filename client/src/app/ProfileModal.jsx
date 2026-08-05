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
  ImagePlus,
  Gamepad2,
  LoaderCircle,
  MessageCircle,
  Plus,
  Search,
  Save,
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
import { useGuildoraDialog } from '../context/GuildoraDialogContext.jsx';
import { useDesktop } from '../context/DesktopContext.jsx';
import { activityElapsed, activityHeadline } from '../lib/activity.js';

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
  const dialog = useGuildoraDialog();
  const desktop = useDesktop();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [activeBadgeId, setActiveBadgeId] = useState(null);
  const [rolePickerOpen, setRolePickerOpen] = useState(false);
  const [roleQuery, setRoleQuery] = useState('');
  const [editingServerProfile, setEditingServerProfile] = useState(false);
  const [serverProfileForm, setServerProfileForm] = useState({ displayName: '', bio: '' });
  const [serverAvatarFile, setServerAvatarFile] = useState(null);
  const [serverBannerFile, setServerBannerFile] = useState(null);

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
    if (!profile?.server_profile) return;
    setServerProfileForm({
      displayName: profile.server_profile.display_name || profile.server_profile.nickname || '',
      bio: profile.server_profile.bio || ''
    });
  }, [profile?.server_profile]);

  useEffect(() => {
    const refreshSocialProfile = (payload = {}) => {
      if (!payload.userId || payload.userId === userId) loadProfile(true);
    };
    const refreshGuildProfile = ({ guildId: changedGuildId, scopes = [] } = {}) => {
      if (guildId && changedGuildId === guildId && scopes.includes('members')) loadProfile(true);
    };
    socket.on('social:refresh', refreshSocialProfile);
    socket.on('guild:refresh', refreshGuildProfile);
    const updateActivity = ({ userId: changedUserId, activity }) => {
      if (changedUserId === userId) setProfile((current) => current ? { ...current, activity } : current);
    };
    socket.on('activity:update', updateActivity);
    socket.on('social:activity', updateActivity);
    return () => {
      socket.off('social:refresh', refreshSocialProfile);
      socket.off('guild:refresh', refreshGuildProfile);
      socket.off('activity:update', updateActivity);
      socket.off('social:activity', updateActivity);
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

  async function joinActivity() {
    if (!desktop?.isDesktop) {
      onToast('Zum Beitreten wird die Guildora-Desktop-App benötigt.', 'error');
      return;
    }
    setBusy('activity-join');
    try {
      const { join } = await api.joinActivity(profile.id);
      const delivered = await desktop.joinActivity(join);
      if (!delivered) throw new Error('Das passende Spiel ist auf diesem Gerät nicht geöffnet oder noch nicht mit Guildora verbunden.');
      onToast('Beitrittsanfrage an das Spiel übergeben.', 'success');
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

  async function saveServerProfile(event) {
    event.preventDefault();
    if (!guildId || busy) return;
    setBusy('server-profile');
    try {
      const avatarUpload = serverAvatarFile ? await api.uploadFiles([serverAvatarFile]) : null;
      const bannerUpload = serverBannerFile ? await api.uploadFiles([serverBannerFile]) : null;
      await api.updateGuildProfile(guildId, {
        displayName: serverProfileForm.displayName.trim() || null,
        bio: serverProfileForm.bio.trim(),
        ...(avatarUpload ? { avatarAttachmentId: avatarUpload.attachments[0].id } : {}),
        ...(bannerUpload ? { bannerAttachmentId: bannerUpload.attachments[0].id } : {})
      });
      setServerAvatarFile(null);
      setServerBannerFile(null);
      setEditingServerProfile(false);
      await loadProfile(true);
      onRolesChanged?.();
      onToast('Serverprofil gespeichert.', 'success');
    } catch (error) {
      onToast(error.message, 'error');
    } finally {
      setBusy(null);
    }
  }

  async function reportProfile() {
    const reason = await dialog.prompt({
      title: 'Profil melden',
      message: 'Beschreibe kurz, warum dieses Profil vom Guildora-Team geprüft werden soll.',
      label: 'Grund der Meldung',
      placeholder: 'Grund eingeben …',
      required: true,
      confirmLabel: 'Meldung senden'
    });
    if (!reason) return;
    socialAction(() => api.reportProfile(profile.id, reason), 'Profil wurde dem Guildora-Team gemeldet.');
  }

  async function blockProfile() {
    if (!await dialog.confirm({
      title: `${nameOf(profile)} blockieren?`,
      message: 'Die Freundschaft und bestehende Direktnachrichten werden dadurch beendet.',
      confirmLabel: 'Nutzer blockieren'
    })) return;
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
  const displayName = profile.server_profile?.display_name || profile.server_profile?.nickname || nameOf(profile);
  const avatarUrl = profile.server_profile?.avatar_url || profile.avatar_url;
  const bannerUrl = profile.server_profile?.banner_url || profile.banner_url;
  const bio = profile.server_profile?.bio || profile.bio;
  return (
    <Modal title="Profil" onClose={onClose}>
      <article className="full-profile">
        <div
          className="full-profile__banner"
          style={bannerUrl ? { backgroundImage: `url("${bannerUrl}")` } : undefined}
        />
        <div className="full-profile__identity">
          <div className="full-profile__avatar">
            <span className="full-profile__avatar-media">
              {avatarUrl ? <img src={avatarUrl} alt="" /> : displayName[0].toUpperCase()}
            </span>
            <i className={`status-dot status-dot--${profile.status}`} />
          </div>
          <div>
            <h2>{displayName}</h2>
            <p>@{profile.username}</p>
            {profile.custom_status && <span>{profile.custom_status}</span>}
          </div>
        </div>

        <div className="full-profile__actions">
          {profile.is_self ? (
            <>
              <button type="button" className="is-primary" onClick={() => { onClose(); onEditProfile(); }}>
                <Edit3 size={16} /> Globales Profil
              </button>
              {guildId && <button type="button" onClick={() => setEditingServerProfile((value) => !value)}><Users size={16} /> Serverprofil</button>}
            </>
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

        {profile.activity && (
          <section className={`full-profile__activity is-${profile.activity.type}`}>
            {/^https?:\/\//i.test(profile.activity.assets?.largeImage || '') ? (
              <img src={profile.activity.assets.largeImage} alt="" />
            ) : <span><Gamepad2 size={24} /></span>}
            <div>
              <small>{activityHeadline(profile.activity)}</small>
              <strong>{profile.activity.details || profile.activity.name}</strong>
              {profile.activity.state && <p>{profile.activity.state}</p>}
              <em>{profile.activity.party ? `${profile.activity.party.currentSize} von ${profile.activity.party.maxSize} · ` : ''}{activityElapsed(profile.activity.startedAt)}</em>
              {(profile.activity.buttons.length > 0 || (profile.activity.joinable && !profile.is_self)) && (
                <nav>
                  {profile.activity.joinable && !profile.is_self && <button type="button" disabled={busy === 'activity-join'} onClick={joinActivity}>Beitreten</button>}
                  {profile.activity.buttons.map((button) => <a href={button.url} target="_blank" rel="noreferrer" key={`${button.label}:${button.url}`}>{button.label}</a>)}
                </nav>
              )}
            </div>
          </section>
        )}

        {profile.is_self && guildId && editingServerProfile && (
          <form className="server-profile-editor" onSubmit={saveServerProfile}>
            <header><div><strong>Serverprofil bearbeiten</strong><small>Gilt nur auf diesem Server.</small></div><button type="button" onClick={() => setEditingServerProfile(false)}><X size={16} /></button></header>
            <label><span>Anzeigename auf diesem Server</span><input maxLength={32} value={serverProfileForm.displayName} onChange={(event) => setServerProfileForm({ ...serverProfileForm, displayName: event.target.value })} placeholder={profile.display_name || profile.username} /></label>
            <label><span>Über mich auf diesem Server</span><textarea maxLength={190} rows={3} value={serverProfileForm.bio} onChange={(event) => setServerProfileForm({ ...serverProfileForm, bio: event.target.value })} /></label>
            <div className="server-profile-editor__uploads">
              <label><ImagePlus size={15} />{serverAvatarFile ? serverAvatarFile.name : 'Serveravatar'}<input hidden type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => setServerAvatarFile(event.target.files?.[0] || null)} /></label>
              <label><ImagePlus size={15} />{serverBannerFile ? serverBannerFile.name : 'Serverbanner'}<input hidden type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => setServerBannerFile(event.target.files?.[0] || null)} /></label>
            </div>
            <button className="is-primary" disabled={busy === 'server-profile'}><Save size={15} /> Speichern</button>
          </form>
        )}

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
          <p>{bio || 'Noch keine Profilbeschreibung vorhanden.'}</p>
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
