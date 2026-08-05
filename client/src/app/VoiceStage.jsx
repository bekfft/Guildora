import { Maximize2, MonitorUp, Video, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

function TrackVideo({ stream }) {
  const videoRef = useRef(null);
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream.track) return undefined;
    stream.track.attach(video);
    return () => stream.track.detach(video);
  }, [stream.track]);
  return <video ref={videoRef} autoPlay playsInline muted={stream.is_local} />;
}

export default function VoiceStage({ voice }) {
  const [expanded, setExpanded] = useState(null);
  if (!voice.videoStreams.length) return null;
  const visible = expanded
    ? voice.videoStreams.filter((stream) => stream.key === expanded)
    : voice.videoStreams;
  return (
    <section className={`voice-stage${expanded ? ' is-expanded' : ''}`} aria-label="Voice-Video und Bildschirmübertragung">
      <header>
        <span><MonitorUp size={17} /><strong>Live im Voice-Chat</strong></span>
        {expanded && <button type="button" onClick={() => setExpanded(null)} aria-label="Raster anzeigen"><X size={17} /></button>}
      </header>
      <div className="voice-stage__grid">
        {visible.map((stream) => (
          <article className={stream.source === 'screen_share' ? 'is-screen-share' : ''} key={stream.key}>
            <TrackVideo stream={stream} />
            <footer>
              <span>{stream.source === 'screen_share' ? <MonitorUp size={14} /> : <Video size={14} />} {stream.name}{stream.is_local ? ' (Du)' : ''}</span>
              <span>
                <button type="button" onClick={() => setExpanded(stream.key)} aria-label={`${stream.name} groß anzeigen`}><Maximize2 size={14} /></button>
                {stream.is_local && stream.source === 'screen_share' && (
                  <button type="button" onClick={voice.toggleScreenShare} aria-label="Bildschirmübertragung beenden"><X size={14} /></button>
                )}
              </span>
            </footer>
          </article>
        ))}
      </div>
    </section>
  );
}
