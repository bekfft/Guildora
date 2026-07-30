import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';

const GuildContext = createContext(null);

export function GuildProvider({ children }) {
  const [guilds, setGuilds] = useState([]);
  const [loading, setLoading] = useState(true);

  const refreshGuilds = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.myGuilds();
      setGuilds(result.guilds);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshGuilds().catch(() => setLoading(false));
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
