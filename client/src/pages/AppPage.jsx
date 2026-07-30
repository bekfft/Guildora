import { Menu } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import ChannelSidebar from '../app/ChannelSidebar.jsx';
import ChannelSettingsModal from '../app/ChannelSettingsModal.jsx';
import ChannelView from '../app/ChannelView.jsx';
import CategorySettingsModal from '../app/CategorySettingsModal.jsx';
import DiscoveryPage from '../app/DiscoveryPage.jsx';
import DirectMessageView from '../app/DirectMessageView.jsx';
import FriendsView from '../app/FriendsView.jsx';
import GuildModal from '../app/GuildModal.jsx';
import MainHeader from '../app/MainHeader.jsx';
import MessageSearch from '../app/MessageSearch.jsx';
import MemberList from '../app/MemberList.jsx';
import NotificationCenter from '../app/NotificationCenter.jsx';
import ProfileModal from '../app/ProfileModal.jsx';
import ServerRail from '../app/ServerRail.jsx';
import ServerSettingsModal from '../app/ServerSettingsModal.jsx';
import SettingsModal from '../app/SettingsModal.jsx';
import Toast from '../app/Toast.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useGuilds } from '../context/GuildContext.jsx';
import { useVoice } from '../context/VoiceContext.jsx';
import { api } from '../lib/api.js';
import { socket } from '../lib/socket.js';
import '../styles/app.css';

export default function AppPage() {
  const { user } = useAuth();
  const { guilds, loading: guildsLoading, leaveGuild, refreshGuilds } = useGuilds();
  const voice = useVoice();
  const { guildId, channelId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [guildData, setGuildData] = useState(null);
  const [members, setMembers] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [membersVisible, setMembersVisible] = useState(
    () => !window.matchMedia('(max-width: 1024px)').matches
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [guildModalOpen, setGuildModalOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState('Mein Konto');
  const [profileUserId, setProfileUserId] = useState(null);
  const [serverSettingsTab, setServerSettingsTab] = useState(null);
  const [channelSettings, setChannelSettings] = useState(null);
  const [categorySettings, setCategorySettings] = useState(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationCount, setNotificationCount] = useState(0);
  const [toast, setToast] = useState(null);
  const toastTimers = useRef([]);
  const engagementRefreshTimer = useRef(null);
  const guildRealtimeRefreshTimer = useRef(null);
  const isDiscovery = location.pathname === '/app/discovery';
  const isHome = location.pathname === '/app/channels/@me';
  const isDirect = location.pathname.startsWith('/app/channels/@me/') && Boolean(channelId);
  const focusMessageId = new URLSearchParams(location.search).get('message');

  const showToast = useCallback((message, type = 'info') => {
    toastTimers.current.forEach((timer) => window.clearTimeout(timer));
    setToast({ message, type, id: Date.now() });
    const exitTimer = window.setTimeout(() => {
      setToast((current) => current ? { ...current, closing: true } : current);
    }, 2600);
    const removeTimer = window.setTimeout(() => setToast(null), 2780);
    toastTimers.current = [exitTimer, removeTimer];
  }, []);

  const refreshGuildData = useCallback(async () => {
    if (!guildId || guildId === '@me') return;
    const [details, memberResult] = await Promise.all([api.guild(guildId), api.guildMembers(guildId)]);
    setGuildData(details);
    setMembers(memberResult.members);
    if (channelId && !details.channels.some((item) => item.id === channelId)) {
      const remembered = localStorage.getItem(`guildora:last-channel:${guildId}`);
      const target = details.channels.find((item) => item.id === remembered && item.type === 'text')
        || details.channels.find((item) => item.type === 'text');
      navigate(target ? `/app/channels/${guildId}/${target.id}` : '/app/channels/@me', { replace: true });
    }
  }, [channelId, guildId, navigate]);

  const refreshConversations = useCallback(async () => {
    const result = await api.conversations();
    setConversations(result.conversations);
  }, []);

  useEffect(() => () => {
    toastTimers.current.forEach((timer) => window.clearTimeout(timer));
    if (engagementRefreshTimer.current) window.clearTimeout(engagementRefreshTimer.current);
    if (guildRealtimeRefreshTimer.current) window.clearTimeout(guildRealtimeRefreshTimer.current);
  }, []);

  useEffect(() => {
    const query = window.matchMedia('(max-width: 1024px)');
    const updateLayout = (event) => setMembersVisible(!event.matches);
    query.addEventListener('change', updateLayout);
    return () => query.removeEventListener('change', updateLayout);
  }, []);

  useEffect(() => {
    if (drawerOpen) setMembersVisible(false);
  }, [drawerOpen]);

  useEffect(() => {
    if (window.matchMedia('(max-width: 1024px)').matches) setMembersVisible(false);
  }, [location.pathname]);

  useEffect(() => {
    const closeMobilePanels = (event) => {
      if (event.key !== 'Escape') return;
      setDrawerOpen(false);
      if (window.matchMedia('(max-width: 1024px)').matches) setMembersVisible(false);
    };
    document.addEventListener('keydown', closeMobilePanels);
    return () => document.removeEventListener('keydown', closeMobilePanels);
  }, []);

  useEffect(() => {
    api.notifications({ limit: 1 })
      .then((result) => setNotificationCount(result.unread_count))
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshConversations().catch(() => {});
    const refresh = () => refreshConversations().catch(() => {});
    const notifyDm = ({ conversationId, message }) => {
      refresh();
      if (conversationId === channelId && isDirect) return;
      showToast(`${message.author.display_name || message.author.username} hat dir geschrieben.`, 'info');
      if (localStorage.getItem('guildora:desktop-notifications') === 'enabled' && 'Notification' in window && Notification.permission === 'granted') {
        new Notification('Neue Direktnachricht', { body: `${message.author.display_name || message.author.username}: ${message.content || 'Anhang'}` });
      }
    };
    socket.on('dm:refresh', refresh);
    socket.on('social:refresh', refresh);
    socket.on('dm:notification', notifyDm);
    return () => {
      socket.off('dm:refresh', refresh);
      socket.off('social:refresh', refresh);
      socket.off('dm:notification', notifyDm);
    };
  }, [channelId, isDirect, refreshConversations, showToast]);

  useEffect(() => {
    if (location.pathname === '/app') navigate('/app/channels/@me', { replace: true });
  }, [location.pathname, navigate]);

  useEffect(() => {
    if (!guildId || guildId === '@me') {
      setGuildData(null);
      setMembers([]);
      setLoadingDetails(false);
      return;
    }
    let active = true;
    setLoadingDetails(true);
    Promise.all([api.guild(guildId), api.guildMembers(guildId)])
      .then(([details, memberResult]) => {
        if (!active) return;
        setGuildData(details);
        setMembers(memberResult.members);
        if (!channelId || !details.channels.some((channel) => channel.id === channelId)) {
          const remembered = localStorage.getItem(`guildora:last-channel:${guildId}`);
          const target = details.channels.find((channel) => channel.id === remembered && channel.type === 'text')
            || details.channels.find((channel) => channel.type === 'text');
          if (target) navigate(`/app/channels/${guildId}/${target.id}`, { replace: true });
          else navigate('/app/channels/@me', { replace: true });
        }
      })
      .catch((error) => {
        if (active) {
          showToast(error.message, 'error');
          navigate('/app/channels/@me', { replace: true });
        }
      })
      .finally(() => active && setLoadingDetails(false));
    return () => { active = false; };
  }, [guildId]);

  useEffect(() => {
    const onNotification = ({ notification }) => {
      setNotificationCount((current) => current + 1);
      const actor = notification.actor.display_name || notification.actor.username;
      showToast(
        notification.type === 'mention'
          ? `${actor} hat dich in #${notification.channel_name} erwähnt.`
          : `${actor} hat dir in #${notification.channel_name} geantwortet.`,
        'info'
      );
      if (
        localStorage.getItem('guildora:desktop-notifications') === 'enabled'
        && 'Notification' in window
        && Notification.permission === 'granted'
      ) {
        new Notification(notification.type === 'mention' ? 'Neue Erwähnung' : 'Neue Antwort', {
          body: `${actor} in #${notification.channel_name}: ${notification.content.slice(0, 120)}`
        });
      }
    };
    const onUnreadRefresh = ({ guildId: changedGuildId }) => {
      if (engagementRefreshTimer.current) window.clearTimeout(engagementRefreshTimer.current);
      engagementRefreshTimer.current = window.setTimeout(async () => {
        refreshGuilds(false).catch(() => {});
        if (changedGuildId === guildId) {
          api.guild(guildId).then(setGuildData).catch(() => {});
        }
      }, 180);
    };
    socket.on('notification:create', onNotification);
    socket.on('unread:refresh', onUnreadRefresh);
    if (!socket.connected) socket.connect();
    return () => {
      socket.off('notification:create', onNotification);
      socket.off('unread:refresh', onUnreadRefresh);
    };
  }, [guildId, refreshGuilds, showToast]);

  useEffect(() => {
    const onGuildRefresh = ({ guildId: changedGuildId }) => {
      if (!guildId || changedGuildId !== guildId) return;
      if (guildRealtimeRefreshTimer.current) window.clearTimeout(guildRealtimeRefreshTimer.current);
      guildRealtimeRefreshTimer.current = window.setTimeout(() => {
        refreshGuildData().catch(() => {});
      }, 80);
    };
    const onGuildRemoved = ({ guildId: removedGuildId, reason }) => {
      if (removedGuildId !== guildId) return;
      if (voice.channel?.guild_id === removedGuildId) voice.leave().catch(() => {});
      setGuildData(null);
      setMembers([]);
      navigate('/app/channels/@me', { replace: true });
      if (reason === 'kicked') showToast('Du wurdest von diesem Server entfernt.', 'error');
    };
    socket.on('guild:refresh', onGuildRefresh);
    socket.on('guild:removed', onGuildRemoved);
    return () => {
      socket.off('guild:refresh', onGuildRefresh);
      socket.off('guild:removed', onGuildRemoved);
      if (guildRealtimeRefreshTimer.current) window.clearTimeout(guildRealtimeRefreshTimer.current);
    };
  }, [guildId, navigate, refreshGuildData, showToast, voice.channel?.guild_id, voice.leave]);

  useEffect(() => {
    if (guildId && guildId !== '@me' && channelId) localStorage.setItem(`guildora:last-channel:${guildId}`, channelId);
  }, [guildId, channelId]);

  useEffect(() => {
    if (!guildId || guildId === '@me') return undefined;
    const joinGuildPresence = () => socket.emit('guild:join', { guildId });
    const updatePresence = ({ userId, status }) => {
      setMembers((current) => current.map((member) => (
        member.user_id === userId ? { ...member, status } : member
      )));
    };
    socket.on('connect', joinGuildPresence);
    socket.on('presence:update', updatePresence);
    if (!socket.connected) socket.connect();
    else joinGuildPresence();
    return () => {
      socket.off('connect', joinGuildPresence);
      socket.off('presence:update', updatePresence);
    };
  }, [guildId]);

  const activeChannel = guildData?.channels.find((channel) => channel.id === channelId);
  const activeConversation = conversations.find((conversation) => conversation.id === channelId);
  const currentMember = members.find((member) => member.user_id === user.id);
  const isGuildOwner = guildData?.guild.owner_id === user.id;
  const capabilities = {
    manageServer: Boolean(isGuildOwner || currentMember?.roles.some((role) => role.permissions?.manageServer)),
    manageChannels: Boolean(isGuildOwner || currentMember?.roles.some((role) => role.permissions?.manageChannels)),
    manageRoles: Boolean(isGuildOwner || currentMember?.roles.some((role) => role.permissions?.manageRoles)),
    kickMembers: Boolean(isGuildOwner || currentMember?.roles.some((role) => role.permissions?.kickMembers)),
    manageMessages: Boolean(isGuildOwner || currentMember?.roles.some((role) => role.permissions?.manageMessages))
  };
  const canManageServer = Object.values(capabilities).some(Boolean);
  const profileMember = members.find((member) => member.user_id === profileUserId) || null;

  const openProfile = useCallback((userId) => {
    setProfileUserId(userId);
    setDrawerOpen(false);
    if (window.matchMedia('(max-width: 1024px)').matches) setMembersVisible(false);
  }, []);

  const closeProfile = useCallback(() => {
    setProfileUserId(null);
  }, []);

  const openProfileSettings = useCallback(() => {
    setSettingsInitialTab('Profil');
    setSettingsOpen(true);
  }, []);

  const handleChannelRead = useCallback((readChannelId, unreadCount) => {
    setGuildData((current) => current ? {
      ...current,
      channels: current.channels.map((channel) => (
        channel.id === readChannelId ? { ...channel, unread_count: unreadCount } : channel
      ))
    } : current);
    refreshGuilds(false).catch(() => {});
  }, [refreshGuilds]);

  function navigateToMessage(item) {
    setNotificationsOpen(false);
    setSearchOpen(false);
    navigate(`/app/channels/${item.guild_id || guildId}/${item.channel_id || item.channel.id}?message=${item.message_id || item.id}`);
  }

  async function handleLeave() {
    try {
      if (voice.channel?.guild_id === guildId) await voice.leave();
      await leaveGuild(guildId);
      navigate('/app/channels/@me');
      showToast('Du hast den Server verlassen.', 'success');
    } catch (error) {
      showToast(error.message, 'error');
    }
  }

  async function handleQuickDeleteChannel(channel) {
    if (!window.confirm(`Channel „${channel.name}“ dauerhaft löschen?`)) return;
    try {
      if (voice.channel?.id === channel.id) await voice.leave();
      await api.deleteChannel(guildId, channel.id);
      const fallback = guildData.channels.find((item) => item.id !== channel.id && item.type === 'text');
      await refreshGuildData();
      if (channel.id === channelId) {
        navigate(fallback ? `/app/channels/${guildId}/${fallback.id}` : '/app/channels/@me', { replace: true });
      }
      showToast('Channel gelöscht.', 'success');
    } catch (error) {
      showToast(error.message, 'error');
    }
  }

  async function handleQuickDeleteCategory(category) {
    if (!window.confirm(`Kategorie „${category.name}“ löschen? Die enthaltenen Channels bleiben erhalten.`)) return;
    try {
      await api.deleteCategory(guildId, category.id);
      await refreshGuildData();
      showToast('Kategorie gelöscht. Die Channels wurden nicht gelöscht.', 'success');
    } catch (error) {
      showToast(error.message, 'error');
    }
  }

  async function handleMoveChannel(channel, categoryId) {
    try {
      await api.updateChannel(guildId, channel.id, {
        name: channel.name,
        type: channel.type,
        categoryId,
        topic: channel.topic || null,
        position: channel.position
      });
      await refreshGuildData();
      const category = categoryId
        ? guildData.categories.find((item) => item.id === categoryId)
        : null;
      showToast(
        category ? `Channel nach „${category.name}“ verschoben.` : 'Channel nach oben verschoben.',
        'success'
      );
    } catch (error) {
      showToast(error.message, 'error');
    }
  }

  return (
    <div className={`guildora-app ${isDiscovery ? 'is-discovery' : ''} ${membersVisible ? 'has-members' : 'members-hidden'} ${drawerOpen ? 'drawer-open' : ''}`}>
      <button className="drawer-backdrop" type="button" aria-label="Navigation schließen" onClick={() => setDrawerOpen(false)} />
      <div className="app-navigation">
        <ServerRail
          guilds={guilds}
          activeGuildId={guildId}
          discoveryActive={isDiscovery}
          onOpenGuildModal={() => setGuildModalOpen(true)}
          onNavigate={() => setDrawerOpen(false)}
        />
        {!isDiscovery && (
          <ChannelSidebar
            guildData={isHome || isDirect ? null : guildData}
            channelId={channelId}
            user={user}
            voice={voice}
            canManageServer={canManageServer}
            canManageChannels={capabilities.manageChannels}
            canManageInvites={capabilities.manageServer}
            onToast={showToast}
            onLeave={handleLeave}
            onOpenSettings={() => { setSettingsInitialTab('Mein Konto'); setSettingsOpen(true); }}
            onOpenServerSettings={(tab = 'overview') => setServerSettingsTab(tab)}
            onOpenChannelSettings={(channel) => {
              setDrawerOpen(false);
              setChannelSettings(channel);
            }}
            onOpenCategorySettings={(category) => {
              setDrawerOpen(false);
              setCategorySettings(category);
            }}
            onDeleteChannel={handleQuickDeleteChannel}
            onDeleteCategory={handleQuickDeleteCategory}
            onMoveChannel={handleMoveChannel}
            onNavigate={() => setDrawerOpen(false)}
            conversations={conversations}
          />
        )}
      </div>

      {isDiscovery ? (
        <div className="discovery-area">
          <button className="icon-button discovery-menu" type="button" onClick={() => setDrawerOpen(true)} aria-label="Navigation öffnen"><Menu size={22} /></button>
          <DiscoveryPage onToast={showToast} />
        </div>
      ) : (
        <section className="app-main">
          <MainHeader
            channel={activeChannel}
            isHome={isHome}
            directUser={isDirect ? activeConversation?.user : null}
            membersVisible={membersVisible}
            notificationCount={notificationCount}
            onToggleMembers={() => {
              setDrawerOpen(false);
              setMembersVisible((value) => !value);
            }}
            onToast={showToast}
            onOpenDrawer={() => setDrawerOpen(true)}
            onOpenNotifications={() => setNotificationsOpen(true)}
            onOpenSearch={() => setSearchOpen(true)}
          />
          {isHome ? (
            <FriendsView
              onOpenDm={(id) => navigate(`/app/channels/@me/${id}`)}
              onOpenProfile={openProfile}
              onToast={showToast}
              onConversationsChanged={() => refreshConversations().catch(() => {})}
            />
          ) : isDirect ? (
            <DirectMessageView
              conversation={activeConversation}
              currentUserId={user.id}
              onOpenProfile={openProfile}
              onToast={showToast}
              onRefresh={() => refreshConversations().catch(() => {})}
            />
          ) : (
            <ChannelView
              key={`${activeChannel?.id || 'loading'}:${focusMessageId || ''}`}
              channel={loadingDetails ? null : activeChannel}
              currentUserId={user.id}
              canManageMessages={capabilities.manageMessages}
              members={members}
              focusMessageId={focusMessageId}
              onOpenProfile={openProfile}
              onRead={handleChannelRead}
              onToast={showToast}
            />
          )}
        </section>
      )}

      {!isDiscovery && !isHome && !isDirect && membersVisible && (
        <>
          <button
            className="member-backdrop"
            type="button"
            aria-label="Mitgliederliste schließen"
            onClick={() => setMembersVisible(false)}
          />
          <MemberList
            members={members}
            loading={loadingDetails}
            onClose={() => setMembersVisible(false)}
            onOpenProfile={openProfile}
          />
        </>
      )}

      {(guildsLoading || (loadingDetails && !guildData && !isDirect)) && !isDiscovery && <div className="sidebar-loading" aria-hidden="true"><span /><span /><span /></div>}
      {guildModalOpen && <GuildModal onClose={() => setGuildModalOpen(false)} onToast={showToast} />}
      {settingsOpen && <SettingsModal initialTab={settingsInitialTab} onClose={() => setSettingsOpen(false)} onToast={showToast} />}
      {profileUserId && (
        <ProfileModal
          userId={profileUserId}
          guildId={!isHome && !isDirect && !isDiscovery ? guildData?.guild.id : null}
          member={profileMember}
          roles={guildData?.roles || []}
          canManageRoles={capabilities.manageRoles}
          onClose={closeProfile}
          onEditProfile={openProfileSettings}
          onOpenDm={(id) => navigate(`/app/channels/@me/${id}`)}
          onRolesChanged={refreshGuildData}
          onSocialChanged={() => refreshConversations().catch(() => {})}
          onToast={showToast}
        />
      )}
      {serverSettingsTab && guildData && (
        <ServerSettingsModal
          guildData={guildData}
          members={members}
          capabilities={capabilities}
          initialTab={serverSettingsTab}
          onClose={() => setServerSettingsTab(null)}
          onRefresh={refreshGuildData}
          onToast={showToast}
        />
      )}
      {channelSettings && guildData && (
        <ChannelSettingsModal
          guildData={guildData}
          channel={channelSettings}
          onClose={() => setChannelSettings(null)}
          onRefresh={refreshGuildData}
          onToast={showToast}
          onDeleted={(channel) => {
            if (channel.id === channelId) {
              const fallback = guildData.channels.find((item) => item.id !== channel.id && item.type === 'text');
              navigate(fallback ? `/app/channels/${guildId}/${fallback.id}` : '/app/channels/@me', { replace: true });
            }
          }}
        />
      )}
      {categorySettings && guildData && (
        <CategorySettingsModal
          guildData={guildData}
          category={categorySettings}
          onClose={() => setCategorySettings(null)}
          onRefresh={refreshGuildData}
          onToast={showToast}
        />
      )}
      {notificationsOpen && (
        <NotificationCenter
          onClose={() => setNotificationsOpen(false)}
          onNavigate={navigateToMessage}
          onCountChange={setNotificationCount}
          onToast={showToast}
        />
      )}
      {searchOpen && guildData && (
        <MessageSearch
          guildData={guildData}
          members={members}
          onClose={() => setSearchOpen(false)}
          onNavigate={navigateToMessage}
          onToast={showToast}
        />
      )}
      <Toast toast={toast} />
    </div>
  );
}
