import { ArrowRight, Github, Instagram, Linkedin, Youtube } from 'lucide-react';
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import FeatureIllustration from '../components/FeatureIllustration.jsx';
import BrandLogo from '../components/BrandLogo.jsx';
import Navbar from '../components/Navbar.jsx';
import ReleaseDownloadButton from '../components/ReleaseDownloadButton.jsx';

const FEATURES = [
  {
    type: 'friends',
    title: 'Alles, was eure Gruppe zusammenbringt',
    text: 'Organisiert Freunde, Teams und Communities in übersichtlichen Servern. Mit frei benennbaren Channels, Rollen und Direktnachrichten findet jede Unterhaltung sofort ihren Platz.'
  },
  {
    type: 'voice',
    title: 'Im Gespräch, ohne aus dem Spiel zu fliegen',
    text: 'Wechselt direkt zwischen Text, Voice und Video, teilt euren Bildschirm und bleibt auch in langen Sessions verbunden. Guildora arbeitet dabei bewusst ressourcenschonend im Hintergrund.'
  },
  {
    type: 'community',
    title: 'Eure Community. Eure Regeln.',
    text: 'Gestaltet Rollen, Channel-Berechtigungen und Moderation so, wie es zu euch passt. Meldungen, Audit-Logs und klare Werkzeuge sorgen für Ordnung, ohne im Weg zu stehen.'
  }
];

function HeroArt() {
  return (
    <div className="hero-brand-visual" aria-hidden="true">
      <img className="hero-brand-visual__backdrop" src="/assets/guildora-official-banner.png" alt="" />
      <div className="hero-brand-visual__glass">
        <BrandLogo decorative />
        <span>Chats, Voice und Communities an einem Ort</span>
      </div>
    </div>
  );
}

export default function LandingPage() {
  useEffect(() => {
    const sections = document.querySelectorAll('[data-reveal]');
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      sections.forEach((section) => section.classList.add('is-visible'));
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      }),
      { threshold: 0.16 }
    );
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="landing">
      <section className="hero">
        <Navbar />
        <div className="hero__content">
          <div className="hero__copy">
            <p className="hero__eyebrow">Schnell verbunden. Einfach zusammen.</p>
            <h1>Euer Chat.<br />Eure Stimmen.<br />Euer Guildora.</h1>
            <p className="hero__subtitle">Guildora verbindet Text, Voice, Video und Screen-Sharing in einer schnellen Plattform für Freunde, Gaming-Gruppen, Teams und Communities.</p>
            <div className="hero__actions" id="download">
              <ReleaseDownloadButton large />
            </div>
          </div>
          <HeroArt />
        </div>
        <svg className="hero__wave" viewBox="0 0 1440 120" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 50c158 65 326 75 491 28C701 18 845 5 1010 41c161 35 284 78 430 27v52H0z" fill="#fff" />
        </svg>
      </section>

      <main id="features">
        {FEATURES.map((feature, index) => (
          <section className={`feature ${index % 2 ? 'feature--reverse' : ''}`} key={feature.type} data-reveal>
            <FeatureIllustration type={feature.type} />
            <div className="feature__copy">
              <span className="feature__number">0{index + 1}</span>
              <h2>{feature.title}</h2>
              <p>{feature.text}</p>
            </div>
          </section>
        ))}
      </main>

      <section className="landing-cta" data-reveal>
        <div className="landing-cta__sparkles" aria-hidden="true">✦　·　✧　·　✦</div>
        <h2>Eure nächste Runde beginnt hier.</h2>
        <p>Erstellt kostenlos euren Server und holt eure Leute dazu.</p>
        <Link className="button button--primary button--large" to="/register">Guildora im Browser öffnen <ArrowRight size={20} /></Link>
      </section>

      <footer className="footer" id="support">
        <div className="footer__lead">
          <Link className="brand" to="/"><span className="brand__mark"><BrandLogo decorative /></span>Guildora</Link>
          <label className="language-select">
            <span>Sprache</span>
            <select defaultValue="de"><option value="de">Deutsch</option><option value="en">English</option></select>
          </label>
          <div className="socials">
            <a href="#social" aria-label="Instagram"><Instagram size={20} /></a>
            <a href="#social" aria-label="YouTube"><Youtube size={21} /></a>
            <a href="#social" aria-label="LinkedIn"><Linkedin size={20} /></a>
            <a href="#social" aria-label="GitHub"><Github size={20} /></a>
          </div>
        </div>
        <div className="footer__column"><h3>Produkt</h3><Link to="/download">Download</Link><a href="#features">Entdecken</a><a href="#status">Status</a></div>
        <div className="footer__column"><h3>Unternehmen</h3><a href="#about">Über uns</a><a href="#jobs">Jobs</a><a href="#news">Neuigkeiten</a></div>
        <div className="footer__column"><h3>Ressourcen</h3><a href="#support">Support</a><a href="#guide">Leitfaden</a><a href="#community">Community</a></div>
        <div className="footer__column"><h3>Rechtliches</h3><Link to="/datenschutz">Datenschutz</Link><Link to="/nutzungsbedingungen">Bedingungen</Link><a href="#imprint">Impressum</a></div>
        <div className="footer__bottom">
          <span>© {new Date().getFullYear()} Guildora</span>
          <Link className="navbar__action" to="/register">Registrieren</Link>
        </div>
      </footer>
    </div>
  );
}
