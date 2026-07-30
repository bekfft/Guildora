import { AtSign, Bell, CheckCheck, CornerUpLeft, LoaderCircle, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';

function actorName(actor) {
  return actor?.display_name || actor?.username || 'Unbekannt';
}

function notificationTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : new Intl.DateTimeFormat('de-DE', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
}

export default function NotificationCenter({ onClose, onNavigate, onCountChange, onToast }) {
  const { settings, saveSettings } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [totalUnread, setTotalUnread] = useState(0);
  useEffect(() => {
    let active = true;
    api.notifications()
      .then((result) => {
        if (!active) return;
        setNotifications(result.notifications);
        setTotalUnread(result.unread_count);
        onCountChange(result.unread_count);
      })
      .catch((error) => active && onToast(error.message, 'error'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [onCountChange, onToast]);

  async function openNotification(notification) {
    try {
      if (!notification.read_at) {
        const result = await api.readNotification(notification.id);
        setNotifications((current) => current.map((item) => (
          item.id === notification.id ? result.notification : item
        )));
        setTotalUnread((current) => {
          const next = Math.max(0, current - 1);
          onCountChange(next);
          return next;
        });
      }
      onNavigate(notification);
    } catch (error) {
      onToast(error.message, 'error');
    }
  }

  async function readAll() {
    try {
      await api.readAllNotifications();
      const readAt = new Date().toISOString();
      setNotifications((current) => current.map((item) => ({ ...item, read_at: item.read_at || readAt })));
      setTotalUnread(0);
      onCountChange(0);
    } catch (error) {
      onToast(error.message, 'error');
    }
  }

  async function enableDesktopNotifications() {
    if (!('Notification' in window)) {
      onToast('Desktop-Benachrichtigungen werden von diesem System nicht unterstützt.', 'error');
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      await saveSettings({ desktop_notifications: true });
      onToast('Desktop-Benachrichtigungen sind aktiviert.', 'success');
    } else {
      onToast('Die Berechtigung für Desktop-Benachrichtigungen wurde nicht erteilt.', 'error');
    }
  }

  return (
    <div className="engagement-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="engagement-panel" role="dialog" aria-modal="true" aria-labelledby="notification-title">
        <header>
          <div>
            <Bell size={20} />
            <h2 id="notification-title">Benachrichtigungen</h2>
            {totalUnread > 0 && <span className="engagement-count">{totalUnread}</span>}
          </div>
          <button type="button" aria-label="Benachrichtigungen schließen" onClick={onClose}><X size={21} /></button>
        </header>
        <div className="engagement-toolbar">
          <span>Erwähnungen und Antworten</span>
          {!settings?.desktop_notifications && <button type="button" onClick={enableDesktopNotifications}><Bell size={15} /> Desktop aktivieren</button>}
          <button type="button" onClick={readAll} disabled={totalUnread === 0}>
            <CheckCheck size={16} /> Alle gelesen
          </button>
        </div>
        <div className="notification-list">
          {loading && <div className="engagement-loading"><LoaderCircle className="spin" size={22} />Wird geladen …</div>}
          {!loading && notifications.length === 0 && (
            <div className="engagement-empty">
              <Bell size={34} />
              <strong>Alles ruhig</strong>
              <span>Neue Erwähnungen und Antworten erscheinen hier.</span>
            </div>
          )}
          {notifications.map((notification) => (
            <button
              className={`notification-item ${notification.read_at ? '' : 'is-unread'}`}
              type="button"
              key={notification.id}
              onClick={() => openNotification(notification)}
            >
              <span className="notification-item__icon">
                {notification.type === 'mention' ? <AtSign size={18} /> : <CornerUpLeft size={18} />}
              </span>
              <span className="notification-item__body">
                <span>
                  <strong>{actorName(notification.actor)}</strong>
                  {notification.type === 'mention' ? ' hat dich erwähnt' : ' hat dir geantwortet'}
                </span>
                <small>{notification.guild_name} · #{notification.channel_name} · {notificationTime(notification.created_at)}</small>
                <span className="notification-item__content">{notification.content}</span>
              </span>
              {!notification.read_at && <span className="notification-item__dot" aria-label="Ungelesen" />}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
