const IPC = Object.freeze({
  WINDOW_MINIMIZE: 'desktop:window-minimize',
  WINDOW_MAXIMIZE: 'desktop:window-maximize',
  WINDOW_CLOSE: 'desktop:window-close',
  MAXIMIZE_CHANGE: 'desktop:maximize-change',
  UPDATE_CHECK: 'desktop:update-check',
  UPDATE_GET_STATE: 'desktop:update-get-state',
  UPDATE_INSTALL: 'desktop:update-install',
  UPDATE_EVENT: 'desktop:update-event',
  NOTICE: 'desktop:notice',
  SETTINGS_GET: 'desktop:settings-get',
  SETTINGS_SET: 'desktop:settings-set',
  OFFLINE_RETRY: 'desktop:offline-retry',
  OPEN_DOWNLOAD: 'desktop:open-download',
  TRAY_HINT: 'desktop:tray-hint',
  ACTIVITY_GET: 'desktop:activity-get',
  ACTIVITY_CONFIGURE: 'desktop:activity-configure',
  ACTIVITY_CHANGE: 'desktop:activity-change',
  ACTIVITY_JOIN: 'desktop:activity-join',
  ACTIVITY_PROCESSES: 'desktop:activity-processes'
});

module.exports = { IPC };
