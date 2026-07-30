import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, test } from 'node:test';
import { app } from '../src/index.js';
import { clearReleaseCache } from '../src/services/releaseService.js';

const originalFetch = global.fetch;
let server;
let baseUrl;

before(async () => {
  global.fetch = (input, options) => {
    if (String(input).startsWith('https://api.github.com/')) {
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
  const body = await response.json();
  assert.equal(body.version, '1.2.3');
  assert.equal(body.windows.sizeBytes, 78_123_456);
});

test('leitet den Download mit 302 direkt zu GitHub weiter', async () => {
  const response = await originalFetch(`${baseUrl}/api/download/windows`, { redirect: 'manual' });
  assert.equal(response.status, 302);
  assert.match(response.headers.get('location'), /^https:\/\/github\.com\//);
});
