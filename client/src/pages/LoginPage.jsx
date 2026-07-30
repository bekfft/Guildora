import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import Button from '../components/Button.jsx';
import BrandLogo from '../components/BrandLogo.jsx';
import TextField from '../components/TextField.jsx';
import { useAuth } from '../context/AuthContext.jsx';

export default function LoginPage() {
  const { user, loading: authLoading, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ identifier: '', password: '' });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  const destination = location.state?.from?.pathname || '/app';

  if (!authLoading && user) return <Navigate to={destination} replace />;

  async function handleSubmit(event) {
    event.preventDefault();
    const nextErrors = {};
    if (!form.identifier.trim()) nextErrors.identifier = 'Bitte fülle dieses Feld aus.';
    if (!form.password) nextErrors.password = 'Bitte fülle dieses Feld aus.';
    if (Object.keys(nextErrors).length) return setErrors(nextErrors);

    setLoading(true);
    setErrors({});
    try {
      await login(form);
      navigate(destination, { replace: true });
    } catch (error) {
      setErrors(error.field ? { [error.field]: error.message } : { general: error.message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-shell">
      <Link className="auth-brand" to="/">
        <BrandLogo decorative />
        Guildora
      </Link>
      <section className="auth-card" aria-labelledby="login-title">
        <div className="auth-card__header">
          <h1 id="login-title">Willkommen zurück!</h1>
          <p>Schön, dich wiederzusehen!</p>
        </div>
        {errors.general && <div className="form-alert" role="alert">{errors.general}</div>}
        <form onSubmit={handleSubmit} noValidate>
          <TextField
            id="identifier"
            label="E-Mail oder Benutzername"
            autoComplete="username"
            value={form.identifier}
            error={errors.identifier}
            onChange={(event) => setForm({ ...form, identifier: event.target.value })}
          />
          <TextField
            id="password"
            label="Passwort"
            type="password"
            autoComplete="current-password"
            value={form.password}
            error={errors.password}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
          />
          <Link className="form-link form-link--small" to="/passwort-vergessen">Passwort vergessen?</Link>
          <Button className="button--full auth-submit" loading={loading} type="submit">Anmelden</Button>
        </form>
        <p className="auth-switch">Du brauchst einen Account? <Link to="/register" state={location.state}>Registrieren</Link></p>
      </section>
    </main>
  );
}
