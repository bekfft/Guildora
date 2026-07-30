import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const DesktopContext = createContext(null);
const desktopApi = typeof window !== 'undefined' ? window.desktop : null;

export function DesktopProvider({ children }) {
  const [maximized, setMaximized] = useState(false);
  const [update, setUpdate] = useState({ type: 'none' });
  const [notice, setNotice] = useState(null);
  const [settings, setSettingsState] = useState(null);
  const [trayHint, setTrayHint] = useState(false);

  useEffect(() => {
    if (!desktopApi?.isDesktop) return undefined;
    document.documentElement.classList.add('is-desktop');
    desktopApi.getSettings().then(setSettingsState);
    if (desktopApi.getUpdateState) desktopApi.getUpdateState().then(setUpdate);
    const checkAfterReconnect = () => {
      desktopApi.checkForUpdates().then(setUpdate);
    };
    window.addEventListener('online', checkAfterReconnect);
    const unsubscribers = [
      desktopApi.onMaximizeChange(setMaximized),
      desktopApi.onUpdateEvent(setUpdate),
      desktopApi.onNotice(setNotice),
      desktopApi.onTrayHint(() => setTrayHint(true))
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

  const value = useMemo(() => ({
    isDesktop: Boolean(desktopApi?.isDesktop),
    platform: desktopApi?.platform,
    version: desktopApi?.version,
    maximized,
    update,
    notice,
    settings,
    trayHint,
    dismissTrayHint: () => setTrayHint(false),
    dismissUpdate: () => setUpdate({ type: 'none' }),
    minimize: () => desktopApi?.minimize(),
    maximize: () => desktopApi?.maximize(),
    close: () => desktopApi?.close(),
    checkForUpdates,
    installUpdate: () => desktopApi?.installUpdate(),
    setSettings
  }), [maximized, notice, settings, trayHint, update]);

  return <DesktopContext.Provider value={value}>{children}</DesktopContext.Provider>;
}

export function useDesktop() {
  return useContext(DesktopContext);
}
