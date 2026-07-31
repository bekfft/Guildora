const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const appCss = fs.readFileSync(
  path.resolve(__dirname, '..', '..', 'client', 'src', 'styles', 'app.css'),
  'utf8'
);
const friendsView = fs.readFileSync(
  path.resolve(__dirname, '..', '..', 'client', 'src', 'app', 'FriendsView.jsx'),
  'utf8'
);

test('Freundesuche und Liste teilen sich einen stabilen Inhaltsbereich', () => {
  assert.match(friendsView, /<div className="friends-content">[\s\S]*?<div className="friend-add">/);
  assert.match(
    friendsView,
    /<div className="friends-content">[\s\S]*?friend-search-results[\s\S]*?<div className="friends-list">/
  );
  assert.match(
    appCss,
    /\.friends-view\s*\{[^}]*grid-template-rows:\s*48px minmax\(0,\s*1fr\)/s
  );
  assert.match(
    appCss,
    /\.friends-content\s*\{[^}]*display:\s*flex[^}]*min-height:\s*0[^}]*overflow:\s*hidden[^}]*flex-direction:\s*column/s
  );
  assert.match(
    appCss,
    /\.friends-list\s*\{[^}]*min-height:\s*0[^}]*overflow-y:\s*auto[^}]*flex:\s*1 1 auto/s
  );
  assert.match(appCss, /\.friends-empty\s*\{[^}]*min-height:\s*100%/s);
});

test('Mobile Freundeansicht nutzt nur den äußeren Scrollbereich', () => {
  assert.match(
    appCss,
    /@media \(max-width: 900px\)[\s\S]*?\.friends-content\s*\{[^}]*overflow:\s*visible[^}]*flex:\s*0 0 auto/s
  );
  assert.match(
    appCss,
    /@media \(max-width: 900px\)[\s\S]*?\.friends-list\s*\{[^}]*overflow:\s*visible[^}]*flex:\s*0 0 auto/s
  );
});

test('Offene Freundschaftsanfragen sind sichtbar und eindeutig beschriftet', () => {
  assert.match(friendsView, /friends-tab-count is-new/);
  assert.match(friendsView, /Möchte dich als Freund hinzufügen/);
  assert.match(friendsView, /Anfrage gesendet/);
  assert.match(friendsView, /setTab\('Ausstehend'\)/);
  assert.match(appCss, /\.friends-tab-count\.is-new\s*\{[^}]*background:\s*var\(--danger\)/s);
});
