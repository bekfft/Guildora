const assert = require('node:assert/strict');
const test = require('node:test');
const {
  ActivityBridge,
  SCAN_INTERVAL_MS,
  detectedGame,
  normalizeRpcActivity,
  parseTasklist
} = require('../src/activity');

test('Windows-Spielerkennung ist leichtgewichtig und unterstützt eigene Programme', () => {
  const processes = parseTasklist('"cs2.exe","1234","Console","1","1,024 K"\r\n"MyIndie.exe","9876","Console","1","8,000 K"');
  assert.equal(SCAN_INTERVAL_MS, 15_000);
  assert.equal(detectedGame(processes).name, 'Counter-Strike 2');
  assert.equal(detectedGame(processes, [{ executable: 'MyIndie.exe', name: 'Mein Indie-Spiel' }]).name, 'Mein Indie-Spiel');
});

test('Rich-Presence-RPC normalisiert Aktivitätstypen, Party, Buttons und Join-Secrets', () => {
  const activity = normalizeRpcActivity({
    type: 'streaming',
    name: 'RescueX',
    details: 'Großbrand',
    party: { id: 'einsatz', currentSize: 4, maxSize: 8 },
    buttons: [{ label: 'Website', url: 'https://example.test' }],
    joinSecret: 'secret'
  }, 'app-42');
  assert.equal(activity.type, 'streaming');
  assert.equal(activity.applicationId, 'app-42');
  assert.deepEqual(activity.party, { id: 'einsatz', currentSize: 4, maxSize: 8 });
  assert.equal(activity.buttons.length, 1);
  assert.equal(activity.joinSecret, 'secret');
});

test('Join-Ereignisse werden nur an die passende lokale Integration ausgeliefert', () => {
  const bridge = new ActivityBridge({ platform: 'test' });
  const writes = [];
  const socket = { write: (value) => writes.push(JSON.parse(value)), destroy() {} };
  bridge.rpcActivities.set(socket, { sequence: 1, activity: { applicationId: 'app-42' } });
  assert.equal(bridge.sendJoin({ applicationId: 'other', joinSecret: 'no' }), false);
  assert.equal(bridge.sendJoin({ applicationId: 'app-42', joinSecret: 'lobby-token' }), true);
  assert.deepEqual(writes[0], { event: 'ACTIVITY_JOIN', secret: 'lobby-token' });
});

test('Renderer und Desktop verdrahten Datenschutz, Heartbeat und Mitgliederanzeige', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.resolve(__dirname, '../..');
  const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
  assert.match(read('client/src/context/AuthContext.jsx'), /45_000/);
  assert.match(read('client/src/app/MemberList.jsx'), /activityHeadline\(member\.activity\)/);
  assert.match(read('client/src/app/SettingsModal.jsx'), /Aktivitätsstatus/);
  assert.match(read('desktop/src/preload.js'), /listActivityProcesses/);
});
