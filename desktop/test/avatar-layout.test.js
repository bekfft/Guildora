const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const appCss = fs.readFileSync(
  path.resolve(__dirname, '..', '..', 'client', 'src', 'styles', 'app.css'),
  'utf8'
);
const profileModal = fs.readFileSync(
  path.resolve(__dirname, '..', '..', 'client', 'src', 'app', 'ProfileModal.jsx'),
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

test('Presence-Punkte verwenden für jeden Nutzerstatus die richtige Farbe', () => {
  assert.match(appCss, /\.status-dot--online\s*\{\s*background:\s*var\(--online\);\s*\}/);
  assert.match(appCss, /\.status-dot--idle\s*\{\s*background:\s*var\(--idle\);\s*\}/);
  assert.match(appCss, /\.status-dot--dnd\s*\{\s*background:\s*var\(--dnd\);\s*\}/);
  assert.match(appCss, /\.status-dot--offline\s*\{\s*background:\s*var\(--offline\);\s*\}/);
});

test('Voice-Avatare verwenden denselben neutralen Bildrahmen wie die Mitgliederliste', () => {
  assert.match(
    appCss,
    /\.voice-participant\s*\{[^}]*min-height:\s*40px;[^}]*grid-template-columns:\s*32px minmax\(0,\s*1fr\) auto;/s
  );
  const voiceAvatarRule = appCss.match(/\.voice-participant__avatar\s*\{([^}]+)\}/);
  assert.ok(voiceAvatarRule, 'Voice-Avatar-Regel fehlt.');
  assert.match(voiceAvatarRule[1], /width:\s*32px/);
  assert.match(voiceAvatarRule[1], /height:\s*32px/);
  assert.match(voiceAvatarRule[1], /overflow:\s*hidden/);
  assert.match(voiceAvatarRule[1], /border:\s*0/);
  assert.doesNotMatch(
    voiceAvatarRule[1],
    /border:\s*2px solid transparent/,
    'Der transparente Voice-Rahmen darf den Markenverlauf nicht rot oder lila durchscheinen lassen.'
  );
});

test('Serverprofile zeigen den Servernamen vollständig unterhalb des Banners', () => {
  assert.match(profileModal, /const displayName = profile\.server_profile\?\.display_name \|\| profile\.server_profile\?\.nickname \|\| nameOf\(profile\)/);
  assert.match(profileModal, /const avatarUrl = profile\.server_profile\?\.avatar_url \|\| profile\.avatar_url/);
  assert.match(profileModal, /const bannerUrl = profile\.server_profile\?\.banner_url \|\| profile\.banner_url/);
  assert.match(profileModal, /<h2>\{displayName\}<\/h2>/);
  assert.match(appCss, /\.full-profile__identity > div:last-child\s*\{[^}]*padding-top:\s*54px/s);
});
