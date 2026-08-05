import AppBootScreen from './AppBootScreen.jsx';

export default function SessionRecovery({ loading = false, onRetry }) {
  if (loading) return <AppBootScreen message="Sitzung wird geladen" detail="Dein sicherer Guildora-Zugang wird wiederhergestellt." />;

  return (
    <main className="route-loader" aria-live="polite">
      <section className="session-recovery">
        <span className="spinner spinner--large" aria-hidden="true" />
        <h1>Verbindung wird wiederhergestellt</h1>
        <p>Du bleibst angemeldet. Guildora versucht automatisch, deine Sitzung wieder zu laden.</p>
        <button type="button" onClick={onRetry}>Jetzt erneut versuchen</button>
      </section>
    </main>
  );
}
