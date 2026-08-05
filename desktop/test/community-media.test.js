const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repositoryRoot = path.resolve(__dirname, '..', '..');
const channelView = fs.readFileSync(path.join(repositoryRoot, 'client', 'src', 'app', 'ChannelView.jsx'), 'utf8');
const directMessageView = fs.readFileSync(path.join(repositoryRoot, 'client', 'src', 'app', 'DirectMessageView.jsx'), 'utf8');
const linkPreviewService = fs.readFileSync(path.join(repositoryRoot, 'server', 'src', 'services', 'linkPreviewService.js'), 'utf8');
const attachmentView = fs.readFileSync(path.join(repositoryRoot, 'client', 'src', 'app', 'MessageAttachment.jsx'), 'utf8');

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

test('Bild- und Dateianhänge teilen sich Vorschau, Lightbox und Download in allen Chats', () => {
  assert.match(channelView, /<MessageAttachment attachment=\{attachment\}/);
  assert.match(directMessageView, /<MessageAttachment attachment=\{attachment\}/);
  assert.match(channelView, /<PendingAttachments files=\{pendingFiles\}/);
  assert.match(directMessageView, /<PendingAttachments files=\{pendingFiles\}/);
  assert.match(attachmentView, /role="dialog" aria-modal="true" aria-label=\{`Bildvorschau/);
  assert.match(attachmentView, /download=1/);
  assert.match(attachmentView, /MAX_ATTACHMENT_COUNT = 5/);
  assert.match(attachmentView, /MAX_ATTACHMENT_BYTES = 10 \* 1024 \* 1024/);
});
