import {
  AlertTriangle,
  Camera,
  MonitorUp,
  Headphones,
  PhoneOff,
  Settings2,
  Volume2
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

const STATUS_LABELS = {
  connecting: 'Voice wird verbunden …',
  connected: 'Voice verbunden',
  reconnecting: 'Verbindung wird erneuert …',
  error: 'Voice-Verbindung getrennt'
};

export default function VoicePanel({ voice, onToast }) {
  const [devicesOpen, setDevicesOpen] = useState(false);
  const panelRef = useRef(null);

  useEffect(() => {
    if (!devicesOpen) return undefined;
    voice.refreshDevices(false).catch(() => {});
    const close = (event) => {
      if (event.key === 'Escape') setDevicesOpen(false);
      if (event.type === 'pointerdown' && !panelRef.current?.contains(event.target)) setDevicesOpen(false);
    };
    document.addEventListener('keydown', close);
    document.addEventListener('pointerdown', close);
    return () => {
      document.removeEventListener('keydown', close);
      document.removeEventListener('pointerdown', close);
    };
  }, [devicesOpen, voice.refreshDevices]);

  async function selectDevice(kind, value) {
    try {
      if (kind === 'input') await voice.selectInputDevice(value);
      else await voice.selectOutputDevice(value);
    } catch (error) {
      onToast(error.message, 'error');
    }
  }

  return (
    <section className={`voice-panel voice-panel--${voice.connectionState}`}>
      <div className="voice-panel__main">
        <span className="voice-panel__signal"><Volume2 size={18} /></span>
        <div>
          <strong>{STATUS_LABELS[voice.connectionState] || 'Voice'}</strong>
          <span>{voice.channel?.name}{voice.channel?.guild_name ? ` · ${voice.channel.guild_name}` : ''}</span>
        </div>
        <button
          className={voice.cameraEnabled ? 'is-active' : ''}
          type="button"
          aria-label={voice.cameraEnabled ? 'Kamera ausschalten' : 'Kamera einschalten'}
          title="Kamera"
          onClick={() => voice.toggleCamera().catch((error) => onToast(error.message, 'error'))}
        >
          <Camera size={17} />
        </button>
        <button
          className={voice.screenShareEnabled ? 'is-active' : ''}
          type="button"
          aria-label={voice.screenShareEnabled ? 'Bildschirmfreigabe beenden' : 'Bildschirm teilen'}
          title="Bildschirm teilen"
          onClick={() => voice.toggleScreenShare().catch((error) => onToast(error.message, 'error'))}
        >
          <MonitorUp size={17} />
        </button>
        <button
          type="button"
          aria-label="Audiogeräte einstellen"
          title="Audiogeräte"
          onClick={() => setDevicesOpen((current) => !current)}
        >
          <Settings2 size={17} />
        </button>
        <button
          className="voice-panel__disconnect"
          type="button"
          aria-label="Voice-Verbindung trennen"
          title="Verbindung trennen"
          onClick={() => voice.leave()}
        >
          <PhoneOff size={17} />
        </button>
      </div>

      {voice.needsAudioStart && (
        <button className="voice-panel__audio-start" type="button" onClick={() => voice.startAudio().catch((error) => onToast(error.message, 'error'))}>
          <Headphones size={15} /> Audio wiedergeben
        </button>
      )}
      {voice.lastError && (
        <div className="voice-panel__error"><AlertTriangle size={14} /><span>{voice.lastError}</span></div>
      )}

      {devicesOpen && (
        <div className="voice-device-panel" role="dialog" aria-label="Audiogeräte" ref={panelRef}>
          <header>
            <div><Settings2 size={17} /><strong>Audiogeräte</strong></div>
            <span>Änderungen werden gespeichert.</span>
          </header>
          <label>
            <span>Mikrofon</span>
            <select
              value={voice.inputDeviceId}
              onChange={(event) => selectDevice('input', event.target.value)}
              disabled={!voice.inputs.length}
            >
              {!voice.inputs.length && <option value="">Kein Mikrofon gefunden</option>}
              {voice.inputs.length > 0 && <option value="">Systemstandard</option>}
              {voice.inputs.map((device) => <option value={device.id} key={device.id}>{device.label}</option>)}
            </select>
          </label>
          <label>
            <span>Lautsprecher</span>
            <select
              value={voice.outputDeviceId}
              onChange={(event) => selectDevice('output', event.target.value)}
              disabled={!voice.outputs.length}
            >
              {!voice.outputs.length && <option value="">Systemstandard</option>}
              {voice.outputs.length > 0 && <option value="">Systemstandard</option>}
              {voice.outputs.map((device) => <option value={device.id} key={device.id}>{device.label}</option>)}
            </select>
          </label>
          {!voice.outputs.length && (
            <small>Die Lautsprecherauswahl ist in manchen Browsern nicht verfügbar. Dann gilt das Windows-Standardgerät.</small>
          )}
        </div>
      )}
    </section>
  );
}
