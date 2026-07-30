import { Menu } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import ChannelSidebar from '../app/ChannelSidebar.jsx';
import ChannelSettingsModal from '../app/ChannelSettingsModal.jsx';
import ChannelView from '../app/ChannelView.jsx';
import CategorySettingsModal from '../app/CategorySettingsModal.jsx';
import DiscoveryPage from '../app/DiscoveryPage.jsx';
import FriendsView from '../app/FriendsView.jsx';
import GuildModal from '../app/GuildModal.jsx';
import MainHeader from '../app/MainHeader.jsx';
import MemberList from '../app/MemberList.jsx';
import ServerRail from '../app/ServerRail.jsx';
import ServerSettingsModal from '../app/ServerSettingsModal.jsx';
import SettingsModal from '../app/SettingsModal.jsx';
import Toast from '../app/Toast.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useGuilds } from '../context/GuildContext.jsx';
import { api } from '../lib/api.js';
import { socket } from '../lib/socket.js';
import '../styles/app.css';

export default function AppPage() {
  const { user } = useAuth();
  const { guilds, loading: guildsLoading, leaveGuild } = useGuilds();
  const { guildId, channelId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [guildData, setGuildData] = useState(null);
  const [members, setMembers] = useState([]);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [membersVisible, setMembersVisible] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [guildModalOpen, setGuildModalOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [serverSettingsTab, setServerSettingsTab] = useState(null);
  const [channelSettings, setChannelSettings] = useState(null);
  const [categorySettings, setCategorySettings] = useState(null);
  const [toast, setToast] = useState(null);
  const toastTimers = useRef([]);
  const isDiscovery = location.pathname === '/app/discovery';
  const isHome = location.pathname === '/app/channels/@me';

  const showToast = useCallback((message, type = 'info') => {
    toastTimers.current.forEach((timer) => window.clearTimeout(timer));
    setToast({ message, type, id: Date.now() });
    const exitTimer = window.setTimeout(() => {
      setToast((current) => current ? { ...current, closing: true } : current);
    }, 2600);
    const removeTimer = window.setTimeout(() => setToast(null), 2780);
    toastTimers.current = [exitTimer, removeTimer];
  }, []);

  useEffect(() => () => {
    toastTimers.current.forEach((timer) => window.clearTimeout(timer));
  }, []);

  useEffect(() => {
    if (location.pathname === '/app') navigate('/app/channels/@me', { replace: true });
  }, [location.pathname, navigate]);

  useEffect(() => {
    if (!guildId) {
      setGuildData(null);
      setMembers([]);
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
    if (guildId && channelId) localStorage.setItem(`guildora:last-channel:${guildId}`, channelId);
  }, [guildId, channelId]);

  useEffect(() => {
    if (!guildId) return undefined;
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

  async function refreshGuildData() {
    if (!guildId) return;
    const [details, memberResult] = await Promise.all([api.guild(guildId), api.guildMembers(guildId)]);
    setGuildData(details);
    setMembers(memberResult.members);
  }

  async function handleLeave() {
    try {
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
            guildData={isHome ? null : guildData}
            channelId={channelId}
            user={user}
            canManageServer={canManageServer}
            canManageChannels={capabilities.manageChannels}
            canManageInvites={capabilities.manageServer}
            onToast={showToast}
            onLeave={handleLeave}
            onOpenSettings={() => setSettingsOpen(true)}
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
            membersVisible={membersVisible}
            onToggleMembers={() => setMembersVisible((value) => !value)}
            onToast={showToast}
            onOpenDrawer={() => setDrawerOpen(true)}
          />
          {isHome ? <FriendsView /> : (
            <ChannelView
              key={activeChannel?.id || 'loading'}
              channel={loadingDetails ? null : activeChannel}
              currentUserId={user.id}
              canManageMessages={capabilities.manageMessages}
              onToast={showToast}
            />
          )}
        </section>
      )}

      {!isDiscovery && !isHome && membersVisible && <MemberList members={members} loading={loadingDetails} />}

      {(guildsLoading || (loadingDetails && !guildData)) && !isDiscovery && <div className="sidebar-loading" aria-hidden="true"><span /><span /><span /></div>}
      {guildModalOpen && <GuildModal onClose={() => setGuildModalOpen(false)} onToast={showToast} />}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
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
      <Toast toast={toast} />
    </div>
  );
}
