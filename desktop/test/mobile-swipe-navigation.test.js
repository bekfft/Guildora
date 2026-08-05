const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const clientRoot = path.resolve(__dirname, '..', '..', 'client', 'src');
const appPage = fs.readFileSync(path.join(clientRoot, 'pages', 'AppPage.jsx'), 'utf8');
const memberList = fs.readFileSync(path.join(clientRoot, 'app', 'MemberList.jsx'), 'utf8');
const appCss = fs.readFileSync(path.join(clientRoot, 'styles', 'app.css'), 'utf8');
const swipeModuleUrl = pathToFileURL(path.join(clientRoot, 'lib', 'mobileSwipe.js')).href;

test('mobile Wischrichtung wird nur bei einer klaren horizontalen Geste erkannt', async () => {
  const {
    clampSwipe,
    hasHorizontalSwipeIntent,
    MOBILE_SWIPE_SETTLE_MS,
    resolveMobileSwipe
  } = await import(swipeModuleUrl);
  assert.equal(hasHorizontalSwipeIntent({ deltaX: 8, deltaY: 11 }), false);
  assert.equal(hasHorizontalSwipeIntent({ deltaX: 18, deltaY: 12 }), true);
  assert.equal(hasHorizontalSwipeIntent({ deltaX: -22, deltaY: 18 }), true);
  assert.equal(hasHorizontalSwipeIntent({ deltaX: 18, deltaY: 28 }), false);
  assert.equal(resolveMobileSwipe({ deltaX: 90, deltaY: 12, durationMs: 300 }), 'right');
  assert.equal(resolveMobileSwipe({ deltaX: -90, deltaY: 12, durationMs: 300 }), 'left');
  assert.equal(resolveMobileSwipe({ deltaX: 42, deltaY: 4, durationMs: 100 }), 'right');
  assert.equal(resolveMobileSwipe({ deltaX: 42, deltaY: 4, durationMs: 500 }), null);
  assert.equal(resolveMobileSwipe({ deltaX: 90, deltaY: 82, durationMs: 300 }), null);
  assert.equal(resolveMobileSwipe({ deltaX: 90, deltaY: 4, durationMs: 1200 }), 'right');
  assert.equal(clampSwipe(-12, 0, 100), 0);
  assert.equal(clampSwipe(120, 0, 100), 100);
  assert.equal(MOBILE_SWIPE_SETTLE_MS, 220);
});

test('mobile App verdrahtet Discord-aehnliche Seitenpanel-Gesten', () => {
  assert.match(appPage, /import \{ flushSync \} from 'react-dom'/);
  assert.match(appPage, /addEventListener\('touchmove', onTouchMove, \{ passive: false \}\)/);
  assert.match(appPage, /addEventListener\('touchend', onTouchEnd, \{ passive: false \}\)/);
  assert.match(appPage, /suppressSwipeClickUntilRef\.current = performance\.now\(\) \+ 450/);
  assert.match(appPage, /addEventListener\('click', onClickCapture, true\)/);
  assert.match(appPage, /stopImmediatePropagation\?\.\(\)/);
  assert.match(appPage, /requestAnimationFrame\(renderGesture\)/);
  assert.match(appPage, /--swipe-panel-x/);
  assert.match(appPage, /--swipe-panel-transition/);
  assert.match(appPage, /cubic-bezier\(\.2, \.8, \.2, 1\)/);
  assert.match(appPage, /flushSync\(\(\) => \{[\s\S]*?setSwipePreview\(null\);[\s\S]*?\}\);\s*gesture\.kind = null;\s*clearVisualState\(\)/);
  assert.match(appPage, /navigation-open/);
  assert.match(appPage, /members-open/);
  assert.match(appPage, /hasHorizontalSwipeIntent\(\{ deltaX, deltaY \}\)/);
  assert.match(appPage, /memberPanelAvailable && membersVisible \? 'members-close' : 'navigation-open'/);
  assert.doesNotMatch(appPage, /\.welcome-onboarding, \.install-app-prompt/);
  assert.match(appPage, /\}, \[bootVisible, drawerOpen, isDirect, isDiscovery, isHome, membersVisible\]\);/);
  assert.match(appPage, /membersVisible \|\| swipePreview === 'members'/);
  assert.match(appPage, /setMembersOpenedBySwipe\(true\);\s*setMembersVisible\(true\)/);
  assert.match(appPage, /skipEntranceAnimation=\{membersOpenedBySwipe\}/);
  assert.match(memberList, /skipEntranceAnimation \? 'skip-entrance-animation' : ''/);
  assert.match(appCss, /\.member-list\.skip-entrance-animation\s*\{\s*animation:\s*none;/);
  assert.doesNotMatch(appPage, /input, textarea, select, button, a/);
});
