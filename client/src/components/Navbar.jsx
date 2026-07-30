import { Menu, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import BrandLogo from './BrandLogo.jsx';

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const { user } = useAuth();

  return (
    <header className={`navbar ${open ? 'navbar--open' : ''}`}>
      <Link className="brand" to="/" aria-label="Guildora Startseite">
        <span className="brand__mark"><BrandLogo decorative /></span>
        <span>Guildora</span>
      </Link>
      <nav className="navbar__links" aria-label="Hauptnavigation">
        <Link to="/download">Download</Link>
        <Link to="/#features">Entdecken</Link>
        <Link to="/#support">Support</Link>
      </nav>
      <Link className="navbar__action" to={user ? '/app' : '/login'}>
        {user ? 'App öffnen' : 'Anmelden'}
      </Link>
      <button
        className="navbar__menu"
        type="button"
        aria-label={open ? 'Menü schließen' : 'Menü öffnen'}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {open ? <X /> : <Menu />}
      </button>
    </header>
  );
}
