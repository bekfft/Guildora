const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const clientRoot = path.resolve(__dirname, '..', '..', 'client', 'src');
const context = fs.readFileSync(path.join(clientRoot, 'context', 'VoiceContext.jsx'), 'utf8');
const stage = fs.readFileSync(path.join(clientRoot, 'app', 'VoiceStage.jsx'), 'utf8');
const sidebar = fs.readFileSync(path.join(clientRoot, 'app', 'ChannelSidebar.jsx'), 'utf8');
const css = fs.readFileSync(path.join(clientRoot, 'styles', 'app.css'), 'utf8');

test('Bildschirmübertragung verwaltet lokale und fremde LiveKit-Tracks', () => {
  assert.match(context, /RoomEvent\.TrackSubscribed/);
  assert.match(context, /RoomEvent\.TrackUnsubscribed/);
  assert.match(context, /RoomEvent\.LocalTrackPublished/);
  assert.match(context, /RoomEvent\.LocalTrackUnpublished/);
  assert.match(context, /registerVideoTrack/);
  assert.match(context, /setScreenShareEnabled\(next, \{ audio: true \}\)/);
  assert.match(context, /NotAllowedError/);
  assert.match(context, /videoStreams/);
});

test('Voice-Stage ist bedienbar, maximierbar und mobil sicher', () => {
  assert.match(stage, /track\.attach\(video\)/);
  assert.match(stage, /track\.detach\(video\)/);
  assert.match(stage, /Bildschirmübertragung beenden/);
  assert.match(stage, /is-expanded/);
  assert.match(sidebar, /is_screen_sharing/);
  assert.match(css, /\.voice-stage\.is-expanded/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /max-height: 68dvh/);
});

test('sichtbare Voice-Channels zeigen ihre Teilnehmer auch ohne eigenen Beitritt', () => {
  assert.match(sidebar, /guildVoiceParticipants/);
  assert.match(sidebar, /voicePresence\[channel\.id\]/);
  assert.match(sidebar, /connectedHere \? voice\.participants : presence/);
  assert.match(sidebar, /document\.visibilityState === 'hidden'/);
});

test('Entwicklerbereich darf auf iPhone nicht durch Codeblöcke verbreitert werden', () => {
  assert.match(css, /\.developer-settings \{ min-width: 0;/);
  assert.match(css, /\.developer-settings > \* \{ min-width: 0;/);
  assert.match(css, /\.developer-docs pre \{[^}]*white-space: pre-wrap;[^}]*overflow-wrap: anywhere;/);
});
