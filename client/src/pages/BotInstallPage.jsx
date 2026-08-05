import { Bot, Check, ChevronDown, LoaderCircle, LockKeyhole, Server, ShieldCheck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Button from '../components/Button.jsx';
import { api } from '../lib/api.js';
import '../styles/bot-install.css';

export default function BotInstallPage() {
  const { appId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [guildId, setGuildId] = useState('');
  const [scopes, setScopes] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    api.developerInstallInfo(appId).then((result) => {
      setData(result);
      setGuildId(result.guilds[0]?.id || '');
      setScopes(result.app.default_scopes);
    }).catch((requestError) => setError(requestError.message));
  }, [appId]);

  const selectedGuild = useMemo(() => data?.guilds.find((guild) => guild.id === guildId), [data, guildId]);

  async function authorize() {
    if (!guildId || !scopes.length || busy) return;
    setBusy(true);
    setError('');
    try {
      await api.authorizeDeveloperApp(appId, { guildId, scopes });
      setInstalled(true);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  if (!data && !error) return <main className="bot-auth-page"><LoaderCircle className="spin" size={28} /><p>Bot-Autorisierung wird geladen …</p></main>;
  if (!data) return <main className="bot-auth-page"><section className="bot-auth-card"><Bot size={42} /><h1>Bot nicht verfügbar</h1><p>{error}</p><Link to="/app">Zurück zu Guildora</Link></section></main>;

  return (
    <main className="bot-auth-page">
      <section className="bot-auth-card">
        <header className="bot-auth-app">
          <span><Bot size={34} /></span>
          <div><small>BOT ZU SERVER HINZUFÜGEN</small><h1>{data.app.name}</h1><p>{data.app.description || 'Guildora Bot-Anwendung'}</p></div>
        </header>
        {installed ? (
          <div className="bot-auth-success"><span><Check size={30} /></span><h2>Bot autorisiert</h2><p><strong>{data.app.name}</strong> wurde zu <strong>{selectedGuild?.name}</strong> hinzugefügt.</p><Button variant="primary" onClick={() => navigate(`/app/channels/${guildId}`)}>Server öffnen</Button></div>
        ) : (
          <>
            <label className="bot-auth-select"><span><Server size={17} /> Zu Server hinzufügen</span><div><select value={guildId} onChange={(event) => setGuildId(event.target.value)}><option value="">Server auswählen</option>{data.guilds.map((guild) => <option value={guild.id} key={guild.id}>{guild.name}</option>)}</select><ChevronDown size={18} /></div><small>Es werden nur Server angezeigt, die du verwalten darfst.</small></label>
            <div className="bot-auth-permissions"><h2><ShieldCheck size={19} /> Berechtigungen</h2>{data.scopes.map((scope) => <label key={scope.id}><span><strong>{scope.name}</strong><small>{scope.description}</small></span><input type="checkbox" checked={scopes.includes(scope.id)} onChange={(event) => setScopes(event.target.checked ? [...scopes, scope.id] : scopes.filter((item) => item !== scope.id))} /></label>)}</div>
            {error && <p className="bot-auth-error">{error}</p>}
            {!data.guilds.length && <p className="bot-auth-error">Du verwaltest noch keinen Server, auf dem dieser Bot installiert werden kann.</p>}
            <footer><span><LockKeyhole size={16} /> Der Bot erhält nur die ausgewählten Rechte.</span><Button variant="primary" disabled={!guildId || !scopes.length || busy} onClick={authorize}>{busy ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />} Autorisieren</Button></footer>
          </>
        )}
      </section>
    </main>
  );
}
