import { ArrowRight, Download, Globe2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import useLatestRelease, { formatMegabytes } from '../hooks/useLatestRelease.js';

function getPlatform() {
  const value = navigator.userAgentData?.platform || navigator.platform || navigator.userAgent;
  if (/mac/i.test(value)) return 'mac';
  if (/linux/i.test(value)) return 'linux';
  return 'windows';
}

export default function ReleaseDownloadButton({ large = false, detailed = false }) {
  const { loading, release } = useLatestRelease();
  const platform = getPlatform();
  if (platform !== 'windows') {
    return (
      <div className="release-download">
        <div className="release-download__actions">
          <button className={`button release-download__windows ${large ? 'button--large' : ''}`} type="button" disabled>
            Bald für {platform === 'mac' ? 'macOS' : 'Linux'} verfügbar
          </button>
          <Link className={`button release-download__web ${large ? 'button--large' : ''}`} to="/register">
            <Globe2 size={20} /> Im Browser öffnen <ArrowRight size={17} />
          </Link>
        </div>
      </div>
    );
  }
  return (
    <div className="release-download">
      <div className="release-download__actions">
        <a className={`button release-download__windows ${large ? 'button--large' : ''}`} href="/api/download/windows">
          <span className="release-download__button-icon"><Download size={20} /></span>
          <span><strong>Für Windows</strong><small>Desktop-App herunterladen</small></span>
        </a>
        <Link className={`button release-download__web ${large ? 'button--large' : ''}`} to="/register">
          <Globe2 size={20} />
          <span><strong>Im Browser öffnen</strong><small>Ohne Installation starten</small></span>
          <ArrowRight className="release-download__arrow" size={17} />
        </Link>
      </div>
      <small className={`release-download__meta ${loading ? 'is-loading' : ''}`}>
        {loading ? '\u00a0' : release
          ? `Version ${release.version} · ${formatMegabytes(release.windows.sizeBytes)}${detailed ? ' · 64 Bit' : ''}`
          : 'Download ist momentan nicht verfügbar'}
      </small>
    </div>
  );
}
