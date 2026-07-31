const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const clientRoot = path.resolve(__dirname, '..', '..', 'client', 'src');
const mediaDevicesPath = path.join(clientRoot, 'lib', 'mediaDevices.js');
const voiceContext = fs.readFileSync(
  path.join(clientRoot, 'context', 'VoiceContext.jsx'),
  'utf8'
);
const voicePanel = fs.readFileSync(
  path.join(clientRoot, 'app', 'VoicePanel.jsx'),
  'utf8'
);

test('Windows-Aliase werden zu einem echten Audiogerät zusammengeführt', async () => {
  const {
    resolveAudioDeviceId,
    uniqueAudioDevices
  } = await import(pathToFileURL(mediaDevicesPath));
  const devices = [
    {
      deviceId: 'default',
      groupId: 'headset',
      kind: 'audioinput',
      label: 'Default - Mikrofon (Stealth 600PC Gen 3)'
    },
    {
      deviceId: 'communications',
      groupId: 'headset',
      kind: 'audioinput',
      label: 'Communications - Mikrofon (Stealth 600PC Gen 3)'
    },
    {
      deviceId: 'physical-headset',
      groupId: 'headset',
      kind: 'audioinput',
      label: 'Mikrofon (Stealth 600PC Gen 3)'
    }
  ];

  const visible = uniqueAudioDevices(devices, 'Mikrofon');
  assert.deepEqual(visible, [{
    id: 'physical-headset',
    kind: 'audioinput',
    groupId: 'headset',
    label: 'Mikrofon (Stealth 600PC Gen 3)'
  }]);
  assert.equal(
    resolveAudioDeviceId('communications', devices, visible),
    'physical-headset'
  );
});

test('Voice-Aufnahme verwendet klare Mono-Sprache mit hoher Opus-Qualität', async () => {
  const { audioCaptureOptions } = await import(pathToFileURL(mediaDevicesPath));
  const capture = audioCaptureOptions({
    voice_auto_gain: true,
    voice_echo_cancellation: true,
    voice_noise_suppression: true
  }, 'physical-headset');

  assert.deepEqual(capture.sampleRate, { ideal: 48_000 });
  assert.deepEqual(capture.channelCount, { ideal: 1 });
  assert.equal(capture.voiceIsolation, true);
  assert.deepEqual(capture.deviceId, { ideal: 'physical-headset' });
  assert.match(voiceContext, /audioPreset:\s*AudioPresets\.musicHighQuality/);
  assert.match(voiceContext, /saveSettings\(\{ voice_input_device: selected \|\| null \}\)/);
  assert.match(voiceContext, /saveSettings\(\{ voice_output_device: selected \|\| null \}\)/);
  assert.match(voicePanel, /<option value="">Systemstandard<\/option>/);
});
