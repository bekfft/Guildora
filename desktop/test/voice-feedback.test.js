const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const clientRoot = path.resolve(__dirname, '..', '..', 'client', 'src');
const voiceContext = fs.readFileSync(path.join(clientRoot, 'context', 'VoiceContext.jsx'), 'utf8');
const voiceFeedback = fs.readFileSync(path.join(clientRoot, 'lib', 'voiceFeedback.js'), 'utf8');

test('Voice-Aktivität wird direkt am Audiotrack gemessen', () => {
  assert.match(voiceContext, /createImmediateVoiceAnalyser/);
  assert.match(voiceContext, /requestAnimationFrame\(measure\)/);
  assert.match(voiceContext, /fastSpeakingIdsRef/);
  assert.match(voiceContext, /voiceActivityThreshold\(settings\?\.voice_sensitivity\)/);
  assert.match(voiceContext, /}, 140\)/);
  assert.match(voiceFeedback, /createMediaStreamSource\(new MediaStream\(\[mediaStreamTrack\]\)\)/);
});

test('Voice-Beitritt und echtes Verlassen spielen unterschiedliche Signale', () => {
  assert.match(voiceContext, /primeVoiceFeedback\(\)/);
  assert.match(voiceContext, /playVoiceFeedback\('join'\)/);
  assert.match(voiceContext, /playVoiceFeedback\('leave'\)/);
  assert.match(voiceContext, /leave\(\{ withSound: false \}\)/);
  assert.match(voiceFeedback, /kind === 'leave' \? \[523\.25, 392\] : \[392, 523\.25\]/);
});

test('Höhere Empfindlichkeit senkt die direkte Aktivitätsschwelle', async () => {
  const module = await import(pathToFileURL(path.join(clientRoot, 'lib', 'voiceFeedback.js')));
  assert.ok(module.voiceActivityThreshold(100) < module.voiceActivityThreshold(50));
  assert.ok(module.voiceActivityThreshold(50) < module.voiceActivityThreshold(0));
});
