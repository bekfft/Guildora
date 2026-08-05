import { useEffect, useState } from 'react';
import BrandLogo from './BrandLogo.jsx';

const GUILDORA_TIPS = [
  'Mit einem Langdruck auf eine Nachricht öffnest du die mobilen Aktionen.',
  'Server, Direktnachrichten und Voice-Channels bleiben über alle Geräte synchron.',
  'Über die Suche findest du Nachrichten, Erwähnungen und Antworten schneller wieder.',
  'Deine Geräte für Mikrofon, Lautsprecher und Kamera wählst du in den Einstellungen.',
  'Eigene Serverprofile geben jeder Community ihren persönlichen Auftritt.',
  'Guildora informiert dich automatisch, sobald eine neue Version bereitsteht.'
];

export default function AppBootScreen({
  message = 'Guildora wird vorbereitet',
  detail = 'Deine Server und Unterhaltungen werden geladen.',
  complete = false
}) {
  const [tipIndex, setTipIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setTipIndex((current) => (current + 1) % GUILDORA_TIPS.length);
    }, 2_600);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <main className={`app-boot-screen ${complete ? 'is-complete' : ''}`} role="status" aria-live="polite" aria-label={message}>
      <div className="app-boot-screen__ambient" aria-hidden="true"><span /><span /><span /></div>
      <section className="app-boot-screen__card">
        <div className="app-boot-screen__logo" aria-hidden="true">
          <span className="app-boot-screen__orbit" />
          <BrandLogo decorative />
        </div>
        <div className="app-boot-screen__copy">
          <span>GUILDORA</span>
          <h1>{complete ? 'Alles bereit' : message}</h1>
          <p>{complete ? 'Willkommen zurück.' : detail}</p>
        </div>
        <div className="app-boot-screen__progress" aria-hidden="true"><i /></div>
        <div className="app-boot-screen__tip" key={tipIndex}>
          <small>GUT ZU WISSEN</small>
          <p>{GUILDORA_TIPS[tipIndex]}</p>
        </div>
      </section>
    </main>
  );
}
