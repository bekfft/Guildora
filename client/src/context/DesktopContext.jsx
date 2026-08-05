import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const DesktopContext = createContext(null);
const desktopApi = typeof window !== 'undefined' ? window.desktop : null;

export function DesktopProvider({ children }) {
  const [maximized, setMaximized] = useState(false);
  const [update, setUpdate] = useState({ type: 'none' });
  const [notice, setNotice] = useState(null);
  const [settings, setSettingsState] = useState(null);
  const [trayHint, setTrayHint] = useState(false);
  const [activity, setActivity] = useState(null);

  useEffect(() => {
    if (!desktopApi?.isDesktop) return undefined;
    document.documentElement.classList.add('is-desktop');
    desktopApi.getSettings().then(setSettingsState);
    desktopApi.getActivity?.().then(setActivity);
    if (desktopApi.getUpdateState) desktopApi.getUpdateState().then(setUpdate);
    const checkAfterReconnect = () => {
      desktopApi.checkForUpdates().then(setUpdate);
    };
    window.addEventListener('online', checkAfterReconnect);
    const unsubscribers = [
      desktopApi.onMaximizeChange(setMaximized),
      desktopApi.onUpdateEvent(setUpdate),
      desktopApi.onNotice(setNotice),
      desktopApi.onTrayHint(() => setTrayHint(true)),
      desktopApi.onActivityChange?.(setActivity)
    ];
    return () => {
      document.documentElement.classList.remove('is-desktop');
      window.removeEventListener('online', checkAfterReconnect);
      unsubscribers.forEach((unsubscribe) => unsubscribe?.());
    };
  }, []);

  async function setSettings(partial) {
    const next = await desktopApi.setSettings(partial);
    setSettingsState(next);
    return next;
  }

  async function checkForUpdates() {
    const next = await desktopApi?.checkForUpdates();
    if (next) setUpdate(next);
    return next;
  }

  async function configureActivity(settings) {
    const result = await desktopApi?.configureActivity?.(settings);
    if (result && Object.hasOwn(result, 'activity')) setActivity(result.activity);
    return result;
  }

  const value = useMemo(() => ({
    isDesktop: Boolean(desktopApi?.isDesktop),
    platform: desktopApi?.platform,
    version: desktopApi?.version,
    maximized,
    update,
    notice,
    settings,
    trayHint,
    activity,
    dismissTrayHint: () => setTrayHint(false),
    dismissUpdate: () => setUpdate({ type: 'none' }),
    minimize: () => desktopApi?.minimize(),
    maximize: () => desktopApi?.maximize(),
    close: () => desktopApi?.close(),
    checkForUpdates,
    installUpdate: () => desktopApi?.installUpdate(),
    setSettings,
    configureActivity,
    joinActivity: (join) => desktopApi?.joinActivity?.(join),
    listActivityProcesses: () => desktopApi?.listActivityProcesses?.() || Promise.resolve([])
  }), [activity, maximized, notice, settings, trayHint, update]);

  return <DesktopContext.Provider value={value}>{children}</DesktopContext.Provider>;
}

export function useDesktop() {
  return useContext(DesktopContext);
}
