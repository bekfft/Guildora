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
    /\.server-button:hover\s*\{[^}]*filter:\s*none[^}]*transform:\s*none/s
  );
  assert.match(
    appCss,
    /\.server-button--home\s*\{[^}]*background:\s*var\(--bg-sidebar\)/s
  );
  assert.match(
    appCss,
    /\.server-button--utility:hover,\s*\.server-button--utility\.is-active\s*\{[^}]*color:\s*inherit[^}]*background:\s*var\(--bg-sidebar\)/s
  );
  assert.doesNotMatch(
    appCss,
    /\.server-button:hover\s*\{[^}]*brightness|\.server-button--utility:hover,\s*\.server-button--utility\.is-active\s*\{[^}]*background:\s*var\(--online\)/s
  );
});
