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
const composerViewport = fs.readFileSync(path.join(clientRoot, 'src', 'lib', 'composerViewport.js'), 'utf8');
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
  assert.match(mainSource, /mobileAppQuery\.matches && \['\/app', '\/staff'\]\.some/);
  assert.match(mainSource, /toggleAttribute\('data-mobile-app', isMobileApp\)/);
  assert.match(appSource, /function MobileAppRouteSync\(\)/);
  assert.match(appSource, /\['\/app', '\/staff'\]\.some\(\(prefix\) => pathname\.startsWith\(prefix\)\)/);
  assert.match(appSource, /<MobileAppRouteSync \/>/);
  assert.match(mainSource, /Math\.max\(window\.innerHeight, document\.documentElement\.clientHeight\)/);
  assert.match(mainSource, /const iosStandalone = window\.navigator\.standalone === true/);
  assert.match(mainSource, /const deviceScreenHeight = portrait/);
  assert.match(mainSource, /Math\.max\(layoutHeight, visualHeight, deviceScreenHeight\)/);
  assert.match(mainSource, /keyboardTarget && layoutHeight - visualHeight > 120/);
  assert.match(mainSource, /const viewportHeight = keyboardOpen \? visualHeight : fullscreenHeight/);
  assert.match(mainSource, /const keyboardTop = keyboardOpen \? Math\.max\(0, visualViewport\?\.offsetTop \|\| 0\) : 0/);
  assert.match(mainSource, /setProperty\('--app-height', `\$\{Math\.round\(viewportHeight\)\}px`\)/);
  assert.match(mainSource, /setProperty\('--app-top', `\$\{Math\.round\(keyboardTop\)\}px`\)/);
  assert.match(mainSource, /toggleAttribute\('data-keyboard-open', keyboardOpen\)/);
  assert.match(mainSource, /data-composer-keyboard/);
  assert.doesNotMatch(mainSource, /removeProperty\('--app-height'\)/);
  assert.match(mainSource, /--app-height/);
  assert.match(mainSource, /orientationchange/);
  assert.match(mainSource, /pageshow/);
  assert.match(mainSource, /visualViewport\?\.addEventListener\('scroll', updateAppViewport\)/);
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
  assert.match(cssRule(appCss, `${appViewportSelector} .guildora-app`), /top:\s*var\(--app-top, 0px\)[\s\S]*height:\s*var\(--app-height\)/);
  assert.match(cssRule(appCss, `${appViewportSelector} .app-main`), /grid-template-rows:\s*calc\(48px \+ var\(--safe-area-top\)\)/);
  assert.match(appCss, new RegExp(`${appViewportSelector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\.main-header,`));
  assert.match(cssRule(appCss, `${appViewportSelector} .member-list__header`), /padding-top:\s*var\(--safe-area-top\)/);
  assert.match(appCss, /:is\(\.modal-overlay, \.server-settings-overlay, \.engagement-overlay\)\s*\{\s*inset:\s*0;/);
  assert.match(cssRule(appCss, `${appViewportSelector} .modal-overlay`), /padding:\s*0/);
  assert.match(appCss, new RegExp(`${appViewportSelector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\.app-modal:not\\(\\.app-modal--settings\\):not\\(:has\\(\\.full-profile\\)\\)[\\s\\S]*padding-bottom:\\s*max\\(30px, var\\(--safe-area-bottom\\)\\)`));
  assert.match(cssRule(appCss, `${appViewportSelector} .server-settings-overlay`), /padding:\s*0/);
  assert.match(appCss, /\.server-settings__sidebar\s*\{[\s\S]*padding-top:\s*calc\(10px \+ var\(--safe-area-top\)\)/);
  assert.match(appCss, /\.server-settings__content\s*\{[\s\S]*padding-bottom:\s*var\(--safe-area-bottom\)/);
  assert.match(cssRule(appCss, `${appViewportSelector} .engagement-panel`), /padding-bottom:\s*var\(--safe-area-bottom\)/);
  assert.match(cssRule(globalCss, `${appViewportSelector} :is(.route-loader, .app-placeholder)`), /height:\s*var\(--app-height\)[\s\S]*min-height:\s*var\(--app-height\)/);
  assert.match(appCss, /\.app-navigation\s*\{[\s\S]*?height:\s*auto;/);
  assert.match(globalCss, /html\[data-mobile-app\] \.skip-link\s*\{\s*display:\s*none;/);
  assert.match(appCss, /\.app-modal:has\(\.full-profile\)\s*\{[\s\S]*height:\s*var\(--app-height\);[\s\S]*overflow-y:\s*auto;/);
  assert.match(appCss, /\.full-profile__banner\s*\{\s*height:\s*calc\(128px \+ var\(--safe-area-top\)\);/);
});

test('Mobile Seitenleisten und Einstellungen liegen an den echten Viewport-Kanten', () => {
  const mobileNavigationRule = cssRule(appCss, `${appViewportSelector} .app-navigation`);
  assert.match(mobileNavigationRule, /background:[\s\S]*var\(--navigation-rail-width\)/);
  assert.match(appCss, new RegExp(`${appViewportSelector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\.app-navigation[\\s\\S]*top:\\s*0;[\\s\\S]*bottom:\\s*0;[\\s\\S]*height:\\s*auto;`));
  assert.match(appCss, /\.app-navigation\s*\{\s*--navigation-rail-width:\s*64px;[\s\S]*grid-template-columns:\s*64px/);
  assert.match(appCss, /\.modal-overlay:has\(\.app-modal--settings\)\s*\{[\s\S]*background:\s*#1e1f22;/);
  assert.match(appCss, /\.app-modal\.app-modal--settings\s*\{[\s\S]*position:\s*fixed;[\s\S]*inset:\s*0;[\s\S]*height:\s*auto;[\s\S]*max-height:\s*none;/);
  assert.match(cssRule(appCss, `${appViewportSelector} .server-settings-overlay`), /padding:\s*0/);
  assert.match(appCss, /\.server-settings__content\s*\{[\s\S]*padding-bottom:\s*var\(--safe-area-bottom\);[\s\S]*background:\s*#1e1f22;/);
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
  assert.match(channelView, /bindComposerViewport\(composerRef\.current, scrollerRef\.current\)/);
  assert.match(directMessageView, /bindComposerViewport\(composer\.current, scroller\.current\)/);
  assert.match(composerViewport, /bottomDistance <= 96/);
  assert.match(composerViewport, /scroller\.scrollHeight - scroller\.clientHeight - anchor\.bottomDistance/);
  assert.match(composerViewport, /viewport\.addEventListener\('resize', restore\)/);
  assert.match(composerViewport, /viewport\.addEventListener\('scroll', restore\)/);
  assert.match(appCss, /html\[data-composer-keyboard\] \.composer-area\s*\{\s*padding-bottom:\s*0;/);
});

test('Mobile Nachrichtenaktionen erscheinen erst nach einem Langdruck', () => {
  assert.match(channelView, /const \[mobileActionsId, setMobileActionsId\] = useState\(null\)/);
  assert.match(channelView, /window\.setTimeout\(\(\) => \{[\s\S]*setMobileActionsId\(messageId\);[\s\S]*\}, 460\)/);
  assert.match(channelView, /mobileActionsId === message\.id \? 'is-actions-open' : ''/);
  assert.match(channelView, /onPointerDown=\{\(event\) => startMessageLongPress\(event, message\.id\)\}/);
  assert.match(appCss, /@media \(max-width: 520px\) \{[\s\S]*\.message-actions\s*\{[\s\S]*display:\s*none;[\s\S]*opacity:\s*0;/);
  assert.match(appCss, /\.message-row\.is-actions-open \.message-actions,[\s\S]*display:\s*flex;[\s\S]*opacity:\s*1;/);
});

test('Desktop-Shell scrollt nur im Inhalt und erzeugt keine zweite EXE-Scrollleiste', () => {
  assert.match(globalCss, /html\.is-desktop,[\s\S]*html\.is-desktop body,[\s\S]*html\.is-desktop #root\s*\{[\s\S]*height:\s*100%;[\s\S]*overflow:\s*hidden;/);
  assert.match(cssRule(globalCss, 'html.is-desktop :is(.landing, .download-page, .auth-shell, .invite-shell, .placeholder-page, .route-loader, .app-placeholder)'), /height:\s*var\(--content-viewport-height\)[\s\S]*overflow-y:\s*auto/);
});
