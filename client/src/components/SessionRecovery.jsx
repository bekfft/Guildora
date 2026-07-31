export default function SessionRecovery({ loading = false, onRetry }) {
  return (
    <main className="route-loader" aria-live="polite">
      {loading ? (
        <span className="spinner spinner--large" aria-label="Sitzung wird geladen" />
      ) : (
        <section className="session-recovery">
          <span className="spinner spinner--large" aria-hidden="true" />
          <h1>Verbindung wird wiederhergestellt</h1>
          <p>Du bleibst angemeldet. Guildora versucht automatisch, deine Sitzung wieder zu laden.</p>
          <button type="button" onClick={onRetry}>Jetzt erneut versuchen</button>
        </section>
      )}
    </main>
  );
}
