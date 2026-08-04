import {
  AtSign,
  Ban,
  Check,
  ChevronRight,
  Clock3,
  Copy,
  Gavel,
  MessageCircle,
  Shield,
  UserMinus,
  UserPen,
  UserPlus,
  UserRound,
  Users,
  X
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useGuildoraDialog } from '../context/GuildoraDialogContext.jsx';
import { api } from '../lib/api.js';

function memberName(member) {
  return member.nickname || member.display_name || member.username;
}

export default function MemberList({
  members,
  loading,
  currentUserId,
  guildId,
  guildOwnerId,
  roles = [],
  capabilities = {},
  canMention = true,
  skipEntranceAnimation = false,
  onClose,
  onOpenProfile,
  onOpenDm,
  onMention,
  onOpenModeration,
  onRefresh,
  onSocialChanged,
  onToast
}) {
  const dialog = useGuildoraDialog();
  const [contextMenu, setContextMenu] = useState(null);
  const [rolesOpen, setRolesOpen] = useState(false);
  const [busy, setBusy] = useState(null);
  const contextMenuRef = useRef(null);

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

  useEffect(() => {
    if (!contextMenu) return undefined;
    const menu = contextMenuRef.current;
    if (menu) {
      const nextX = Math.max(8, Math.min(contextMenu.x, window.innerWidth - menu.offsetWidth - 8));
      const nextY = Math.max(8, Math.min(contextMenu.y, window.innerHeight - menu.offsetHeight - 8));
      if (nextX !== contextMenu.x || nextY !== contextMenu.y) {
        setContextMenu((current) => current ? { ...current, x: nextX, y: nextY } : current);
      }
      menu.querySelector('button')?.focus();
    }
    const close = (event) => {
      if (event.type === 'keydown' && event.key !== 'Escape') return;
      if (event.type === 'pointerdown' && contextMenuRef.current?.contains(event.target)) return;
      setContextMenu(null);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [contextMenu, rolesOpen]);

  function openContextMenu(event, member) {
    event.preventDefault();
    setRolesOpen(false);
    setBusy(null);
    setContextMenu({
      member,
      profile: null,
      profileLoading: member.user_id !== currentUserId,
      x: event.clientX,
      y: event.clientY
    });
    if (member.user_id === currentUserId) return;
    api.profile(member.user_id, guildId)
      .then(({ profile }) => setContextMenu((current) => (
        current?.member.id === member.id ? { ...current, profile, profileLoading: false } : current
      )))
      .catch(() => setContextMenu((current) => (
        current?.member.id === member.id ? { ...current, profileLoading: false } : current
      )));
  }

  async function runAction(key, action, success, { refreshMembers = false, refreshSocial = false } = {}) {
    if (busy) return;
    setBusy(key);
    try {
      await action();
      if (refreshMembers) await onRefresh?.();
      if (refreshSocial) await onSocialChanged?.();
      if (success) onToast(success, 'success');
      setContextMenu(null);
    } catch (error) {
      onToast(error.message, 'error');
    } finally {
      setBusy(null);
    }
  }

  async function changeNickname(member) {
    const nickname = await dialog.prompt({
      title: `Server-Nickname für ${memberName(member)}`,
      message: 'Leer lassen, um wieder den normalen Anzeigenamen zu verwenden.',
      label: 'Server-Nickname',
      initialValue: member.nickname || '',
      maxLength: 32,
      confirmLabel: 'Nickname speichern'
    });
    if (nickname === null) return;
    await runAction(
      'nickname',
      () => api.updateMemberNickname(guildId, member.id, nickname.trim() || null),
      'Server-Nickname aktualisiert.',
      { refreshMembers: true }
    );
  }

  async function toggleRole(member, roleId) {
    const assigned = member.roles.filter((role) => !role.is_default).map((role) => role.id);
    const next = assigned.includes(roleId)
      ? assigned.filter((id) => id !== roleId)
      : [...assigned, roleId];
    await runAction(
      `role:${roleId}`,
      () => api.updateMemberRoles(guildId, member.id, next),
      'Rollen aktualisiert.',
      { refreshMembers: true }
    );
  }

  async function timeoutMember(member) {
    const reason = await dialog.prompt({
      title: `${memberName(member)} in Timeout schicken`,
      message: 'Gib optional einen Grund für den Timeout an.',
      label: 'Grund',
      placeholder: 'Optionaler Grund …',
      confirmLabel: 'Weiter'
    });
    if (reason === null) return;
    const duration = await dialog.prompt({
      title: 'Dauer des Timeouts',
      message: 'Wie viele Minuten soll der Timeout dauern?',
      label: 'Minuten',
      inputType: 'number',
      inputMode: 'numeric',
      initialValue: '10',
      min: 1,
      step: 1,
      required: true,
      confirmLabel: 'Timeout setzen',
      validate: (value) => {
        const minutes = Number(value);
        return Number.isInteger(minutes) && minutes >= 1 ? '' : 'Bitte gib eine ganze Zahl ab 1 ein.';
      }
    });
    if (duration === null) return;
    await runAction(
      'timeout',
      () => api.timeoutMember(guildId, member.user_id, Number(duration), reason),
      'Timeout gesetzt.'
    );
  }

  async function kickMember(member) {
    if (!await dialog.confirm({
      title: `${memberName(member)} kicken?`,
      message: 'Das Mitglied wird vom Server entfernt und muss erneut eingeladen werden.',
      confirmLabel: 'Mitglied kicken'
    })) return;
    await runAction(
      'kick',
      () => api.kickMember(guildId, member.id),
      'Mitglied entfernt.',
      { refreshMembers: true }
    );
  }

  async function banMember(member) {
    const reason = await dialog.prompt({
      title: `${memberName(member)} bannen`,
      message: 'Gib optional einen Grund für die Serversperre an.',
      label: 'Grund',
      placeholder: 'Optionaler Grund …',
      confirmLabel: 'Weiter'
    });
    if (reason === null) return;
    if (!await dialog.confirm({
      title: `${memberName(member)} wirklich bannen?`,
      message: 'Das Mitglied wird gesperrt und sofort vom Server entfernt.',
      confirmLabel: 'Mitglied bannen'
    })) return;
    await runAction(
      'ban',
      () => api.banMember(guildId, member.user_id, reason),
      'Mitglied gesperrt.',
      { refreshMembers: true }
    );
  }

  const selected = contextMenu?.member;
  const profile = contextMenu?.profile;
  const relationship = profile?.relationship?.state;
  const isSelf = selected?.user_id === currentUserId;
  const canModerateSelected = Boolean(
    selected
    && capabilities.kickMembers
    && !isSelf
    && selected.user_id !== guildOwnerId
  );
  const customRoles = roles.filter((role) => !role.is_default);

  return (
    <aside className={`member-list ${skipEntranceAnimation ? 'skip-entrance-animation' : ''}`} aria-label="Mitglieder">
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
            <button
              className="member-row"
              type="button"
              key={member.id}
              onClick={() => onOpenProfile(member.user_id)}
              onContextMenu={(event) => openContextMenu(event, member)}
            >
              <span className="member-avatar">
                {member.avatar_url ? <img src={member.avatar_url} alt="" /> : memberName(member)[0].toUpperCase()}
                <i className={`status-dot status-dot--${member.status}`} />
              </span>
              <span style={{ color: group.role.color || 'var(--channel-hover)' }}>{memberName(member)}</span>
            </button>
          ))}
        </section>
      )) : <p className="member-list__empty">Noch keine weiteren Mitglieder.</p>}

      {contextMenu && createPortal(
        <div
          className="member-context-menu"
          role="menu"
          aria-label={`Aktionen für ${memberName(selected)}`}
          style={{ left: contextMenu.x, top: contextMenu.y }}
          ref={contextMenuRef}
        >
          <button type="button" role="menuitem" onClick={() => { setContextMenu(null); onOpenProfile(selected.user_id); }}>
            <UserRound size={17} /> Profil
          </button>
          {canMention && (
            <button type="button" role="menuitem" onClick={() => { setContextMenu(null); onMention(selected); }}>
              <AtSign size={17} /> Erwähnen
            </button>
          )}
          {!isSelf && (
            <button type="button" role="menuitem" disabled={Boolean(busy)} onClick={() => runAction(
              'dm',
              async () => {
                const result = await api.openConversation(selected.user_id);
                onOpenDm(result.conversation.id);
              }
            )}>
              <MessageCircle size={17} /> Nachricht
            </button>
          )}

          {!isSelf && profile && !contextMenu.profileLoading && !relationship && (
            <button type="button" role="menuitem" disabled={Boolean(busy)} onClick={() => runAction(
              'friend',
              () => api.addFriend(profile.username),
              'Freundschaftsanfrage gesendet.',
              { refreshSocial: true }
            )}>
              <UserPlus size={17} /> Freund hinzufügen
            </button>
          )}
          {!isSelf && relationship === 'incoming' && (
            <button type="button" role="menuitem" disabled={Boolean(busy)} onClick={() => runAction(
              'friend',
              () => api.respondFriend(profile.relationship.id, 'accept'),
              'Freundschaftsanfrage angenommen.',
              { refreshSocial: true }
            )}>
              <Check size={17} /> Freundschaft annehmen
            </button>
          )}
          {!isSelf && relationship === 'outgoing' && (
            <button type="button" role="menuitem" disabled={Boolean(busy)} onClick={() => runAction(
              'friend',
              () => api.removeFriend(profile.relationship.id),
              'Freundschaftsanfrage zurückgezogen.',
              { refreshSocial: true }
            )}>
              <UserMinus size={17} /> Anfrage zurückziehen
            </button>
          )}
          {!isSelf && relationship === 'accepted' && (
            <button type="button" role="menuitem" disabled={Boolean(busy)} onClick={() => runAction(
              'friend',
              () => api.removeFriend(profile.relationship.id),
              'Freund entfernt.',
              { refreshSocial: true }
            )}>
              <UserMinus size={17} /> Freund entfernen
            </button>
          )}
          {!isSelf && relationship === 'blocked' && (
            <button type="button" role="menuitem" disabled={Boolean(busy)} onClick={() => runAction(
              'unblock',
              () => api.unblockUser(selected.user_id),
              'Blockierung aufgehoben.',
              { refreshSocial: true }
            )}>
              <Shield size={17} /> Entblockieren
            </button>
          )}
          {!isSelf && !['blocked', 'blocked_by_other'].includes(relationship) && (
            <button className="is-danger" type="button" role="menuitem" disabled={Boolean(busy)} onClick={async () => {
              if (!await dialog.confirm({
                title: `${memberName(selected)} blockieren?`,
                message: 'Eine bestehende Freundschaft und Direktnachrichten werden dadurch beendet.',
                confirmLabel: 'Nutzer blockieren'
              })) return;
              await runAction(
                'block',
                () => api.blockUser(selected.user_id),
                'Nutzer blockiert.',
                { refreshSocial: true }
              );
            }}>
              <Ban size={17} /> Blockieren
            </button>
          )}

          {(capabilities.manageServer || capabilities.manageRoles || canModerateSelected) && <span className="member-context-menu__separator" />}

          {capabilities.manageServer && (
            <button type="button" role="menuitem" disabled={Boolean(busy)} onClick={() => changeNickname(selected)}>
              <UserPen size={17} /> Nickname ändern
            </button>
          )}
          {capabilities.manageRoles && customRoles.length > 0 && (
            <>
              <button type="button" role="menuitem" aria-expanded={rolesOpen} onClick={() => setRolesOpen((current) => !current)}>
                <Shield size={17} /> Rollen <ChevronRight className={`member-context-menu__chevron ${rolesOpen ? 'is-open' : ''}`} size={16} />
              </button>
              {rolesOpen && (
                <div className="member-context-menu__roles" role="group" aria-label={`Rollen für ${memberName(selected)}`}>
                  {customRoles.map((role) => {
                    const assigned = selected.roles.some((item) => item.id === role.id);
                    return (
                      <button type="button" role="menuitemcheckbox" aria-checked={assigned} disabled={Boolean(busy)} onClick={() => toggleRole(selected, role.id)} key={role.id}>
                        <i style={{ background: role.color || '#949ba4' }} />
                        <span>{role.name}</span>
                        {assigned && <Check size={15} />}
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
          {canModerateSelected && (
            <>
              <button type="button" role="menuitem" onClick={() => { setContextMenu(null); onOpenModeration(); }}>
                <Gavel size={17} /> In Moderation öffnen
              </button>
              <button className="is-danger" type="button" role="menuitem" disabled={Boolean(busy)} onClick={() => timeoutMember(selected)}>
                <Clock3 size={17} /> {memberName(selected)} in Timeout
              </button>
              <button className="is-danger" type="button" role="menuitem" disabled={Boolean(busy)} onClick={() => kickMember(selected)}>
                <UserMinus size={17} /> {memberName(selected)} kicken
              </button>
              <button className="is-danger" type="button" role="menuitem" disabled={Boolean(busy)} onClick={() => banMember(selected)}>
                <Ban size={17} /> {memberName(selected)} bannen
              </button>
            </>
          )}

          <span className="member-context-menu__separator" />
          <button type="button" role="menuitem" onClick={() => runAction(
            'copy',
            () => navigator.clipboard.writeText(selected.user_id),
            'Nutzer-ID kopiert.'
          )}>
            <Copy size={17} /> Nutzer-ID kopieren
          </button>
        </div>,
        document.body
      )}
    </aside>
  );
}
