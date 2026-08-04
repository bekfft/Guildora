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
const appViewportSelector = 'html:is([data-display-mode="standalone"], [data-mobile-app])';

function cssRule(source, selector) {
  const start = source.indexOf(`${selector} {`);
  assert.notEqual(start, -1, `CSS-Regel fehlt: ${selector}`);
  return source.slice(start, source.indexOf('}', start) + 1);
}

test('iOS startet Guildora vom Home-Bildschirm ohne Safari-Chrome', () => {
  assert.match(indexHtml, /viewport-fit=cover/);
  assert.match(indexHtml, /apple-mobile-web-app-capable" content="yes"/);
  assert.match(indexHtml, /apple-touch-fullscreen" content="yes"/);
  assert.match(indexHtml, /apple-mobile-web-app-status-bar-style" content="black-translucent"/);
  assert.match(indexHtml, /rel="apple-touch-icon"/);
  assert.match(indexHtml, /rel="manifest"/);
  assert.equal(manifest.start_url, '/app');
  assert.equal(manifest.scope, '/');
  assert.equal(manifest.display, 'fullscreen');
  assert.deepEqual(manifest.display_override, ['fullscreen', 'standalone']);
  assert.equal(manifest.background_color, '#313338');
  assert.equal(manifest.theme_color, '#313338');
  assert.match(indexHtml, /name="theme-color" content="#313338"/);
});

test('Standalone-Modus und iPhone-Safe-Areas werden im App-Layout berücksichtigt', () => {
  assert.match(mainSource, /navigator\.standalone === true/);
  assert.match(mainSource, /display-mode: standalone/);
  assert.match(mainSource, /mobileAppQuery\.matches && window\.location\.pathname\.startsWith\('\/app'\)/);
  assert.match(mainSource, /toggleAttribute\('data-mobile-app', isMobileApp\)/);
  assert.match(mainSource, /Math\.max\(window\.innerHeight, document\.documentElement\.clientHeight\)/);
  assert.match(mainSource, /keyboardTarget && layoutHeight - visualHeight > 120/);
  assert.match(mainSource, /keyboardOpen \? visualHeight : Math\.max\(layoutHeight, visualHeight\)/);
  assert.match(mainSource, /--app-height/);
  assert.match(mainSource, /orientationchange/);
  assert.match(mainSource, /pageshow/);
  assert.match(tokensCss, /--safe-area-top:\s*env\(safe-area-inset-top/);
  assert.match(tokensCss, /--safe-area-bottom:\s*env\(safe-area-inset-bottom/);
  assert.match(appCss, /calc\(var\(--titlebar-height\) \+ var\(--safe-area-top\)\)/);
  assert.match(globalCss, /height:\s*var\(--app-height\)/);
  assert.match(globalCss, /background:\s*var\(--bg-content\)/);
  assert.match(cssRule(globalCss, `${appViewportSelector} body`), /position:\s*fixed[\s\S]*inset:\s*0/);
  assert.match(cssRule(appCss, `${appViewportSelector} .server-rail`), /padding-top:\s*calc\(12px \+ var\(--safe-area-top\)\)[\s\S]*padding-bottom:\s*calc\(12px \+ var\(--safe-area-bottom\)\)/);
  assert.match(cssRule(appCss, `${appViewportSelector} .user-panel`), /padding-bottom:\s*var\(--safe-area-bottom\)/);
  const composerViewportRule = cssRule(appCss, `${appViewportSelector} .composer-area`);
  assert.match(composerViewportRule, /padding-bottom:\s*var\(--safe-area-bottom\)[\s\S]*background:\s*var\(--bg-content\)/);
  assert.doesNotMatch(composerViewportRule, /border-radius:/);
  assert.match(cssRule(appCss, `${appViewportSelector} .guildora-app`), /top:\s*0[\s\S]*height:\s*var\(--app-height\)/);
  assert.match(cssRule(appCss, `${appViewportSelector} .app-main`), /grid-template-rows:\s*calc\(48px \+ var\(--safe-area-top\)\)/);
  assert.match(appCss, new RegExp(`${appViewportSelector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\.main-header,`));
  assert.match(cssRule(appCss, `${appViewportSelector} .member-list__header`), /padding-top:\s*var\(--safe-area-top\)/);
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
