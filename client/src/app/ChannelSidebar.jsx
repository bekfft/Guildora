import {
  BadgeCheck, Bug, ChevronDown, ChevronRight, Copy, Crown, Edit3, FolderPen, Gem,
  Handshake, Headphones, Heart, Hash, LogOut, Mic, MicOff, Search, Settings,
  ShieldCheck, Trash2, UserRound, Volume2, VolumeX
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { NavLink } from 'react-router-dom';
import { api } from '../lib/api.js';
import VoicePanel from './VoicePanel.jsx';

const BADGE_ICONS = {
  'badge-check': BadgeCheck,
  bug: Bug,
  crown: Crown,
  gem: Gem,
  handshake: Handshake,
  heart: Heart
};

function ProfileBadgeIcon({ name }) {
  const Icon = BADGE_ICONS[name] || ShieldCheck;
  return <Icon aria-hidden="true" size={14} strokeWidth={2.2} />;
}

function voiceParticipantName(participant) {
  return participant.is_local ? `${participant.name} (Du)` : participant.name;
}

function VoiceParticipants({ voice, channelId }) {
  if (voice.channel?.id !== channelId || !voice.participants.length) return null;
  return (
    <div className="voice-participant-list" aria-label="Teilnehmer im Sprachkanal">
      {voice.participants.map((participant) => (
        <div className={`voice-participant ${participant.is_speaking ? 'is-speaking' : ''}`} key={participant.id}>
          <span className="voice-participant__avatar">
            {participant.avatar_url
              ? <img src={participant.avatar_url} alt="" />
              : voiceParticipantName(participant)[0]?.toUpperCase()}
          </span>
          <span>{voiceParticipantName(participant)}</span>
          {participant.is_muted && <MicOff size={14} aria-label="Stummgeschaltet" />}
          {!participant.is_local && (
            <input
              className="voice-participant-volume"
              type="range"
              min="0"
              max="200"
              value={voice.participantVolumes[participant.id] ?? 100}
              title={`Lautstärke ${voice.participantVolumes[participant.id] ?? 100}%`}
              aria-label={`Lautstärke für ${participant.name}`}
              onChange={(event) => voice.setParticipantVolume(participant.id, event.target.value)}
            />
          )}
        </div>
      ))}
    </div>
  );
}

export default function ChannelSidebar({
  guildData, channelId, user, voice, canManageServer, canManageChannels, canManageInvites, onToast, onLeave,
  onOpenSettings, onOpenStaff, onOpenServerSettings, onOpenChannelSettings, onOpenCategorySettings,
  onDeleteChannel, onDeleteCategory, onMoveChannel, onNavigate, conversations = []
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState({});
  const [contextMenu, setContextMenu] = useState(null);
  const [draggingChannelId, setDraggingChannelId] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const [profileCardOpen, setProfileCardOpen] = useState(false);
  const [panelProfile, setPanelProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const contextMenuRef = useRef(null);
  const userPanelRef = useRef(null);
  const draggingChannelRef = useRef(null);
  const isHome = !guildData;

  useEffect(() => {
    if (!guildData) return;
    const next = {};
    for (const category of guildData.categories) {
      next[category.id] = localStorage.getItem(`guildora:category:${category.id}`) === 'collapsed';
    }
    setCollapsed(next);
  }, [guildData?.guild.id]);

  useEffect(() => {
    if (!contextMenu) return undefined;
    contextMenuRef.current?.querySelector('button')?.focus();
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
  }, [contextMenu]);

  useEffect(() => {
    if (!profileCardOpen) return undefined;
    const close = (event) => {
      if (event.type === 'keydown' && event.key !== 'Escape') return;
      if (event.type === 'pointerdown' && userPanelRef.current?.contains(event.target)) return;
      setProfileCardOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
      window.removeEventListener('resize', close);
    };
  }, [profileCardOpen]);

  async function toggleProfileCard() {
    const nextOpen = !profileCardOpen;
    setProfileCardOpen(nextOpen);
    if (!nextOpen || profileLoading) return;
    setProfileLoading(true);
    try {
      const result = await api.profile(user.id);
      setPanelProfile(result.profile);
    } catch (error) {
      onToast(error.message, 'error');
      setProfileCardOpen(false);
    } finally {
      setProfileLoading(false);
    }
  }

  async function copyUserId() {
    try {
      await navigator.clipboard.writeText(user.id);
      onToast('Nutzer-ID kopiert.', 'success');
      setProfileCardOpen(false);
    } catch {
      onToast('Die Nutzer-ID konnte nicht kopiert werden.', 'error');
    }
  }

  function openContextMenu(event, kind, item) {
    if (!canManageChannels) return;
    event.preventDefault();
    event.stopPropagation();
    const menuWidth = 220;
    const menuHeight = 100;
    setContextMenu({
      kind,
      item,
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - menuWidth - 8)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - menuHeight - 8))
    });
  }

  function handleContextKey(event, kind, item) {
    if (!canManageChannels || !['ContextMenu', 'F10'].includes(event.key) || (event.key === 'F10' && !event.shiftKey)) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 220;
    const menuHeight = 100;
    setContextMenu({
      kind,
      item,
      x: Math.max(8, Math.min(rect.left + 24, window.innerWidth - menuWidth - 8)),
      y: Math.max(8, Math.min(rect.top + 24, window.innerHeight - menuHeight - 8))
    });
  }

  function runContextAction(action) {
    const current = contextMenu;
    setContextMenu(null);
    if (current) action(current.item);
  }

  function startChannelDrag(event, channel) {
    if (!canManageChannels) {
      event.preventDefault();
      return;
    }
    draggingChannelRef.current = channel;
    setDraggingChannelId(channel.id);
    setContextMenu(null);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', channel.id);
  }

  function finishChannelDrag() {
    draggingChannelRef.current = null;
    setDraggingChannelId(null);
    setDropTarget(null);
  }

  function dragOverCategory(event, target) {
    if (!draggingChannelRef.current) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDropTarget(target);
  }

  function leaveDropTarget(event, target) {
    if (event.currentTarget.contains(event.relatedTarget)) return;
    setDropTarget((current) => current === target ? null : current);
  }

  function dropChannel(event, categoryId) {
    event.preventDefault();
    const channel = draggingChannelRef.current;
    finishChannelDrag();
    if (!channel || (channel.category_id || null) === categoryId) return;
    onMoveChannel(channel, categoryId);
  }

  function toggleCategory(id) {
    setCollapsed((current) => {
      const next = !current[id];
      localStorage.setItem(`guildora:category:${id}`, next ? 'collapsed' : 'open');
      return { ...current, [id]: next };
    });
  }

  async function joinVoice(channel) {
    onNavigate();
    try {
      await voice.join(channel, guildData.guild);
      onToast(`Mit „${channel.name}“ verbunden.`, 'success');
    } catch (error) {
      onToast(error.message, 'error');
    }
  }

  async function toggleVoiceControl(action) {
    try {
      await action();
    } catch (error) {
      onToast(error.message || 'Das Audiogerät konnte nicht geändert werden.', 'error');
    }
  }

  function handleChannelKeys(event) {
    if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
    const links = [...event.currentTarget.querySelectorAll('[data-channel-link]')];
    const current = links.indexOf(document.activeElement);
    const next = event.key === 'ArrowDown'
      ? Math.min(current + 1, links.length - 1)
      : Math.max(current - 1, 0);
    if (links[next]) {
      event.preventDefault();
      links[next].focus();
    }
  }

  return (
    <aside className="channel-sidebar">
      {isHome ? (
        <>
          <div className="dm-search"><Search size={15} /><span>Unterhaltung finden</span></div>
          <nav className="home-navigation">
            <NavLink to="/app/channels/@me" end className={({ isActive }) => `home-navigation__item ${isActive ? 'is-active' : ''}`} onClick={onNavigate}>
              <UserRound size={22} /> Freunde
            </NavLink>
            <div className="dm-heading"><span>Direktnachrichten</span><span>{conversations.length}</span></div>
            {conversations.length === 0 && <p className="dm-empty">Noch keine Unterhaltungen</p>}
            {conversations.map((conversation) => (
              <NavLink
                to={`/app/channels/@me/${conversation.id}`}
                className={`dm-navigation-item ${channelId === conversation.id ? 'is-active' : ''}`}
                onClick={onNavigate}
                key={conversation.id}
              >
                <span className={`mini-avatar is-${conversation.user.status}`}>
                  {conversation.user.avatar_url ? <img src={conversation.user.avatar_url} alt="" /> : (conversation.user.display_name || conversation.user.username)[0].toUpperCase()}
                </span>
                <span>{conversation.user.display_name || conversation.user.username}</span>
                {conversation.unread_count > 0 && <strong>{conversation.unread_count > 99 ? '99+' : conversation.unread_count}</strong>}
              </NavLink>
            ))}
          </nav>
        </>
      ) : (
        <>
          <div className="guild-sidebar-header">
            <button type="button" onClick={() => setMenuOpen((current) => !current)} aria-expanded={menuOpen}>
              <strong>{guildData.guild.name}</strong>
              <ChevronDown size={18} />
            </button>
            <div className={`guild-menu ${menuOpen ? 'is-open' : ''}`} aria-hidden={!menuOpen}>
                {canManageInvites && (
                  <button type="button" onClick={() => { setMenuOpen(false); onOpenServerSettings('invites'); }}>Einladen</button>
                )}
                {canManageServer && (
                  <button type="button" onClick={() => { setMenuOpen(false); onOpenServerSettings('overview'); }}>Server-Einstellungen</button>
                )}
                <button type="button" onClick={() => onToast('Benachrichtigungen findest du oben über das Glocken-Symbol.')}>Benachrichtigungen</button>
                <span />
                <button className="danger-action" type="button" onClick={() => { setMenuOpen(false); onLeave(); }}><LogOut size={16} /> Server verlassen</button>
              </div>
          </div>
          <div className="channel-list" onKeyDown={handleChannelKeys}>
            {(guildData.channels.some((channel) => !channel.category_id) || draggingChannelId) && (
              <section
                className={`channel-category channel-category--ungrouped ${dropTarget === 'ungrouped' ? 'is-drop-target' : ''} ${!guildData.channels.some((channel) => !channel.category_id) ? 'is-empty-drop' : ''}`}
                aria-label="Channels ohne Kategorie"
                onDragOver={(event) => dragOverCategory(event, 'ungrouped')}
                onDragLeave={(event) => leaveDropTarget(event, 'ungrouped')}
                onDrop={(event) => dropChannel(event, null)}
              >
                {draggingChannelId && !guildData.channels.some((channel) => !channel.category_id) && (
                  <span className="channel-drop-label">Ohne Kategorie ablegen</span>
                )}
                <div className="channel-category__items">
                  <div>
                    {guildData.channels.filter((channel) => !channel.category_id).map((channel) => (
                      <div
                        className={`channel-row ${channelId === channel.id ? 'is-active' : ''} ${voice.channel?.id === channel.id ? 'is-voice-active' : ''} ${channel.unread_count > 0 ? 'is-unread' : ''} ${draggingChannelId === channel.id ? 'is-dragging' : ''}`}
                        draggable={canManageChannels}
                        onDragStart={(event) => startChannelDrag(event, channel)}
                        onDragEnd={finishChannelDrag}
                        onContextMenu={(event) => openContextMenu(event, 'channel', channel)}
                        onKeyDown={(event) => handleContextKey(event, 'channel', channel)}
                        key={channel.id}
                      >
                        {channel.type === 'text' ? (
                          <NavLink
                            to={`/app/channels/${guildData.guild.id}/${channel.id}`}
                            className={`channel-link ${channelId === channel.id ? 'is-active' : ''}`}
                            data-channel-link
                            draggable={canManageChannels}
                            onClick={onNavigate}
                          >
                            <Hash size={20} /><span>{channel.name}</span>
                            {channel.unread_count > 0 && <strong className="channel-unread-count">{channel.unread_count > 99 ? '99+' : channel.unread_count}</strong>}
                          </NavLink>
                        ) : (
                          <button
                            className={`channel-link ${voice.channel?.id === channel.id ? 'is-active' : ''}`}
                            type="button"
                            data-channel-link
                            draggable={canManageChannels}
                            onClick={() => joinVoice(channel)}
                            aria-label={`${channel.name} beitreten`}
                          >
                            <Volume2 size={19} /><span>{channel.name}</span>
                          </button>
                        )}
                        {canManageChannels && (
                          <button
                            className="channel-row__settings"
                            type="button"
                            aria-label={`${channel.name} bearbeiten`}
                            title="Channel bearbeiten"
                            draggable={false}
                            onClick={() => onOpenChannelSettings(channel)}
                          >
                            <Settings size={16} />
                          </button>
                        )}
                        <VoiceParticipants voice={voice} channelId={channel.id} />
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}
            {guildData.categories.map((category) => {
              const channels = guildData.channels.filter((channel) => channel.category_id === category.id);
              return (
                <section
                  className={`channel-category ${dropTarget === category.id ? 'is-drop-target' : ''}`}
                  onDragOver={(event) => dragOverCategory(event, category.id)}
                  onDragLeave={(event) => leaveDropTarget(event, category.id)}
                  onDrop={(event) => dropChannel(event, category.id)}
                  key={category.id}
                >
                  <button
                    className="channel-category__header"
                    type="button"
                    onClick={() => toggleCategory(category.id)}
                    onContextMenu={(event) => openContextMenu(event, 'category', category)}
                    onKeyDown={(event) => handleContextKey(event, 'category', category)}
                    aria-expanded={!collapsed[category.id]}
                  >
                    {collapsed[category.id] ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                    <span>{category.name}</span>
                  </button>
                  <div className={`channel-category__items ${collapsed[category.id] ? 'is-collapsed' : ''}`}>
                    <div>
                      {channels.map((channel) => (
                        <div
                          className={`channel-row ${channelId === channel.id ? 'is-active' : ''} ${voice.channel?.id === channel.id ? 'is-voice-active' : ''} ${channel.unread_count > 0 ? 'is-unread' : ''} ${draggingChannelId === channel.id ? 'is-dragging' : ''}`}
                          draggable={canManageChannels}
                          onDragStart={(event) => startChannelDrag(event, channel)}
                          onDragEnd={finishChannelDrag}
                          onContextMenu={(event) => openContextMenu(event, 'channel', channel)}
                          onKeyDown={(event) => handleContextKey(event, 'channel', channel)}
                          key={channel.id}
                        >
                          {channel.type === 'text' ? (
                            <NavLink
                              to={`/app/channels/${guildData.guild.id}/${channel.id}`}
                              className={`channel-link ${channelId === channel.id ? 'is-active' : ''}`}
                              data-channel-link
                              draggable={canManageChannels}
                              tabIndex={collapsed[category.id] ? -1 : 0}
                              onClick={onNavigate}
                            >
                              <Hash size={20} /><span>{channel.name}</span>
                              {channel.unread_count > 0 && <strong className="channel-unread-count">{channel.unread_count > 99 ? '99+' : channel.unread_count}</strong>}
                            </NavLink>
                          ) : (
                            <button
                              className={`channel-link ${voice.channel?.id === channel.id ? 'is-active' : ''}`}
                              type="button"
                              data-channel-link
                              draggable={canManageChannels}
                              tabIndex={collapsed[category.id] ? -1 : 0}
                              onClick={() => joinVoice(channel)}
                              aria-label={`${channel.name} beitreten`}
                            >
                              <Volume2 size={19} /><span>{channel.name}</span>
                            </button>
                          )}
                          {canManageChannels && (
                            <button
                              className="channel-row__settings"
                              type="button"
                              aria-label={`${channel.name} bearbeiten`}
                              title="Channel bearbeiten"
                              draggable={false}
                              onClick={() => onOpenChannelSettings(channel)}
                            >
                              <Settings size={16} />
                            </button>
                          )}
                          <VoiceParticipants voice={voice} channelId={channel.id} />
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
              );
            })}
          </div>
        </>
      )}
      {voice.channel && <VoicePanel voice={voice} onToast={onToast} />}
      <div className="user-panel-wrap" ref={userPanelRef}>
        {profileCardOpen && (
          <article className="user-profile-card">
            <div
              className="user-profile-card__banner"
              style={(panelProfile?.banner_url || user.banner_url)
                ? { backgroundImage: `url("${panelProfile?.banner_url || user.banner_url}")` }
                : undefined}
            />
            <div className="user-profile-card__body">
              <div className="user-profile-card__avatar">
                {(panelProfile?.avatar_url || user.avatar_url)
                  ? <img src={panelProfile?.avatar_url || user.avatar_url} alt="" />
                  : (user.display_name || user.username)[0].toUpperCase()}
                <span className="status-dot" />
              </div>
              <div className="user-profile-card__heading">
                <strong>{panelProfile?.display_name || user.display_name || user.username}</strong>
                <span>@{user.username}</span>
              </div>
              {(panelProfile?.custom_status || user.custom_status) && (
                <p className="user-profile-card__status">{panelProfile?.custom_status || user.custom_status}</p>
              )}
              {profileLoading ? (
                <span className="user-profile-card__loading">Profil wird geladen …</span>
              ) : panelProfile?.badges?.some((badge) => badge.is_visible) ? (
                <div className="user-profile-card__badges" aria-label="Profilabzeichen">
                  {panelProfile.badges.filter((badge) => badge.is_visible).map((badge) => (
                    <span
                      style={{ '--badge-start': badge.color_start, '--badge-end': badge.color_end }}
                      title={badge.name}
                      key={badge.id}
                    >
                      <ProfileBadgeIcon name={badge.icon} />
                    </span>
                  ))}
                </div>
              ) : null}
              {panelProfile?.bio && <p className="user-profile-card__bio">{panelProfile.bio}</p>}
              <div className="user-profile-card__actions">
                <button type="button" onClick={() => { setProfileCardOpen(false); onOpenSettings('Profil'); }}>
                  <Edit3 size={16} /> Profil bearbeiten
                </button>
                <button type="button" onClick={copyUserId}>
                  <Copy size={16} /> Nutzer-ID kopieren
                </button>
              </div>
            </div>
          </article>
        )}
        <div className="user-panel">
          <button
            className={`user-panel__profile-trigger ${profileCardOpen ? 'is-open' : ''}`}
            type="button"
            onClick={toggleProfileCard}
            aria-expanded={profileCardOpen}
            aria-label="Eigenes Profil öffnen"
          >
            <span className="mini-avatar">
              {user.avatar_url ? <img src={user.avatar_url} alt="" /> : (user.display_name || user.username)[0].toUpperCase()}
              <span className="status-dot" />
            </span>
            <span className="user-panel__identity">
              <strong>{user.display_name || user.username}</strong>
              <span>@{user.username}</span>
            </span>
          </button>
          <div className="user-panel__actions">
            {user.staff && <button type="button" onClick={onOpenStaff} aria-label="Guildora Staff öffnen"><ShieldCheck size={17} /></button>}
            <button className={voice.muted ? 'is-danger' : ''} type="button" onClick={() => toggleVoiceControl(voice.toggleMuted)} aria-label={voice.muted ? 'Mikrofon aktivieren' : 'Mikrofon stummschalten'}>
              {voice.muted ? <MicOff size={17} /> : <Mic size={17} />}
            </button>
            <button className={voice.deafened ? 'is-danger' : ''} type="button" onClick={() => toggleVoiceControl(voice.toggleDeafened)} aria-label={voice.deafened ? 'Ton aktivieren' : 'Ton deaktivieren'}>
              {voice.deafened ? <VolumeX size={17} /> : <Headphones size={17} />}
            </button>
            <button type="button" onClick={() => onOpenSettings('Mein Konto')} aria-label="Einstellungen"><Settings size={17} /></button>
          </div>
        </div>
      </div>
      {contextMenu && createPortal(
        <div
          className="channel-context-menu"
          role="menu"
          aria-label={contextMenu.kind === 'channel' ? `Aktionen für ${contextMenu.item.name}` : `Aktionen für Kategorie ${contextMenu.item.name}`}
          style={{ left: contextMenu.x, top: contextMenu.y }}
          ref={contextMenuRef}
        >
          <button type="button" role="menuitem" onClick={() => runContextAction(
            contextMenu.kind === 'channel' ? onOpenChannelSettings : onOpenCategorySettings
          )}>
            {contextMenu.kind === 'channel' ? <Settings size={17} /> : <FolderPen size={17} />}
            {contextMenu.kind === 'channel' ? 'Channel bearbeiten' : 'Kategorie bearbeiten'}
          </button>
          <span />
          <button className="is-danger" type="button" role="menuitem" onClick={() => runContextAction(
            contextMenu.kind === 'channel' ? onDeleteChannel : onDeleteCategory
          )}>
            <Trash2 size={17} />
            {contextMenu.kind === 'channel' ? 'Channel löschen' : 'Kategorie löschen'}
          </button>
        </div>,
        document.body
      )}
    </aside>
  );
}
