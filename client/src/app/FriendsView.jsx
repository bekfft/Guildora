import { Ban, Check, MessageCircle, Search, UserMinus, UserPlus, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { socket } from '../lib/socket.js';

const TABS = ['Online', 'Alle', 'Ausstehend', 'Blockiert'];

function nameOf(user) {
  return user.display_name || user.username;
}

export default function FriendsView({ onOpenDm, onOpenProfile, onToast, onConversationsChanged }) {
  const [tab, setTab] = useState('Online');
  const [friends, setFriends] = useState([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const result = await api.friends();
      setFriends(result.friends);
    } catch (error) {
      onToast(error.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  useEffect(() => {
    refresh();
    const update = () => refresh();
    const updatePresence = ({ userId, status }) => setFriends((current) => current.map((friend) => (
      friend.user.id === userId ? { ...friend, user: { ...friend.user, status } } : friend
    )));
    socket.on('social:refresh', update);
    socket.on('social:presence', updatePresence);
    if (!socket.connected) socket.connect();
    return () => {
      socket.off('social:refresh', update);
      socket.off('social:presence', updatePresence);
    };
  }, [refresh]);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return undefined;
    }
    const timer = window.setTimeout(() => {
      api.searchUsers(query).then((result) => setResults(result.users)).catch(() => {});
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  const visible = useMemo(() => friends.filter((friend) => {
    if (tab === 'Online') return friend.state === 'accepted' && friend.user.status === 'online';
    if (tab === 'Alle') return friend.state === 'accepted';
    if (tab === 'Ausstehend') return ['incoming', 'outgoing'].includes(friend.state);
    return friend.state === 'blocked';
  }), [friends, tab]);

  async function action(run, success) {
    try {
      await run();
      setQuery('');
      setResults([]);
      await refresh();
      onConversationsChanged?.();
      if (success) onToast(success, 'success');
    } catch (error) {
      onToast(error.message, 'error');
    }
  }

  async function openDm(userId) {
    try {
      const result = await api.openConversation(userId);
      onConversationsChanged?.();
      onOpenDm(result.conversation.id);
    } catch (error) {
      onToast(error.message, 'error');
    }
  }

  return (
    <section className="friends-view">
      <div className="friends-tabs" role="tablist" aria-label="Freundesfilter">
        {TABS.map((item) => <button type="button" role="tab" aria-selected={tab === item} className={tab === item ? 'is-active' : ''} onClick={() => setTab(item)} key={item}>{item}</button>)}
      </div>
      <div className="friends-content">
        <div className="friend-add">
          <Search size={18} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nutzername suchen und Freund hinzufügen" aria-label="Nutzer suchen" />
        </div>
        {results.length > 0 && (
          <div className="friend-search-results">
            {results.map((user) => (
              <div className="friend-row" key={user.id}>
                <button className="friend-avatar" type="button" onClick={() => onOpenProfile(user.id)}>{user.avatar_url ? <img src={user.avatar_url} alt="" /> : nameOf(user)[0].toUpperCase()}</button>
                <button className="friend-name-button" type="button" onClick={() => onOpenProfile(user.id)}><strong>{nameOf(user)}</strong><small>@{user.username}</small></button>
                {!user.relationship && <button type="button" onClick={() => action(() => api.addFriend(user.username), 'Anfrage gesendet.')}><UserPlus size={17} /> Hinzufügen</button>}
                {user.relationship === 'incoming' && <button type="button" onClick={() => setTab('Ausstehend')}>Anfrage ansehen</button>}
                {user.relationship === 'accepted' && <button type="button" onClick={() => openDm(user.id)}><MessageCircle size={17} /> Nachricht</button>}
                {user.relationship === 'outgoing' && <small>Anfrage gesendet</small>}
                {user.relationship?.startsWith('blocked') && <small>Blockiert</small>}
              </div>
            ))}
          </div>
        )}
        <div className="friends-list">
          {!loading && visible.length === 0 && <div className="friends-empty"><h2>Hier ist es noch ganz ruhig</h2><p>In „{tab}“ gibt es aktuell nichts zu sehen.</p></div>}
          {visible.map((friend) => (
            <div className="friend-row" key={friend.id}>
              <button className={`friend-avatar is-${friend.user.status}`} type="button" onClick={() => onOpenProfile(friend.user.id)}>{friend.user.avatar_url ? <img src={friend.user.avatar_url} alt="" /> : nameOf(friend.user)[0].toUpperCase()}</button>
              <button className="friend-name-button" type="button" onClick={() => onOpenProfile(friend.user.id)}><strong>{nameOf(friend.user)}</strong><small>@{friend.user.username} · {friend.user.status === 'online' ? 'Online' : 'Offline'}</small></button>
              <div className="friend-actions">
                {friend.state === 'accepted' && <>
                  <button type="button" title="Nachricht" onClick={() => openDm(friend.user.id)}><MessageCircle size={17} /></button>
                  <button type="button" title="Entfernen" onClick={() => action(() => api.removeFriend(friend.id), 'Freund entfernt.')}><UserMinus size={17} /></button>
                  <button type="button" title="Blockieren" onClick={() => action(() => api.blockUser(friend.user.id), 'Nutzer blockiert.')}><Ban size={17} /></button>
                </>}
                {friend.state === 'incoming' && <>
                  <button type="button" title="Annehmen" onClick={() => action(() => api.respondFriend(friend.id, 'accept'), 'Anfrage angenommen.')}><Check size={17} /></button>
                  <button type="button" title="Ablehnen" onClick={() => action(() => api.respondFriend(friend.id, 'decline'))}><X size={17} /></button>
                </>}
                {friend.state === 'outgoing' && <button type="button" onClick={() => action(() => api.removeFriend(friend.id))}>Zurückziehen</button>}
                {friend.state === 'blocked' && <button type="button" onClick={() => action(() => api.unblockUser(friend.user.id), 'Blockierung aufgehoben.')}>Entblockieren</button>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
