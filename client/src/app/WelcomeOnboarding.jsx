import { Headphones, Server, UserPlus, X } from 'lucide-react';
import { useEffect, useState } from 'react';

export default function WelcomeOnboarding({ user, onFindFriends, onCreateServer }) {
  const storageKey = `guildora:onboarding:${user.id}:v1`;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const accountAge = Date.now() - new Date(user.created_at).getTime();
    if (Number.isFinite(accountAge) && accountAge < 14 * 24 * 60 * 60 * 1000 && !localStorage.getItem(storageKey)) {
      setVisible(true);
    }
  }, [storageKey, user.created_at]);

  function finish(action) {
    localStorage.setItem(storageKey, 'done');
    setVisible(false);
    action?.();
  }

  if (!visible) return null;

  return (
    <aside className="welcome-onboarding" aria-labelledby="welcome-onboarding-title">
      <button className="welcome-onboarding__close" type="button" onClick={() => finish()} aria-label="Einführung schließen"><X size={18} /></button>
      <div className="welcome-onboarding__copy">
        <small>DEIN START</small>
        <h2 id="welcome-onboarding-title">Willkommen bei Guildora, {user.display_name || user.username}!</h2>
        <p>Du kannst direkt Freunde finden, deinen ersten Server erstellen oder einem Voice-Channel beitreten.</p>
      </div>
      <div className="welcome-onboarding__actions">
        <button type="button" onClick={() => finish(onFindFriends)}><UserPlus size={19} /><span><strong>Freunde finden</strong><small>Per Nutzername verbinden</small></span></button>
        <button type="button" onClick={() => finish(onCreateServer)}><Server size={19} /><span><strong>Server erstellen</strong><small>Deinen Raum einrichten</small></span></button>
        <div><Headphones size={19} /><span><strong>Voice beitreten</strong><small>Voice-Channel antippen</small></span></div>
      </div>
    </aside>
  );
}
