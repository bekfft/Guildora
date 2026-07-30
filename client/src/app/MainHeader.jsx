import { Bell, Hash, HelpCircle, ListTree, Menu, Pin, Search, Users } from 'lucide-react';

export default function MainHeader({
  channel,
  isHome,
  directUser,
  membersVisible,
  notificationCount,
  onToggleMembers,
  onToast,
  onOpenDrawer,
  onOpenNotifications,
  onOpenSearch
}) {
  const title = isHome ? 'Freunde' : directUser ? (directUser.display_name || directUser.username) : channel?.name || 'Channel';
  return (
    <header className="main-header">
      <button className="icon-button main-header__menu" type="button" onClick={onOpenDrawer} aria-label="Navigation öffnen"><Menu size={22} /></button>
      <div className="main-header__title">
        {isHome || directUser ? <Users size={22} /> : <Hash size={22} />}
        <strong>{title}</strong>
        {channel?.topic && <><span className="main-header__divider" /><span className="main-header__topic">{channel.topic}</span></>}
      </div>
      <div className="main-header__actions">
        <button className="icon-button" type="button" aria-label="Threads" onClick={() => onToast('Threads folgen in einer späteren Version.')}><ListTree size={20} /></button>
        <button className="icon-button header-bell" type="button" aria-label="Benachrichtigungen" onClick={onOpenNotifications}>
          <Bell size={20} />
          {notificationCount > 0 && <span className="header-badge">{notificationCount > 99 ? '99+' : notificationCount}</span>}
        </button>
        <button className="icon-button" type="button" aria-label="Pinnwand" onClick={() => onToast('Die Pinnwand folgt später.')}><Pin size={20} /></button>
        {!isHome && !directUser && <button className={`icon-button ${membersVisible ? 'is-active' : ''}`} type="button" aria-label="Mitgliederliste umschalten" onClick={onToggleMembers}><Users size={21} /></button>}
        {!isHome && !directUser && <button className="icon-button header-search" type="button" aria-label="Suche" onClick={onOpenSearch}><span>Suche</span><Search size={17} /></button>}
        <button className="icon-button" type="button" aria-label="Hilfe" onClick={() => onToast('Das Hilfe-Center wird vorbereitet.')}><HelpCircle size={20} /></button>
      </div>
    </header>
  );
}
