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
const appSource = fs.readFileSync(path.join(clientRoot, 'src', 'App.jsx'), 'utf8');
const channelView = fs.readFileSync(path.join(clientRoot, 'src', 'app', 'ChannelView.jsx'), 'utf8');
const directMessageView = fs.readFileSync(path.join(clientRoot, 'src', 'app', 'DirectMessageView.jsx'), 'utf8');
const globalCss = fs.readFileSync(path.join(clientRoot, 'src', 'styles', 'global.css'), 'utf8');
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

test('Mobile Vollbildansichten, Formulare und Composer bleiben in den sicheren Bedienflächen', () => {
  assert.match(appSource, /!desktop\?\.isDesktop && !isStandalone/);
  assert.match(globalCss, /html\[data-display-mode="standalone"\] \.auth-shell/);
  assert.match(globalCss, /\.field__toggle\s*\{[\s\S]*?width:\s*44px;[\s\S]*?height:\s*44px;/);
  assert.match(globalCss, /\.navbar__action\s*\{[\s\S]*?min-height:\s*44px;/);
  assert.match(appCss, /\.modal-overlay\s*\{[\s\S]*?var\(--safe-area-top\)[\s\S]*?var\(--safe-area-bottom\)/);
  assert.match(appCss, /\.server-settings-overlay\s*\{[\s\S]*?var\(--safe-area-top\)[\s\S]*?var\(--safe-area-bottom\)/);
  assert.match(appCss, /\.engagement-overlay\s*\{[\s\S]*?var\(--safe-area-top\)[\s\S]*?var\(--safe-area-bottom\)/);
  assert.match(appCss, /\.channel-view\s*\{[\s\S]*?min-width:\s*0;/);
  assert.match(appCss, /\.composer-area\s*\{[\s\S]*?min-width:\s*0;[\s\S]*?width:\s*100%;/);
  assert.match(appCss, /\.character-count:empty\s*\{\s*display:\s*none;/);
  assert.match(appCss, /@media \(max-width: 900px\) \{\s*\.guildora-app,/);
  assert.match(channelView, /fitComposer\(composerRef\.current\)/);
  assert.match(directMessageView, /fitComposer\(composer\.current\)/);
});
