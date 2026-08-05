const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Bot-Einladungen verwenden einen Discord-aehnlichen Autorisierungsablauf', () => {
  const app = read('client/src/App.jsx');
  const page = read('client/src/pages/BotInstallPage.jsx');
  assert.match(app, /bots\/:appId\/install/);
  assert.match(page, /Zu Server hinzufügen/);
  assert.match(page, /Berechtigungen/);
  assert.match(page, /authorizeDeveloperApp/);
  assert.match(page, /nur Server angezeigt, die du verwalten darfst/);
});

test('Server-Admins koennen installierte Bots zentral verwalten', () => {
  const settings = read('client/src/app/ServerSettingsModal.jsx');
  const controller = read('server/src/controllers/developerController.js');
  assert.match(settings, /id: 'integrations'/);
  assert.match(settings, /removeGuildBot/);
  assert.match(controller, /export async function guildBots/);
  assert.match(controller, /export async function removeGuildBot/);
});

test('Slash-Commands werden bei gleichen Namen einem Bot eindeutig zugeordnet', () => {
  const channel = read('client/src/app/ChannelView.jsx');
  const controller = read('server/src/controllers/developerController.js');
  assert.match(channel, /selectedCommand\.app_id/);
  assert.match(controller, /AMBIGUOUS_COMMAND/);
  assert.match(controller, /bc\.app_id = \?/);
});
