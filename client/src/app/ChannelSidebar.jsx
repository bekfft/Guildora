import {
  ChevronDown, ChevronRight, FolderPen, Headphones, Hash, LogOut, Mic, MicOff,
  Search, Settings, Trash2, UserRound, Volume2, VolumeX
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { NavLink } from 'react-router-dom';

export default function ChannelSidebar({
  guildData, channelId, user, canManageServer, canManageChannels, canManageInvites, onToast, onLeave,
  onOpenSettings, onOpenServerSettings, onOpenChannelSettings, onOpenCategorySettings,
  onDeleteChannel, onDeleteCategory, onMoveChannel, onNavigate
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [muted, setMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [collapsed, setCollapsed] = useState({});
  const [contextMenu, setContextMenu] = useState(null);
  const [draggingChannelId, setDraggingChannelId] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const contextMenuRef = useRef(null);
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
            <NavLink to="/app/channels/@me" className="home-navigation__item is-active" onClick={onNavigate}>
              <UserRound size={22} /> Freunde
            </NavLink>
            <div className="dm-heading"><span>Direktnachrichten</span><span>+</span></div>
            <p className="dm-empty">Noch keine Unterhaltungen</p>
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
                <button type="button" onClick={() => onToast('Benachrichtigungen folgen später.')}>Benachrichtigungen</button>
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
                        className={`channel-row ${channelId === channel.id ? 'is-active' : ''} ${channel.unread_count > 0 ? 'is-unread' : ''} ${draggingChannelId === channel.id ? 'is-dragging' : ''}`}
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
                          <button className="channel-link" type="button" data-channel-link draggable={canManageChannels} onClick={() => onToast('Voice kommt in einer späteren Version.')}>
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
                          className={`channel-row ${channelId === channel.id ? 'is-active' : ''} ${channel.unread_count > 0 ? 'is-unread' : ''} ${draggingChannelId === channel.id ? 'is-dragging' : ''}`}
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
                            <button className="channel-link" type="button" data-channel-link draggable={canManageChannels} tabIndex={collapsed[category.id] ? -1 : 0} onClick={() => onToast('Voice kommt in einer späteren Version.')}>
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
      <div className="user-panel">
        <div className="mini-avatar">{(user.display_name || user.username)[0].toUpperCase()}<span className="status-dot" /></div>
        <div className="user-panel__identity">
          <strong>{user.display_name || user.username}</strong>
          <span>@{user.username}</span>
        </div>
        <div className="user-panel__actions">
          <button className={muted ? 'is-danger' : ''} type="button" onClick={() => setMuted((value) => !value)} aria-label={muted ? 'Mikrofon aktivieren' : 'Mikrofon stummschalten'}>
            {muted ? <MicOff size={17} /> : <Mic size={17} />}
          </button>
          <button className={deafened ? 'is-danger' : ''} type="button" onClick={() => setDeafened((value) => !value)} aria-label={deafened ? 'Ton aktivieren' : 'Ton deaktivieren'}>
            {deafened ? <VolumeX size={17} /> : <Headphones size={17} />}
          </button>
          <button type="button" onClick={onOpenSettings} aria-label="Einstellungen"><Settings size={17} /></button>
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
