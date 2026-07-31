const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const appCss = fs.readFileSync(
  path.resolve(__dirname, '..', '..', 'client', 'src', 'styles', 'app.css'),
  'utf8'
);

test('Server und Guildora-Logo behalten beim Hover ihre Farbe', () => {
  assert.match(
    appCss,
    /\.server-button:hover,\s*\.server-button\.is-active\s*\{[^}]*background:\s*var\(--bg-sidebar\)/s
  );
  assert.match(
    appCss,
    /\.server-button:hover\s*\{[^}]*filter:\s*brightness\(1\.06\)[^}]*transform:\s*translateY\(-1px\)/s
  );
  assert.match(
    appCss,
    /\.server-button--home\s*\{[^}]*background:\s*var\(--bg-sidebar\)/s
  );
});
