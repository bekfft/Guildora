const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const clientRoot = path.resolve(__dirname, '..', '..', 'client', 'src');
const appPage = fs.readFileSync(path.join(clientRoot, 'pages', 'AppPage.jsx'), 'utf8');
const swipeModuleUrl = pathToFileURL(path.join(clientRoot, 'lib', 'mobileSwipe.js')).href;

test('mobile Wischrichtung wird nur bei einer klaren horizontalen Geste erkannt', async () => {
  const { resolveMobileSwipe } = await import(swipeModuleUrl);
  assert.equal(resolveMobileSwipe({ deltaX: 90, deltaY: 12, durationMs: 300 }), 'right');
  assert.equal(resolveMobileSwipe({ deltaX: -90, deltaY: 12, durationMs: 300 }), 'left');
  assert.equal(resolveMobileSwipe({ deltaX: 42, deltaY: 4, durationMs: 200 }), null);
  assert.equal(resolveMobileSwipe({ deltaX: 90, deltaY: 82, durationMs: 300 }), null);
  assert.equal(resolveMobileSwipe({ deltaX: 90, deltaY: 4, durationMs: 1000 }), null);
});

test('mobile App verdrahtet Discord-aehnliche Seitenpanel-Gesten', () => {
  assert.match(appPage, /addEventListener\('touchmove', onTouchMove, \{ passive: false \}\)/);
  assert.match(appPage, /if \(membersVisible\) setMembersVisible\(false\)/);
  assert.match(appPage, /else if \(!drawerOpen\) setDrawerOpen\(true\)/);
  assert.match(appPage, /if \(drawerOpen\) setDrawerOpen\(false\)/);
  assert.match(appPage, /else if \(!isDiscovery && !isHome && !isDirect\) setMembersVisible\(true\)/);
  assert.match(appPage, /input, textarea, select, button, a/);
});
