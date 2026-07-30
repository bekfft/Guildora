const path = require('node:path');
const { Menu, Tray, app } = require('electron');

function createTray({ window, checkForUpdates, requestQuit }) {
  const icon = app.isPackaged
    ? path.join(process.resourcesPath, 'icon.ico')
    : path.join(__dirname, '..', 'build', 'icon.ico');
  const tray = new Tray(icon);
  const toggleWindow = () => {
    if (window.isVisible()) window.hide();
    else {
      window.show();
      window.focus();
    }
  };
  tray.setToolTip('Guildora');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Guildora öffnen', click: () => { window.show(); window.focus(); } },
    { label: 'Nach Updates suchen', click: checkForUpdates },
    { type: 'separator' },
    { label: 'Beenden', click: requestQuit }
  ]));
  tray.on('click', toggleWindow);
  return tray;
}

module.exports = { createTray };
