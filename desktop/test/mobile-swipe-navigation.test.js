const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const clientRoot = path.resolve(__dirname, '..', '..', 'client', 'src');
const appPage = fs.readFileSync(path.join(clientRoot, 'pages', 'AppPage.jsx'), 'utf8');
const swipeModuleUrl = pathToFileURL(path.join(clientRoot, 'lib', 'mobileSwipe.js')).href;

test('mobile Wischrichtung wird nur bei einer klaren horizontalen Geste erkannt', async () => {
  const { clampSwipe, MOBILE_SWIPE_SETTLE_MS, resolveMobileSwipe } = await import(swipeModuleUrl);
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
  assert.match(appPage, /addEventListener\('touchmove', onTouchMove, \{ passive: false \}\)/);
  assert.match(appPage, /requestAnimationFrame\(renderGesture\)/);
  assert.match(appPage, /--swipe-panel-x/);
  assert.match(appPage, /--swipe-panel-transition/);
  assert.match(appPage, /cubic-bezier\(\.2, \.8, \.2, 1\)/);
  assert.match(appPage, /navigation-open/);
  assert.match(appPage, /members-open/);
  assert.match(appPage, /membersVisible \|\| swipePreview === 'members'/);
  assert.doesNotMatch(appPage, /input, textarea, select, button, a/);
});
