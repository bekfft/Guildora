const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const appCss = fs.readFileSync(
  path.resolve(__dirname, '..', '..', 'client', 'src', 'styles', 'app.css'),
  'utf8'
);

test('Avatarbilder bleiben unabhängig vom Seitenverhältnis in ihrem festen Rahmen', () => {
  const imageRule = appCss.match(
    /\.voice-participant__avatar > img,[\s\S]*?\.account-card > div > img\s*\{([^}]+)\}/
  );

  assert.ok(imageRule, 'Die gemeinsame Avatar-Bildregel fehlt.');
  assert.match(imageRule[0], /\.mini-avatar > img/);
  assert.match(imageRule[0], /\.member-avatar > img/);
  assert.match(imageRule[0], /\.user-profile-card__avatar > img/);
  assert.match(imageRule[1], /position:\s*absolute/);
  assert.match(imageRule[1], /inset:\s*0/);
  assert.match(imageRule[1], /width:\s*100%/);
  assert.match(imageRule[1], /height:\s*100%/);
  assert.match(imageRule[1], /object-fit:\s*cover/);
});
