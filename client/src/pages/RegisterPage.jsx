import { useMemo, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import Button from '../components/Button.jsx';
import BrandLogo from '../components/BrandLogo.jsx';
import SessionRecovery from '../components/SessionRecovery.jsx';
import TextField from '../components/TextField.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 100 }, (_, index) => currentYear - index);

function validateField(name, value) {
  if (name === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'Bitte gib eine gültige E-Mail-Adresse ein.';
  if (name === 'username' && !/^[a-z0-9._]{2,32}$/i.test(value)) return '2–32 Zeichen; nur Buchstaben, Zahlen, Punkte und Unterstriche.';
  if (name === 'password' && (value.length < 8 || !/[A-Za-zÄÖÜäöüß]/.test(value) || !/\d/.test(value))) {
    return 'Mindestens 8 Zeichen mit einem Buchstaben und einer Zahl.';
  }
  return '';
}

function passwordStrength(password) {
  if (!password) return { level: 0, label: '' };
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  if (score <= 2) return { level: 1, label: 'Schwach' };
  if (score <= 4) return { level: 2, label: 'Mittel' };
  return { level: 3, label: 'Stark' };
}

export default function RegisterPage() {
  const {
    user,
    loading: authLoading,
    sessionUnavailable,
    restoreSession,
    register
  } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({
    email: '', username: '', password: '',
    day: '', month: '', year: '', newsletter: false
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const strength = useMemo(() => passwordStrength(form.password), [form.password]);
  const complete = form.email && form.username && form.password && form.day && form.month && form.year;

  const destination = location.state?.from?.pathname || '/app';

  if (authLoading || sessionUnavailable) {
    return <SessionRecovery loading={authLoading} onRetry={restoreSession} />;
  }
  if (!authLoading && user) return <Navigate to={destination} replace />;

  function update(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
    if (errors[name]) setErrors((current) => ({ ...current, [name]: '' }));
  }

  function handleBlur(event) {
    const message = validateField(event.target.name, event.target.value);
    if (message) setErrors((current) => ({ ...current, [event.target.name]: message }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const nextErrors = {};
    for (const name of ['email', 'username', 'password']) {
      const message = validateField(name, form[name]);
      if (message) nextErrors[name] = message;
    }
    if (!form.day || !form.month || !form.year) nextErrors.birthdate = 'Bitte gib dein vollständiges Geburtsdatum an.';
    if (Object.keys(nextErrors).length) return setErrors(nextErrors);

    setLoading(true);
    setErrors({});
    try {
      await register({
        email: form.email,
        username: form.username,
        password: form.password,
        birthdate: `${form.year}-${form.month.padStart(2, '0')}-${form.day.padStart(2, '0')}`,
        newsletter: form.newsletter
      });
      navigate(destination, { replace: true });
    } catch (error) {
      setErrors(error.field ? { [error.field]: error.message } : { general: error.message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-shell auth-shell--register">
      <Link className="auth-brand" to="/">
        <BrandLogo decorative />
        Guildora
      </Link>
      <section className="auth-card auth-card--register" aria-labelledby="register-title">
        <div className="auth-card__header">
          <h1 id="register-title">Erstelle deinen Account</h1>
          <p>Dein neuer Treffpunkt ist nur einen Moment entfernt.</p>
        </div>
        {errors.general && <div className="form-alert" role="alert">{errors.general}</div>}
        <form onSubmit={handleSubmit} noValidate>
          <TextField id="email" name="email" label="E-Mail" type="email" autoComplete="email" value={form.email} error={errors.email} onChange={(e) => update('email', e.target.value)} onBlur={handleBlur} />
          <TextField id="username" name="username" label="Benutzername" hint="Nur a–z, 0–9, Punkt und Unterstrich." autoComplete="username" value={form.username} error={errors.username} onChange={(e) => update('username', e.target.value.toLowerCase())} onBlur={handleBlur} />
          <TextField id="password" name="password" label="Passwort" type="password" autoComplete="new-password" value={form.password} error={errors.password} onChange={(e) => update('password', e.target.value)} onBlur={handleBlur} />
          <div className={`password-strength password-strength--${strength.level}`} aria-live="polite">
            <div className="password-strength__bars"><span /><span /><span /></div>
            {strength.label && <span>{strength.label}</span>}
          </div>
          <fieldset className={`birthday ${errors.birthdate ? 'birthday--error' : ''}`}>
            <legend>Geburtsdatum</legend>
            <div className="birthday__selects">
              <label><span>Tag</span><select value={form.day} onChange={(e) => update('day', e.target.value)} aria-invalid={Boolean(errors.birthdate)}><option value="">Tag</option>{Array.from({ length: 31 }, (_, i) => <option key={i + 1}>{i + 1}</option>)}</select></label>
              <label><span>Monat</span><select value={form.month} onChange={(e) => update('month', e.target.value)} aria-invalid={Boolean(errors.birthdate)}><option value="">Monat</option>{MONTHS.map((month, i) => <option value={i + 1} key={month}>{month}</option>)}</select></label>
              <label><span>Jahr</span><select value={form.year} onChange={(e) => update('year', e.target.value)} aria-invalid={Boolean(errors.birthdate)}><option value="">Jahr</option>{YEARS.map((year) => <option key={year}>{year}</option>)}</select></label>
            </div>
            {errors.birthdate && <span className="field__error" role="alert">{errors.birthdate}</span>}
          </fieldset>
          <label className="checkbox">
            <input type="checkbox" checked={form.newsletter} onChange={(e) => update('newsletter', e.target.checked)} />
            <span>Ich möchte gelegentlich Neuigkeiten zu Guildora erhalten.</span>
          </label>
          <Button className="button--full auth-submit" loading={loading} disabled={!complete} type="submit">Weiter</Button>
        </form>
        <p className="legal-copy">Mit deiner Registrierung akzeptierst du unsere <Link to="/nutzungsbedingungen">Nutzungsbedingungen</Link> und <Link to="/datenschutz">Datenschutzerklärung</Link>.</p>
        <p className="auth-switch">Bereits registriert? <Link to="/login" state={location.state}>Anmelden</Link></p>
      </section>
    </main>
  );
}
