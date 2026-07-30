import { CheckCircle2, Download, LogIn, PackageCheck, RefreshCw } from 'lucide-react';
import Navbar from '../components/Navbar.jsx';
import BrandLogo from '../components/BrandLogo.jsx';
import ReleaseDownloadButton from '../components/ReleaseDownloadButton.jsx';
import useLatestRelease, { formatMegabytes } from '../hooks/useLatestRelease.js';

export default function DownloadPage() {
  const { release } = useLatestRelease();
  const published = release?.publishedAt
    ? new Intl.DateTimeFormat('de-DE', { dateStyle: 'long' }).format(new Date(release.publishedAt))
    : '–';
  return (
    <div className="download-page">
      <div className="download-page__nav"><Navbar /></div>
      <main>
        <section className="download-hero">
          <span className="download-hero__icon"><BrandLogo decorative /></span>
          <p className="eyebrow">Guildora für Windows</p>
          <h1>Deine Gespräche.<br />Direkt auf dem Desktop.</h1>
          <p>Starte Guildora schneller, bleibe angemeldet und erhalte neue Desktop-Versionen automatisch.</p>
          <ReleaseDownloadButton large detailed />
          <div className="download-release-data">
            <span>Version {release?.version || '–'}</span>
            <span>{release ? formatMegabytes(release.windows.sizeBytes) : '–'}</span>
            <span>Veröffentlicht am {published}</span>
          </div>
        </section>

        <section className="download-steps" aria-label="Installation">
          <article><Download /><strong>1. Herunterladen</strong><p>Lade den Installer direkt über GitHub Releases.</p></article>
          <article><PackageCheck /><strong>2. Installieren</strong><p>Wähle deinen Installationsordner. Adminrechte sind nicht nötig.</p></article>
          <article><LogIn /><strong>3. Anmelden</strong><p>Nutze dein bestehendes Guildora-Konto.</p></article>
        </section>

        <section className="download-info">
          <div>
            <RefreshCw />
            <h2>Updates passieren automatisch</h2>
            <p>Guildora lädt neue Desktop-Versionen im Hintergrund und installiert sie still, sobald du die App vollständig beendest.</p>
          </div>
          <div>
            <CheckCircle2 />
            <h2>Systemanforderungen</h2>
            <p>Windows 10 Version 1809 oder neuer, 64 Bit und eine Internetverbindung.</p>
          </div>
        </section>

        <details className="smartscreen-note">
          <summary>Windows warnt vor der Datei?</summary>
          <p>Die erste Guildora-Version ist noch nicht digital signiert. Deshalb kann Windows SmartScreen melden, dass der Herausgeber nicht verifiziert werden konnte. Der Installer wird unverändert über GitHub Releases geladen.</p>
          <p>Wenn du fortfahren möchtest, wähle im Hinweis <strong>„Weitere Informationen“</strong> und anschließend <strong>„Trotzdem ausführen“</strong>.</p>
        </details>
      </main>
    </div>
  );
}
