import { Menu } from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import ChannelSidebar from '../app/ChannelSidebar.jsx';
import ChannelView from '../app/ChannelView.jsx';
import DiscoveryPage from '../app/DiscoveryPage.jsx';
import DirectMessageView from '../app/DirectMessageView.jsx';
import FriendsView from '../app/FriendsView.jsx';
import ConnectionBanner from '../app/ConnectionBanner.jsx';
import AppBootScreen from '../components/AppBootScreen.jsx';
import InstallAppPrompt from '../app/InstallAppPrompt.jsx';
import MainHeader from '../app/MainHeader.jsx';
import MemberList from '../app/MemberList.jsx';
import ServerRail from '../app/ServerRail.jsx';
import Toast from '../app/Toast.jsx';
import WelcomeOnboarding from '../app/WelcomeOnboarding.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useGuilds } from '../context/GuildContext.jsx';
import { useVoice } from '../context/VoiceContext.jsx';
import { useGuildoraDialog } from '../context/GuildoraDialogContext.jsx';
import { api } from '../lib/api.js';
import { clampSwipe, MOBILE_SWIPE_SETTLE_MS, resolveMobileSwipe } from '../lib/mobileSwipe.js';
import { socket } from '../lib/socket.js';
import '../styles/app.css';

const CategorySettingsModal = lazy(() => import('../app/CategorySettingsModal.jsx'));
const ChannelSettingsModal = lazy(() => import('../app/ChannelSettingsModal.jsx'));
const GuildModal = lazy(() => import('../app/GuildModal.jsx'));
const MessageSearch = lazy(() => import('../app/MessageSearch.jsx'));
const NotificationCenter = lazy(() => import('../app/NotificationCenter.jsx'));
const ProfileModal = lazy(() => import('../app/ProfileModal.jsx'));
const ServerSettingsModal = lazy(() => import('../app/ServerSettingsModal.jsx'));
const SettingsModal = lazy(() => import('../app/SettingsModal.jsx'));

function inQuietHours(settings) {
  if (!settings?.quiet_hours_start || !settings?.quiet_hours_end) return false;
  const now = new Date();
  const current = now.getHours() * 60 + now.getMinutes();
  const [startHour, startMinute] = settings.quiet_hours_start.split(':').map(Number);
  const [endHour, endMinute] = settings.quiet_hours_end.split(':').map(Number);
  const start = startHour * 60 + startMinute;
  const end = endHour * 60 + endMinute;
  return start <= end ? current >= start && current < end : current >= start || current < end;
}

export default function AppPage() {
  const { user, settings } = useAuth();
  const { guilds, loading: guildsLoading, leaveGuild, refreshGuilds } = useGuilds();
  const voice = useVoice();
  const dialog = useGuildoraDialog();
  const { guildId, channelId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [guildData, setGuildData] = useState(null);
  const [members, setMembers] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [initialConversationsReady, setInitialConversationsReady] = useState(false);
  const [initialNotificationsReady, setInitialNotificationsReady] = useState(false);
  const [bootVisible, setBootVisible] = useState(true);
  const [bootCompleting, setBootCompleting] = useState(false);
  const bootStartedAt = useRef(performance.now());
  const [membersVisible, setMembersVisible] = useState(
    () => !window.matchMedia('(max-width: 1024px)').matches
  );
  const [membersOpenedBySwipe, setMembersOpenedBySwipe] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [swipePreview, setSwipePreview] = useState(null);
  const [guildModalOpen, setGuildModalOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState('Mein Konto');
  const [profileUserId, setProfileUserId] = useState(null);
  const [mentionRequest, setMentionRequest] = useState(null);
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
  const appRef = useRef(null);
  const suppressSwipeClickUntilRef = useRef(0);
  const isDiscovery = location.pathname === '/app/discovery';
  const isHome = location.pathname === '/app/channels/@me';
  const isDirect = location.pathname.startsWith('/app/channels/@me/') && Boolean(channelId);
  const focusMessageId = new URLSearchParams(location.search).get('message');
  const routeDataReady = location.pathname !== '/app'
    && (!guildId || guildId === '@me' || (!loadingDetails && Boolean(guildData)));
  const initialAppDataReady = !guildsLoading
    && initialConversationsReady
    && initialNotificationsReady
    && routeDataReady;

  useEffect(() => {
    if (!initialAppDataReady || !bootVisible) return undefined;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const minimumVisibleMs = reduceMotion ? 0 : 900;
    const remaining = Math.max(0, minimumVisibleMs - (performance.now() - bootStartedAt.current));
    const completeTimer = window.setTimeout(() => setBootCompleting(true), remaining);
    const hideTimer = window.setTimeout(() => setBootVisible(false), remaining + (reduceMotion ? 0 : 320));
    return () => {
      window.clearTimeout(completeTimer);
      window.clearTimeout(hideTimer);
    };
  }, [bootVisible, initialAppDataReady]);

  useEffect(() => {
    const app = appRef.current;
    if (!app) return undefined;

    const gesture = {
      startX: 0,
      startY: 0,
      lastX: 0,
      lastY: 0,
      startedAt: 0,
      tracking: false,
      horizontal: false,
      kind: null,
      frame: null,
      settleTimer: null
    };
    const ignoredTarget = (target) => target instanceof Element && Boolean(target.closest(
      'input, textarea, select, [contenteditable="true"], [data-swipe-ignore], '
      + '.friends-tabs, .settings-tabs, .emoji-picker, .message-attachment, '
      + '.modal-overlay, .server-settings-overlay, .engagement-overlay, .profile-popover, '
      + '.welcome-onboarding, .install-app-prompt'
    ));
    const clearVisualState = () => {
      if (gesture.frame) cancelAnimationFrame(gesture.frame);
      gesture.frame = null;
      app.style.removeProperty('--swipe-panel-x');
      app.style.removeProperty('--swipe-backdrop-opacity');
      app.style.removeProperty('--swipe-panel-transition');
      if (gesture.settleTimer) window.clearTimeout(gesture.settleTimer);
      gesture.settleTimer = null;
    };
    const resetGesture = (clearPreview = true) => {
      clearVisualState();
      gesture.tracking = false;
      gesture.horizontal = false;
      gesture.kind = null;
      if (clearPreview) setSwipePreview(null);
    };
    const panelWidth = () => {
      const selector = gesture.kind?.startsWith('members') ? '.member-list' : '.app-navigation';
      return app.querySelector(selector)?.getBoundingClientRect().width || 312;
    };
    const renderGesture = () => {
      gesture.frame = null;
      if (!gesture.tracking || !gesture.kind) return;
      const width = panelWidth();
      const deltaX = gesture.lastX - gesture.startX;
      let offset = 0;
      let progress = 0;

      if (gesture.kind === 'navigation-open') {
        const travelled = clampSwipe(deltaX, 0, width);
        offset = -width + travelled;
        progress = travelled / width;
      } else if (gesture.kind === 'navigation-close') {
        offset = clampSwipe(deltaX, -width, 0);
        progress = 1 - Math.abs(offset) / width;
      } else if (gesture.kind === 'members-open') {
        const travelled = clampSwipe(-deltaX, 0, width);
        offset = width - travelled;
        progress = travelled / width;
      } else {
        offset = clampSwipe(deltaX, 0, width);
        progress = 1 - offset / width;
      }

      app.style.setProperty('--swipe-panel-x', `${offset}px`);
      app.style.setProperty('--swipe-backdrop-opacity', String(clampSwipe(progress, 0, 1)));
    };
    const requestGestureFrame = () => {
      if (!gesture.frame) gesture.frame = requestAnimationFrame(renderGesture);
    };
    const chooseGesture = (deltaX) => {
      if (membersVisible && deltaX > 0) return 'members-close';
      if (drawerOpen && deltaX < 0) return 'navigation-close';
      if (!membersVisible && !drawerOpen && deltaX > 0) return 'navigation-open';
      if (!membersVisible && !drawerOpen && deltaX < 0 && !isDiscovery && !isHome && !isDirect) {
        return 'members-open';
      }
      return null;
    };
    const onTouchStart = (event) => {
      if (
        event.touches.length !== 1
        || !window.matchMedia('(max-width: 1024px)').matches
        || ignoredTarget(event.target)
      ) {
        resetGesture();
        return;
      }
      const [touch] = event.touches;
      gesture.startX = touch.clientX;
      gesture.startY = touch.clientY;
      gesture.lastX = touch.clientX;
      gesture.lastY = touch.clientY;
      gesture.startedAt = performance.now();
      gesture.tracking = true;
      gesture.horizontal = false;
      gesture.kind = null;
    };
    const onTouchMove = (event) => {
      if (!gesture.tracking || event.touches.length !== 1) return;
      const [touch] = event.touches;
      const deltaX = touch.clientX - gesture.startX;
      const deltaY = touch.clientY - gesture.startY;
      gesture.lastX = touch.clientX;
      gesture.lastY = touch.clientY;
      if (!gesture.horizontal && Math.max(Math.abs(deltaX), Math.abs(deltaY)) >= 8) {
        if (Math.abs(deltaY) > Math.abs(deltaX) * 1.08) {
          resetGesture();
          return;
        }
        gesture.horizontal = true;
        gesture.kind = chooseGesture(deltaX);
        if (!gesture.kind) {
          resetGesture();
          return;
        }
        setSwipePreview(gesture.kind.startsWith('members') ? 'members' : 'navigation');
      }
      if (gesture.horizontal) {
        event.preventDefault();
        requestGestureFrame();
      }
    };
    const onTouchEnd = (event) => {
      if (!gesture.tracking || !gesture.horizontal || event.changedTouches.length !== 1) {
        resetGesture();
        return;
      }
      if (event.cancelable) event.preventDefault();
      event.stopPropagation();
      suppressSwipeClickUntilRef.current = performance.now() + 450;
      const [touch] = event.changedTouches;
      gesture.lastX = touch.clientX;
      gesture.lastY = touch.clientY;
      if (gesture.frame) {
        cancelAnimationFrame(gesture.frame);
        gesture.frame = null;
      }
      renderGesture();
      const width = panelWidth();
      const direction = resolveMobileSwipe({
        deltaX: touch.clientX - gesture.startX,
        deltaY: touch.clientY - gesture.startY,
        durationMs: performance.now() - gesture.startedAt,
        panelWidth: width
      });
      const kind = gesture.kind;
      const completed = (direction === 'right' && ['navigation-open', 'members-close'].includes(kind))
        || (direction === 'left' && ['navigation-close', 'members-open'].includes(kind));
      gesture.tracking = false;
      gesture.horizontal = false;
      const settlesOpen = completed === kind.endsWith('-open');
      const targetOffset = settlesOpen
        ? 0
        : (kind.startsWith('members') ? width : -width);
      app.style.setProperty(
        '--swipe-panel-transition',
        `transform ${MOBILE_SWIPE_SETTLE_MS}ms cubic-bezier(.2, .8, .2, 1), opacity ${MOBILE_SWIPE_SETTLE_MS}ms ease-out`
      );
      app.style.setProperty('--swipe-panel-x', `${targetOffset}px`);
      app.style.setProperty('--swipe-backdrop-opacity', settlesOpen ? '1' : '0');
      gesture.settleTimer = window.setTimeout(() => {
        flushSync(() => {
          if (completed && kind === 'navigation-open') setDrawerOpen(true);
          if (completed && kind === 'navigation-close') setDrawerOpen(false);
          if (completed && kind === 'members-open') {
            setMembersOpenedBySwipe(true);
            setMembersVisible(true);
          }
          if (completed && kind === 'members-close') {
            setMembersOpenedBySwipe(false);
            setMembersVisible(false);
          }
          setSwipePreview(null);
        });
        gesture.kind = null;
        clearVisualState();
      }, MOBILE_SWIPE_SETTLE_MS + 5);
    };
    const onClickCapture = (event) => {
      if (performance.now() >= suppressSwipeClickUntilRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
    };

    app.addEventListener('touchstart', onTouchStart, { passive: true });
    app.addEventListener('touchmove', onTouchMove, { passive: false });
    app.addEventListener('touchend', onTouchEnd, { passive: false });
    app.addEventListener('click', onClickCapture, true);
    const onTouchCancel = () => resetGesture();
    app.addEventListener('touchcancel', onTouchCancel, { passive: true });
    return () => {
      app.removeEventListener('touchstart', onTouchStart);
      app.removeEventListener('touchmove', onTouchMove);
      app.removeEventListener('touchend', onTouchEnd);
      app.removeEventListener('click', onClickCapture, true);
      app.removeEventListener('touchcancel', onTouchCancel);
      clearVisualState();
    };
  }, [drawerOpen, isDirect, isDiscovery, isHome, membersVisible]);

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
    const updateLayout = (event) => {
      setMembersOpenedBySwipe(false);
      setMembersVisible(!event.matches);
    };
    query.addEventListener('change', updateLayout);
    return () => query.removeEventListener('change', updateLayout);
  }, []);

  useEffect(() => {
    if (drawerOpen) {
      setMembersOpenedBySwipe(false);
      setMembersVisible(false);
    }
  }, [drawerOpen]);

  useEffect(() => {
    if (window.matchMedia('(max-width: 1024px)').matches) {
      setMembersOpenedBySwipe(false);
      setMembersVisible(false);
    }
  }, [location.pathname]);

  useEffect(() => {
    const closeMobilePanels = (event) => {
      if (event.key !== 'Escape') return;
      setDrawerOpen(false);
      if (window.matchMedia('(max-width: 1024px)').matches) {
        setMembersOpenedBySwipe(false);
        setMembersVisible(false);
      }
    };
    document.addEventListener('keydown', closeMobilePanels);
    return () => document.removeEventListener('keydown', closeMobilePanels);
  }, []);

  useEffect(() => {
    api.notifications({ limit: 1 })
      .then((result) => setNotificationCount(result.unread_count))
      .catch(() => {})
      .finally(() => setInitialNotificationsReady(true));
  }, []);

  useEffect(() => {
    refreshConversations()
      .catch(() => {})
      .finally(() => setInitialConversationsReady(true));
    const refresh = () => refreshConversations().catch(() => {});
    const notifyFriendRequest = ({ request } = {}) => {
      if (!request?.user) return;
      const sender = request.user.display_name || request.user.username;
      showToast(`${sender} hat dir eine Freundschaftsanfrage gesendet.`, 'info');
      if (
        settings?.desktop_notifications
        && settings?.notify_friend_requests
        && !inQuietHours(settings)
        && 'Notification' in window
        && Notification.permission === 'granted'
      ) {
        new Notification('Neue Freundschaftsanfrage', {
          body: `${sender} möchte dich als Freund hinzufügen.`,
          icon: request.user.avatar_url || '/icons/guildora-192.png'
        });
      }
    };
    const notifyDm = ({ conversationId, message }) => {
      refresh();
      if (conversationId === channelId && isDirect) return;
      showToast(`${message.author.display_name || message.author.username} hat dir geschrieben.`, 'info');
      if (settings?.desktop_notifications && settings?.notify_direct_messages && !inQuietHours(settings) && 'Notification' in window && Notification.permission === 'granted') {
        new Notification('Neue Direktnachricht', { body: `${message.author.display_name || message.author.username}: ${message.content || 'Anhang'}` });
      }
    };
    socket.on('dm:refresh', refresh);
    socket.on('social:refresh', refresh);
    socket.on('social:friend-request', notifyFriendRequest);
    socket.on('dm:notification', notifyDm);
    return () => {
      socket.off('dm:refresh', refresh);
      socket.off('social:refresh', refresh);
      socket.off('social:friend-request', notifyFriendRequest);
      socket.off('dm:notification', notifyDm);
    };
  }, [channelId, isDirect, refreshConversations, settings, showToast]);

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
        settings?.desktop_notifications
        && (notification.type !== 'mention' || settings?.notify_mentions)
        && !inQuietHours(settings)
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
  }, [guildId, refreshGuilds, settings, showToast]);

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
    if (window.matchMedia('(max-width: 1024px)').matches) {
      setMembersOpenedBySwipe(false);
      setMembersVisible(false);
    }
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
    if (!await dialog.confirm({
      title: 'Channel löschen?',
      message: `Der Channel „${channel.name}“ wird dauerhaft gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.`,
      confirmLabel: 'Channel löschen'
    })) return;
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
    if (!await dialog.confirm({
      title: 'Kategorie löschen?',
      message: `Die Kategorie „${category.name}“ wird gelöscht. Die enthaltenen Channels bleiben erhalten.`,
      confirmLabel: 'Kategorie löschen'
    })) return;
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

  if (bootVisible) {
    return <AppBootScreen complete={bootCompleting} />;
  }

  return (
    <div ref={appRef} className={`guildora-app ${isDiscovery ? 'is-discovery' : ''} ${membersVisible ? 'has-members' : 'members-hidden'} ${drawerOpen ? 'drawer-open' : ''} ${swipePreview ? `is-swiping-${swipePreview}` : ''}`}>
      <a className="skip-link" href="#guildora-main">Zum Hauptinhalt</a>
      <ConnectionBanner />
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
            onOpenSettings={(tab = 'Mein Konto') => { setSettingsInitialTab(tab); setSettingsOpen(true); }}
            onOpenStaff={() => navigate('/staff')}
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
        <div className="discovery-area" id="guildora-main" tabIndex="-1">
          <button className="icon-button discovery-menu" type="button" onClick={() => setDrawerOpen(true)} aria-label="Navigation öffnen"><Menu size={22} /></button>
          <DiscoveryPage onToast={showToast} />
        </div>
      ) : (
        <section className="app-main" id="guildora-main" tabIndex="-1">
          <MainHeader
            channel={activeChannel}
            isHome={isHome}
            directUser={isDirect ? activeConversation?.user : null}
            membersVisible={membersVisible}
            notificationCount={notificationCount}
            onToggleMembers={() => {
              setDrawerOpen(false);
              setMembersOpenedBySwipe(false);
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
              mentionRequest={mentionRequest}
              focusMessageId={focusMessageId}
              onOpenProfile={openProfile}
              onRead={handleChannelRead}
              onToast={showToast}
            />
          )}
        </section>
      )}

      {!isDiscovery && !isHome && !isDirect && (membersVisible || swipePreview === 'members') && (
        <>
          <button
            className="member-backdrop"
            type="button"
            aria-label="Mitgliederliste schließen"
            onClick={() => {
              setMembersOpenedBySwipe(false);
              setMembersVisible(false);
            }}
          />
          <MemberList
            skipEntranceAnimation={membersOpenedBySwipe}
            members={members}
            loading={loadingDetails}
            currentUserId={user.id}
            guildId={guildData?.guild.id}
            guildOwnerId={guildData?.guild.owner_id}
            roles={guildData?.roles || []}
            capabilities={capabilities}
            canMention={activeChannel?.permissions?.sendMessages !== false}
            onClose={() => {
              setMembersOpenedBySwipe(false);
              setMembersVisible(false);
            }}
            onOpenProfile={openProfile}
            onOpenDm={(id) => navigate(`/app/channels/@me/${id}`)}
            onMention={(member) => setMentionRequest({
              channelId: activeChannel?.id,
              username: member.username,
              requestId: Date.now()
            })}
            onOpenModeration={() => setServerSettingsTab('moderation')}
            onRefresh={refreshGuildData}
            onSocialChanged={() => refreshConversations().catch(() => {})}
            onToast={showToast}
          />
        </>
      )}

      {(guildsLoading || (loadingDetails && !guildData && !isDirect)) && !isDiscovery && <div className="sidebar-loading" aria-hidden="true"><span /><span /><span /></div>}
      {isHome && <WelcomeOnboarding user={user} onFindFriends={() => navigate('/app/channels/@me')} onCreateServer={() => setGuildModalOpen(true)} />}
      <InstallAppPrompt />
      <Suspense fallback={null}>
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
      </Suspense>
      <Toast toast={toast} />
    </div>
  );
}
