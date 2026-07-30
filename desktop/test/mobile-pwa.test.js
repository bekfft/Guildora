const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const clientRoot = path.resolve(__dirname, '..', '..', 'client');
const indexHtml = fs.readFileSync(path.join(clientRoot, 'index.html'), 'utf8');
const manifest = JSON.parse(
  fs.readFileSync(path.join(clientRoot, 'public', 'manifest.webmanifest'), 'utf8')
);
const mainSource = fs.readFileSync(path.join(clientRoot, 'src', 'main.jsx'), 'utf8');
const tokensCss = fs.readFileSync(path.join(clientRoot, 'src', 'styles', 'tokens.css'), 'utf8');
const appCss = fs.readFileSync(path.join(clientRoot, 'src', 'styles', 'app.css'), 'utf8');

test('iOS startet Guildora vom Home-Bildschirm ohne Safari-Chrome', () => {
  assert.match(indexHtml, /viewport-fit=cover/);
  assert.match(indexHtml, /apple-mobile-web-app-capable" content="yes"/);
  assert.match(indexHtml, /apple-mobile-web-app-status-bar-style" content="black-translucent"/);
  assert.match(indexHtml, /rel="apple-touch-icon"/);
  assert.match(indexHtml, /rel="manifest"/);
  assert.equal(manifest.start_url, '/app');
  assert.equal(manifest.scope, '/');
  assert.equal(manifest.display, 'standalone');
  assert.deepEqual(manifest.display_override, ['standalone']);
});

test('Standalone-Modus und iPhone-Safe-Areas werden im App-Layout berücksichtigt', () => {
  assert.match(mainSource, /navigator\.standalone === true/);
  assert.match(mainSource, /display-mode: standalone/);
  assert.match(tokensCss, /--safe-area-top:\s*env\(safe-area-inset-top/);
  assert.match(tokensCss, /--safe-area-bottom:\s*env\(safe-area-inset-bottom/);
  assert.match(appCss, /calc\(var\(--titlebar-height\) \+ var\(--safe-area-top\)\)/);
  assert.match(appCss, /var\(--safe-area-bottom\)/);
  assert.match(appCss, /\.app-navigation\s*\{[\s\S]*?height:\s*auto;/);
});
