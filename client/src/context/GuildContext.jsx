import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { socket } from '../lib/socket.js';

const GuildContext = createContext(null);

export function GuildProvider({ children }) {
  const [guilds, setGuilds] = useState([]);
  const [loading, setLoading] = useState(true);
  const realtimeRefreshTimer = useRef(null);

  const refreshGuilds = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const result = await api.myGuilds();
      setGuilds(result.guilds);
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshGuilds().catch(() => setLoading(false));
  }, [refreshGuilds]);

  useEffect(() => {
    const scheduleRefresh = () => {
      if (realtimeRefreshTimer.current) window.clearTimeout(realtimeRefreshTimer.current);
      realtimeRefreshTimer.current = window.setTimeout(() => {
        refreshGuilds(false).catch(() => {});
      }, 80);
    };
    const removeGuild = ({ guildId }) => {
      setGuilds((current) => current.filter((guild) => guild.id !== guildId));
      scheduleRefresh();
    };
    socket.on('guild:refresh', scheduleRefresh);
    socket.on('guild:removed', removeGuild);
    if (!socket.connected) socket.connect();
    return () => {
      socket.off('guild:refresh', scheduleRefresh);
      socket.off('guild:removed', removeGuild);
      if (realtimeRefreshTimer.current) window.clearTimeout(realtimeRefreshTimer.current);
    };
  }, [refreshGuilds]);

  const joinGuild = useCallback(async (guild) => {
    setGuilds((current) => current.some((item) => item.id === guild.id) ? current : [...current, { ...guild, is_member: true }]);
    try {
      const result = await api.joinGuild(guild.id);
      setGuilds((current) => current.map((item) => item.id === guild.id ? result.guild : item));
      return result;
    } catch (error) {
      setGuilds((current) => current.filter((item) => item.id !== guild.id));
      throw error;
    }
  }, []);

  const leaveGuild = useCallback(async (guildId) => {
    const previous = guilds;
    setGuilds((current) => current.filter((guild) => guild.id !== guildId));
    try {
      await api.leaveGuild(guildId);
    } catch (error) {
      setGuilds(previous);
      throw error;
    }
  }, [guilds]);

  const createGuild = useCallback(async (data) => {
    const result = await api.createGuild(data);
    setGuilds((current) => [...current, result.guild]);
    return result;
  }, []);

  const value = useMemo(() => ({
    guilds, loading, refreshGuilds, joinGuild, leaveGuild, createGuild
  }), [guilds, loading, refreshGuilds, joinGuild, leaveGuild, createGuild]);

  return <GuildContext.Provider value={value}>{children}</GuildContext.Provider>;
}

export function useGuilds() {
  const context = useContext(GuildContext);
  if (!context) throw new Error('useGuilds muss innerhalb des GuildProviders verwendet werden.');
  return context;
}
