import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import BrandLogo from '../components/BrandLogo.jsx';

export default function PlaceholderPage({ title }) {
  return (
    <main className="placeholder-page">
      <Link className="auth-brand" to="/"><BrandLogo decorative /> Guildora</Link>
      <section>
        <p className="eyebrow">In Vorbereitung</p>
        <h1>{title}</h1>
        <p>Diese Seite wird in einer späteren Phase ergänzt.</p>
        <Link className="button button--primary" to="/"><ArrowLeft size={18} /> Zurück zur Startseite</Link>
      </section>
    </main>
  );
}
