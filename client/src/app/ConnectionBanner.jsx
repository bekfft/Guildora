import { CloudOff, LoaderCircle, Wifi } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { socket } from '../lib/socket.js';

export default function ConnectionBanner() {
  const [status, setStatus] = useState(() => navigator.onLine ? 'online' : 'offline');
  const connectedOnce = useRef(socket.connected);
  const hideTimer = useRef(null);

  useEffect(() => {
    const clearHideTimer = () => {
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
      hideTimer.current = null;
    };
    const handleOffline = () => {
      clearHideTimer();
      setStatus('offline');
    };
    const handleOnline = () => {
      clearHideTimer();
      setStatus('reconnecting');
      if (!socket.connected) socket.connect();
    };
    const handleConnect = () => {
      const showRecovered = connectedOnce.current;
      connectedOnce.current = true;
      clearHideTimer();
      if (!showRecovered) {
        setStatus('online');
        return;
      }
      setStatus('recovered');
      hideTimer.current = window.setTimeout(() => setStatus('online'), 2200);
    };
    const handleDisconnect = () => {
      if (!navigator.onLine) handleOffline();
      else if (connectedOnce.current) setStatus('reconnecting');
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    return () => {
      clearHideTimer();
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
    };
  }, []);

  if (status === 'online') return null;
  const content = {
    offline: { icon: CloudOff, text: 'Du bist offline. Nachrichten werden nach der Verbindung aktualisiert.' },
    reconnecting: { icon: LoaderCircle, text: 'Verbindung wird wiederhergestellt …' },
    recovered: { icon: Wifi, text: 'Wieder verbunden.' }
  }[status];
  const Icon = content.icon;

  return (
    <div className={`connection-banner is-${status}`} role="status" aria-live="polite">
      <Icon className={status === 'reconnecting' ? 'spin' : ''} size={17} />
      <span>{content.text}</span>
    </div>
  );
}
