import { Clock3, LoaderCircle, MessageCircleMore, ShieldCheck, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import Button from '../components/Button.jsx';
import BrandLogo from '../components/BrandLogo.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../lib/api.js';

function inviteStatus(invite) {
  if (invite?.is_expired) return 'Diese Einladung ist abgelaufen.';
  if (invite?.is_exhausted) return 'Diese Einladung hat ihr Nutzungslimit erreicht.';
  return '';
}

export default function InvitePage() {
  const { code } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [invite, setInvite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    api.invite(code)
      .then((result) => {
        if (active) setInvite(result.invite);
      })
      .catch((requestError) => {
        if (active) setError(requestError.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [code]);

  async function join() {
    if (!user || joining || !invite?.is_active) return;
    setJoining(true);
    setError('');
    try {
      const result = await api.joinInvite(code);
      const destination = result.channel
        ? `/app/channels/${result.guild.id}/${result.channel.id}`
        : `/app/channels/${result.guild.id}`;
      navigate(destination, { replace: true });
    } catch (requestError) {
      setError(requestError.message);
      try {
        const result = await api.invite(code);
        setInvite(result.invite);
      } catch {
        // Die konkrete Fehlermeldung der Beitrittsanfrage bleibt sichtbar.
      }
    } finally {
      setJoining(false);
    }
  }

  const returnState = { from: { pathname: location.pathname } };
  const status = inviteStatus(invite);

  return (
    <main className="invite-shell">
      <Link className="auth-brand" to="/">
        <BrandLogo decorative />
        Guildora
      </Link>

      <section className="invite-card" aria-live="polite">
        {loading ? (
          <div className="invite-loading"><LoaderCircle className="spin" size={32} /><span>Einladung wird geladen …</span></div>
        ) : invite ? (
          <>
            <span className="invite-eyebrow">Du wurdest eingeladen</span>
            <div className="invite-server-icon">
              {invite.guild.icon_url
                ? <img src={invite.guild.icon_url} alt="" />
                : invite.guild.name.slice(0, 2).toUpperCase()}
            </div>
            <h1>{invite.guild.name}</h1>
            <p className="invite-description">
              {invite.guild.description || 'Tritt dem Server bei und werde Teil der Community.'}
            </p>
            <div className="invite-meta">
              <span><Users size={16} /> {invite.guild.member_count} Mitglied{invite.guild.member_count === 1 ? '' : 'er'}</span>
              <span><ShieldCheck size={16} /> Sicher über Guildora</span>
              {invite.expires_at && <span><Clock3 size={16} /> Zeitlich begrenzt</span>}
            </div>

            {(error || status) && <div className="form-alert" role="alert">{error || status}</div>}

            {!authLoading && user ? (
              <Button className="button--full invite-action" loading={joining} disabled={!invite.is_active} onClick={join}>
                {invite.is_active ? 'Einladung annehmen' : 'Einladung nicht verfügbar'}
              </Button>
            ) : (
              <div className="invite-auth-actions">
                <Link className="button invite-login-button" to="/login" state={returnState}>Anmelden und beitreten</Link>
                <Link className="invite-register-link" to="/register" state={returnState}>Neuen Account erstellen</Link>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="invite-server-icon invite-server-icon--invalid"><MessageCircleMore size={30} /></div>
            <h1>Einladung nicht gefunden</h1>
            <p className="invite-description">{error || 'Dieser Link ist ungültig oder wurde gelöscht.'}</p>
            <Link className="button invite-login-button" to="/">Zur Startseite</Link>
          </>
        )}
      </section>
    </main>
  );
}
