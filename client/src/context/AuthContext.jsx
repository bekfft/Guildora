import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';

const AuthContext = createContext(null);

const DEFAULT_SETTINGS = Object.freeze({
  friend_requests: 'everyone',
  direct_messages: 'friends',
  content_filter: 'non_friends',
  desktop_notifications: true,
  notification_sounds: true,
  notify_mentions: true,
  notify_direct_messages: true,
  notify_friend_requests: true,
  quiet_hours_start: null,
  quiet_hours_end: null,
  theme: 'dark',
  accent_color: '#7c5cff',
  message_density: 'cozy',
  font_scale: 100,
  app_zoom: 100,
  reduce_motion: false,
  high_contrast: false,
  color_vision: 'none',
  screen_reader: false,
  captions: false,
  language: 'de',
  date_format: 'de-DE',
  time_format: '24h',
  timezone: 'Europe/Berlin',
  spellcheck: true,
  voice_input_device: null,
  voice_output_device: null,
  voice_camera_device: null,
  voice_input_mode: 'voice_activity',
  voice_sensitivity: 50,
  voice_noise_suppression: true,
  voice_echo_cancellation: true,
  voice_auto_gain: true,
  push_to_talk_key: 'Space'
});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState(null);
  const [sessionUnavailable, setSessionUnavailable] = useState(false);

  const loadSettings = useCallback(async () => {
    try {
      const result = await api.accountSettings();
      setSettings(result.settings);
      return result.settings;
    } catch (error) {
      // Kontoeinstellungen sind ergänzend. Ein Ausfall dieses Endpunkts darf
      // eine gültige Anmeldung oder Sitzungswiederherstellung nie blockieren.
      console.warn('Kontoeinstellungen konnten nicht geladen werden.', error);
      setSettings(DEFAULT_SETTINGS);
      return DEFAULT_SETTINGS;
    }
  }, []);

  const restoreSession = useCallback(async () => {
    setLoading(true);
    setSessionUnavailable(false);
    try {
      const result = await api.me();
      setUser(result.user);
      setSessionUnavailable(false);
      await loadSettings();
    } catch (error) {
      if (error.status === 401) {
        setUser(null);
        setSettings(null);
        setSessionUnavailable(false);
      } else {
        // Ein kurzer API- oder Netzwerkausfall ist keine Abmeldung. Besonders
        // beim Desktop-Start nach einem Update bleibt die Sitzung erhalten.
        setSessionUnavailable(true);
      }
    } finally {
      setLoading(false);
    }
  }, [loadSettings]);

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  useEffect(() => {
    if (!sessionUnavailable) return undefined;
    const retry = () => restoreSession();
    const timer = window.setTimeout(retry, 5_000);
    window.addEventListener('online', retry, { once: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('online', retry);
    };
  }, [restoreSession, sessionUnavailable]);

  const login = useCallback(async (credentials) => {
    const result = await api.login(credentials);
    setUser(result.user);
    setSessionUnavailable(false);
    await loadSettings();
    return result.user;
  }, [loadSettings]);

  const register = useCallback(async (data) => {
    const result = await api.register(data);
    setUser(result.user);
    setSessionUnavailable(false);
    await loadSettings();
    return result.user;
  }, [loadSettings]);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      setUser(null);
      setSettings(null);
      setSessionUnavailable(false);
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

  const value = useMemo(() => ({
    user,
    loading,
    sessionUnavailable,
    settings,
    login,
    register,
    logout,
    restoreSession,
    refreshUser,
    saveSettings,
    loadSettings
  }), [
    user,
    loading,
    sessionUnavailable,
    settings,
    login,
    register,
    logout,
    restoreSession,
    refreshUser,
    saveSettings,
    loadSettings
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth muss innerhalb des AuthProviders verwendet werden.');
  return context;
}
