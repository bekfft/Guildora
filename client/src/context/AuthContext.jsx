import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState(null);

  const loadSettings = useCallback(async () => {
    const result = await api.accountSettings();
    setSettings(result.settings);
    return result.settings;
  }, []);

  const restoreSession = useCallback(async () => {
    try {
      const result = await api.me();
      setUser(result.user);
      await loadSettings();
    } catch (error) {
      if (error.status === 401) {
        try {
          const result = await api.refresh();
          setUser(result.user);
          await loadSettings();
        } catch {
          setUser(null);
        }
      } else {
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  }, [loadSettings]);

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  const login = useCallback(async (credentials) => {
    const result = await api.login(credentials);
    setUser(result.user);
    await loadSettings();
    return result.user;
  }, [loadSettings]);

  const register = useCallback(async (data) => {
    const result = await api.register(data);
    setUser(result.user);
    await loadSettings();
    return result.user;
  }, [loadSettings]);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      setUser(null);
      setSettings(null);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    const result = await api.me();
    setUser(result.user);
    return result.user;
  }, []);

  const saveSettings = useCallback(async (changes) => {
    const result = await api.updateAccountSettings(changes);
    setSettings(result.settings);
    return result.settings;
  }, []);

  useEffect(() => {
    if (!settings) return;
    const root = document.documentElement;
    const resolvedTheme = settings.theme === 'system'
      ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
      : settings.theme;
    root.dataset.theme = resolvedTheme;
    root.dataset.density = settings.message_density;
    root.dataset.colorVision = settings.color_vision;
    root.lang = settings.language;
    root.style.setProperty('--brand', settings.accent_color);
    root.style.fontSize = `${settings.font_scale}%`;
    root.style.zoom = String(settings.app_zoom / 100);
    root.classList.toggle('reduce-motion', settings.reduce_motion);
    root.classList.toggle('high-contrast', settings.high_contrast);
  }, [settings]);

  const value = useMemo(
    () => ({ user, loading, settings, login, register, logout, refreshUser, saveSettings, loadSettings }),
    [user, loading, settings, login, register, logout, refreshUser, saveSettings, loadSettings]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth muss innerhalb des AuthProviders verwendet werden.');
  return context;
}
