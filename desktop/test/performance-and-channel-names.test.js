const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('Channelnamen behalten Unicode, Emojis, Leerzeichen und Großschreibung', () => {
  const controller = read('server/src/controllers/guildAdminController.js');
  const schema = read('server/src/validation/guildAdminSchemas.js');
  const settings = read('client/src/app/ChannelSettingsModal.jsx');

  assert.match(controller, /value\.normalize\('NFC'\)\.trim\(\)/);
  assert.doesNotMatch(controller, /function normalizeChannelName[\s\S]{0,160}toLowerCase/);
  assert.match(schema, /\\p\{Cc\}\\p\{Cs\}/);
  assert.match(settings, /Emojis und Sonderzeichen sind erlaubt/);
});

test('Dauerarbeit und lange Nachrichtenlisten sind ressourcenschonend', () => {
  const main = read('client/src/main.jsx');
  const voice = read('client/src/context/VoiceContext.jsx');
  const css = read('client/src/styles/app.css');

  assert.match(main, /if \(viewportFrame\) return/);
  assert.match(main, /requestAnimationFrame\(\(\) =>/);
  assert.match(voice, /\}, 15000\);/);
  assert.match(voice, /document\.hidden \? 250 : 50/);
  assert.match(voice, /audioPreset:\s*AudioPresets\.musicHighQuality/);
  assert.match(css, /\.messages-list > div:last-child \.message-row\s*\{[\s\S]*animation:\s*content-arrive/);
});
