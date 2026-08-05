const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repositoryRoot = path.resolve(__dirname, '..', '..');
const channelView = fs.readFileSync(path.join(repositoryRoot, 'client', 'src', 'app', 'ChannelView.jsx'), 'utf8');
const directMessageView = fs.readFileSync(path.join(repositoryRoot, 'client', 'src', 'app', 'DirectMessageView.jsx'), 'utf8');
const linkPreviewService = fs.readFileSync(path.join(repositoryRoot, 'server', 'src', 'services', 'linkPreviewService.js'), 'utf8');

test('Sprachnachrichten stoppen in Server- und Direktchats nach fünf Minuten sicher', () => {
  for (const source of [channelView, directMessageView]) {
    assert.match(source, /if \(elapsed >= 300000\) \{/);
    assert.match(source, /if \(recorder\.state === 'recording'\) recorder\.stop\(\);/);
    assert.match(source, /durationMs: Math\.min\(300000, pendingVoice\.durationMs\)/);
  }
});

test('Linkvorschauen prüfen Ziele und Weiterleitungen vor dem Abruf', () => {
  assert.match(linkPreviewService, /await dns\.lookup\(url\.hostname/);
  assert.match(linkPreviewService, /addresses\.some\(\(\{ address \}\) => privateAddress\(address\)\)/);
  assert.match(linkPreviewService, /redirect: 'manual'/);
  assert.match(linkPreviewService, /current = await assertPublicUrl\(new URL/);
  assert.match(linkPreviewService, /export function createDmLinkPreview/);
});
