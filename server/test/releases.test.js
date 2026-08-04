import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, test } from 'node:test';
import { app } from '../src/index.js';
import { clearReleaseCache } from '../src/services/releaseService.js';

const originalFetch = global.fetch;
let server;
let baseUrl;
let githubApiAvailable = true;

before(async () => {
  global.fetch = (input, options) => {
    if (String(input).startsWith('https://api.github.com/')) {
      if (!githubApiAvailable) {
        return Promise.resolve(new Response('rate limited', { status: 403 }));
      }
      return Promise.resolve(new Response(JSON.stringify({
        tag_name: 'desktop-v1.2.3',
        published_at: '2026-07-30T12:00:00Z',
        assets: [{
          name: 'Guildora-Setup-1.2.3.exe',
          size: 78_123_456,
          browser_download_url: 'https://github.com/bekfft/Guildora/releases/download/desktop-v1.2.3/Guildora-Setup-1.2.3.exe'
        }]
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    }
    if (String(input) === 'https://github.com/bekfft/Guildora/releases/latest') {
      return Promise.resolve(new Response(null, {
        status: 302,
        headers: { Location: 'https://github.com/bekfft/Guildora/releases/tag/desktop-v1.2.4' }
      }));
    }
    if (String(input).includes('/releases/expanded_assets/desktop-v1.2.4')) {
      return Promise.resolve(new Response(
        '<a href="/bekfft/Guildora/releases/download/desktop-v1.2.4/Guildora-Setup-1.2.4.exe">Installer</a>',
        { status: 200, headers: { 'Content-Type': 'text/html' } }
      ));
    }
    return originalFetch(input, options);
  };
  clearReleaseCache();
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  global.fetch = originalFetch;
  await new Promise((resolve) => server.close(resolve));
});

test('liefert normalisierte Release-Metadaten öffentlich aus', async () => {
  const response = await originalFetch(`${baseUrl}/api/releases/latest`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.json();
  assert.equal(body.version, '1.2.3');
  assert.equal(body.windows.sizeBytes, 78_123_456);
});

test('leitet den Download mit 302 direkt zu GitHub weiter', async () => {
  const response = await originalFetch(`${baseUrl}/api/download/windows`, { redirect: 'manual' });
  assert.equal(response.status, 302);
  assert.match(response.headers.get('location'), /^https:\/\/github\.com\//);
});

test('nutzt bei erreichtem GitHub-API-Limit die öffentliche Release-Seite', async () => {
  githubApiAvailable = false;
  clearReleaseCache();
  try {
    const response = await originalFetch(`${baseUrl}/api/releases/latest`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.version, '1.2.4');
    assert.equal(
      body.windows.url,
      'https://github.com/bekfft/Guildora/releases/download/desktop-v1.2.4/Guildora-Setup-1.2.4.exe'
    );
  } finally {
    githubApiAvailable = true;
    clearReleaseCache();
  }
});
