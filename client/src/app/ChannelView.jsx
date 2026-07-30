import {
  Check,
  CornerUpLeft,
  FileText,
  Flag,
  Hash,
  LoaderCircle,
  Paperclip,
  Pencil,
  Send,
  SmilePlus,
  Trash2,
  X
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { socket } from '../lib/socket.js';
import { useGuildoraDialog } from '../context/GuildoraDialogContext.jsx';

const GROUP_WINDOW = 5 * 60 * 1000;
const QUICK_REACTIONS = ['👍', '❤️', '😂', '🎉', '👀', '🔥'];

function authorName(author) {
  return author?.display_name || author?.username || 'Unbekannt';
}

function messageTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' }).format(date);
}

function messageDay(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: 'long', year: 'numeric' }).format(date);
}

function sameDay(first, second) {
  return new Date(first).toDateString() === new Date(second).toDateString();
}

function mergeMessage(list, message) {
  const index = list.findIndex((item) => item.id === message.id);
  if (index === -1) return [...list, message];
  return list.map((item) => item.id === message.id ? message : item);
}

function mergeReaction(list, messageId, reaction) {
  return list.map((message) => {
    if (message.id !== messageId) return message;
    const remaining = (message.reactions || []).filter((item) => item.emoji !== reaction.emoji);
    return {
      ...message,
      reactions: reaction.count > 0 ? [...remaining, reaction] : remaining
    };
  });
}

function MessageText({ message }) {
  const mentioned = new Set((message.mentions || []).map((user) => user.username.toLowerCase()));
  const parts = message.content.split(/(@[a-z0-9._]{2,32})/gi);
  return (
    <p>
      {parts.map((part, index) => {
        const username = part.startsWith('@') ? part.slice(1).toLowerCase() : '';
        return mentioned.has(username)
          ? <span className="message-mention" key={`${part}-${index}`}>{part}</span>
          : part;
      })}
      {message.edited && <small className="edited-mark"> (bearbeitet)</small>}
    </p>
  );
}

export default function ChannelView({
  channel,
  currentUserId,
  canManageMessages,
  members = [],
  mentionRequest,
  focusMessageId,
  onOpenProfile,
  onRead,
  onToast
}) {
  const dialog = useGuildoraDialog();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editContent, setEditContent] = useState('');
  const [replyingTo, setReplyingTo] = useState(null);
  const [reactionPickerId, setReactionPickerId] = useState(null);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [composerEmojiOpen, setComposerEmojiOpen] = useState(false);
  const [typingUsers, setTypingUsers] = useState(new Set());
  const scrollerRef = useRef(null);
  const composerRef = useRef(null);
  const typingTimerRef = useRef(null);
  const initialScrollDone = useRef(false);
  const draftKey = channel ? `guildora:draft:${channel.id}` : '';
  const canReadHistory = channel?.permissions?.readHistory !== false;
  const canSendMessages = channel?.permissions?.sendMessages !== false;
  const canAttachFiles = channel?.permissions?.attachFiles !== false;

  useEffect(() => {
    if (!mentionRequest || mentionRequest.channelId !== channel?.id || !canSendMessages) return;
    setDraft((current) => `${current}${current && !/\s$/.test(current) ? ' ' : ''}@${mentionRequest.username} `);
    requestAnimationFrame(() => composerRef.current?.focus());
  }, [canSendMessages, channel?.id, mentionRequest]);

  useEffect(() => {
    if (!channel) return undefined;
    let active = true;
    initialScrollDone.current = false;
    setLoading(true);
    setMessages([]);
    setReplyingTo(null);
    setReactionPickerId(null);
    setDraft(localStorage.getItem(draftKey) || '');
    if (!canReadHistory) {
      setMessages([]);
      setHasMore(false);
      setLoading(false);
      return () => { active = false; };
    }
    api.messages(channel.id, focusMessageId ? { around: focusMessageId } : {})
      .then((result) => {
        if (!active) return;
        setMessages(result.messages);
        setHasMore(result.has_more);
        const readTarget = focusMessageId || result.messages.at(-1)?.id;
        if (readTarget) {
          api.markChannelRead(channel.id, readTarget)
            .then((readResult) => active && onRead?.(channel.id, readResult.unread_count))
            .catch(() => {});
        }
      })
      .catch((error) => active && onToast(error.message, 'error'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [channel?.id, draftKey, focusMessageId, onToast, canReadHistory]);

  useEffect(() => {
    if (!channel) return undefined;
    const onCreate = ({ message }) => {
      if (message.channel_id !== channel.id) return;
      setMessages((current) => mergeMessage(current, message));
      if (message.author.id !== currentUserId && document.visibilityState === 'visible') {
        api.markChannelRead(channel.id, message.id)
          .then((readResult) => onRead?.(channel.id, readResult.unread_count))
          .catch(() => {});
      }
    };
    const onUpdate = ({ message }) => {
      if (message.channel_id === channel.id) setMessages((current) => mergeMessage(current, message));
    };
    const onDelete = ({ messageId, channelId }) => {
      if (channelId !== channel.id) return;
      setMessages((current) => current
        .filter((item) => item.id !== messageId)
        .map((item) => item.reply_to?.id === messageId ? { ...item, reply_to: null } : item));
      setReplyingTo((current) => current?.id === messageId ? null : current);
    };
    const onReaction = ({ messageId, channelId, reaction }) => {
      if (channelId === channel.id) {
        setMessages((current) => mergeReaction(current, messageId, reaction));
      }
    };
    const onTyping = ({ channelId, userId, typing }) => {
      if (channelId !== channel.id || userId === currentUserId) return;
      setTypingUsers((current) => {
        const next = new Set(current);
        if (typing) next.add(userId);
        else next.delete(userId);
        return next;
      });
    };
    const onConnectError = async (error) => {
      if (error.message !== 'UNAUTHORIZED') return;
      try {
        await api.refresh();
        socket.connect();
      } catch {
        onToast('Die Live-Verbindung konnte nicht erneuert werden.', 'error');
      }
    };
    socket.on('message:create', onCreate);
    socket.on('message:update', onUpdate);
    socket.on('message:delete', onDelete);
    socket.on('message:reaction', onReaction);
    socket.on('channel:typing', onTyping);
    socket.on('connect_error', onConnectError);
    if (!socket.connected) socket.connect();
    socket.emit('channel:join', { channelId: channel.id });
    const rejoin = () => socket.emit('channel:join', { channelId: channel.id });
    socket.on('connect', rejoin);
    return () => {
      socket.off('message:create', onCreate);
      socket.off('message:update', onUpdate);
      socket.off('message:delete', onDelete);
      socket.off('message:reaction', onReaction);
      socket.off('channel:typing', onTyping);
      socket.off('connect_error', onConnectError);
      socket.off('connect', rejoin);
    };
  }, [channel?.id, currentUserId, onRead, onToast]);

  useEffect(() => {
    if (!loading && !initialScrollDone.current && scrollerRef.current) {
      if (focusMessageId) scrollToMessage(focusMessageId);
      else scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
      initialScrollDone.current = true;
    }
  }, [loading, messages.length, focusMessageId]);

  useEffect(() => {
    if (!draftKey) return;
    if (draft) localStorage.setItem(draftKey, draft);
    else localStorage.removeItem(draftKey);
  }, [draft, draftKey]);

  const renderedMessages = useMemo(() => messages.map((message, index) => {
    const previous = messages[index - 1];
    const grouped = !message.reply_to
      && previous
      && previous.author.id === message.author.id
      && new Date(message.created_at) - new Date(previous.created_at) < GROUP_WINDOW;
    return { message, grouped, showDay: !previous || !sameDay(previous.created_at, message.created_at) };
  }), [messages]);

  const mentionSuggestions = useMemo(() => {
    const match = draft.match(/(?:^|\s)@([a-z0-9._]*)$/i);
    if (!match) return [];
    const term = match[1].toLowerCase();
    return members
      .filter((member) => member.username?.toLowerCase().includes(term)
        || member.display_name?.toLowerCase().includes(term))
      .slice(0, 5);
  }, [draft, members]);

  function scrollToMessage(messageId) {
    const row = scrollerRef.current?.querySelector(`[data-message-id="${messageId}"]`);
    if (!row) return;
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    row.classList.remove('is-highlighted');
    requestAnimationFrame(() => row.classList.add('is-highlighted'));
  }

  function startReply(message) {
    setReplyingTo(message);
    setReactionPickerId(null);
    requestAnimationFrame(() => composerRef.current?.focus());
  }

  function insertMention(member) {
    setDraft((current) => current.replace(/(^|\s)@[a-z0-9._]*$/i, `$1@${member.username} `));
    requestAnimationFrame(() => composerRef.current?.focus());
  }

  function updateDraft(value) {
    setDraft(value);
    socket.emit('channel:typing', { channelId: channel.id, typing: Boolean(value) });
    if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
    typingTimerRef.current = window.setTimeout(() => {
      socket.emit('channel:typing', { channelId: channel.id, typing: false });
    }, 1200);
  }

  async function loadOlder() {
    if (!messages[0] || loadingMore) return;
    const previousHeight = scrollerRef.current?.scrollHeight || 0;
    setLoadingMore(true);
    try {
      const result = await api.messages(channel.id, { before: messages[0].created_at });
      setMessages((current) => [...result.messages, ...current]);
      setHasMore(result.has_more);
      requestAnimationFrame(() => {
        if (scrollerRef.current) scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight - previousHeight;
      });
    } catch (error) {
      onToast(error.message, 'error');
    } finally {
      setLoadingMore(false);
    }
  }

  async function sendMessage() {
    const content = draft.trim();
    if ((!content && !pendingFiles.length) || sending || !canSendMessages) return;
    setSending(true);
    try {
      const uploaded = pendingFiles.length ? await api.uploadFiles(pendingFiles) : { attachments: [] };
      const result = await api.sendMessage(channel.id, content, replyingTo?.id || null, uploaded.attachments.map((item) => item.id));
      setMessages((current) => mergeMessage(current, result.message));
      setDraft('');
      setReplyingTo(null);
      setPendingFiles([]);
      setComposerEmojiOpen(false);
      socket.emit('channel:typing', { channelId: channel.id, typing: false });
      requestAnimationFrame(() => {
        if (scrollerRef.current) scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
      });
    } catch (error) {
      onToast(error.message, 'error');
    } finally {
      setSending(false);
    }
  }

  async function saveEdit(messageId) {
    const content = editContent.trim();
    if (!content) return;
    try {
      const result = await api.updateMessage(messageId, content);
      setMessages((current) => mergeMessage(current, result.message));
      setEditingId(null);
    } catch (error) {
      onToast(error.message, 'error');
    }
  }

  async function toggleReaction(messageId, emoji) {
    try {
      const result = await api.toggleReaction(messageId, emoji);
      setMessages((current) => mergeReaction(current, messageId, result.reaction));
      setReactionPickerId(null);
    } catch (error) {
      onToast(error.message, 'error');
    }
  }

  async function removeMessage(messageId) {
    try {
      await api.deleteMessage(messageId);
      setMessages((current) => current.filter((message) => message.id !== messageId));
    } catch (error) {
      onToast(error.message, 'error');
    }
  }

  async function reportMessage(message) {
    const reason = await dialog.prompt({
      title: 'Nachricht melden',
      message: 'Beschreibe kurz, warum diese Nachricht geprüft werden soll.',
      label: 'Grund der Meldung',
      placeholder: 'Grund eingeben …',
      required: true,
      confirmLabel: 'Meldung senden'
    });
    if (!reason) return;
    try {
      await api.report(channel.guild_id, { messageId: message.id, reportedUserId: message.author.id, reason });
      onToast('Nachricht wurde dem Moderationsteam gemeldet.', 'success');
    } catch (error) {
      onToast(error.message, 'error');
    }
  }

  if (!channel) return <div className="content-skeleton"><span /><span /><span /></div>;

  return (
    <section className="channel-view">
      <div className="messages-scroller" ref={scrollerRef}>
        {hasMore && (
          <button className="load-more" type="button" onClick={loadOlder} disabled={loadingMore}>
            {loadingMore ? <LoaderCircle className="spin" size={16} /> : null}
            Ältere Nachrichten laden
          </button>
        )}
        {!loading && messages.length === 0 && (
          <div className="channel-welcome">
            <div className="channel-welcome__icon"><Hash size={43} strokeWidth={2.4} /></div>
            <h1>Willkommen bei #{channel.name}!</h1>
            <p>Das ist der Anfang des Channels.</p>
            {!canReadHistory && <p className="channel-permission-note">Du darfst den bisherigen Nachrichtenverlauf nicht lesen.</p>}
          </div>
        )}
        {loading ? (
          <div className="message-loading"><LoaderCircle className="spin" size={24} />Nachrichten werden geladen …</div>
        ) : (
          <div className="messages-list">
            {renderedMessages.map(({ message, grouped, showDay }) => (
              <div key={message.id}>
                {showDay && <div className="message-day"><span>{messageDay(message.created_at)}</span></div>}
                <article
                  className={`message-row ${grouped ? 'is-grouped' : ''}`}
                  data-message-id={message.id}
                >
                  {!grouped && (
                    <button
                      className="message-avatar"
                      type="button"
                      aria-label={`Profil von ${authorName(message.author)} öffnen`}
                      onClick={() => onOpenProfile(message.author.id)}
                    >
                      {message.author.avatar_url
                        ? <img src={message.author.avatar_url} alt="" />
                        : authorName(message.author)[0].toUpperCase()}
                    </button>
                  )}
                  <div className="message-content">
                    {message.reply_to && (
                      <button
                        className="message-reply-reference"
                        type="button"
                        onClick={() => scrollToMessage(message.reply_to.id)}
                      >
                        <CornerUpLeft size={13} />
                        <strong>{authorName(message.reply_to.author)}</strong>
                        <span>{message.reply_to.content}</span>
                      </button>
                    )}
                    {!grouped && (
                      <div className="message-meta">
                        <button className="message-author-button" type="button" onClick={() => onOpenProfile(message.author.id)}>{authorName(message.author)}</button>
                        <time dateTime={message.created_at}>{messageTime(message.created_at)}</time>
                      </div>
                    )}
                    {editingId === message.id ? (
                      <div className="message-edit">
                        <textarea
                          value={editContent}
                          maxLength={2000}
                          autoFocus
                          aria-label="Nachricht bearbeiten"
                          onChange={(event) => setEditContent(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Escape') setEditingId(null);
                            if (event.key === 'Enter' && !event.shiftKey) {
                              event.preventDefault();
                              saveEdit(message.id);
                            }
                          }}
                        />
                        <button type="button" onClick={() => saveEdit(message.id)} aria-label="Änderung speichern"><Check size={17} /></button>
                        <button type="button" onClick={() => setEditingId(null)} aria-label="Bearbeiten abbrechen"><X size={17} /></button>
                      </div>
                    ) : <MessageText message={message} />}
                    {message.attachments?.length > 0 && (
                      <div className="message-attachments">
                        {message.attachments.map((attachment) => (
                          <a className={`message-attachment ${attachment.mime_type.startsWith('image/') ? 'is-image' : ''}`} href={attachment.url} target="_blank" rel="noreferrer" key={attachment.id}>
                            {attachment.mime_type.startsWith('image/') ? <img src={attachment.url} alt={attachment.name} /> : <FileText size={22} />}
                            <span>{attachment.name}</span>
                          </a>
                        ))}
                      </div>
                    )}
                    {(message.reactions || []).length > 0 && (
                      <div className="message-reactions" aria-label="Reaktionen">
                        {message.reactions.map((reaction) => (
                          <button
                            className={reaction.user_ids.includes(currentUserId) ? 'is-active' : ''}
                            type="button"
                            key={reaction.emoji}
                            onClick={() => toggleReaction(message.id, reaction.emoji)}
                            aria-label={`${reaction.emoji} ${reaction.count}`}
                          >
                            <span>{reaction.emoji}</span><strong>{reaction.count}</strong>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {editingId !== message.id && (
                    <div className="message-actions">
                      {canSendMessages && (
                        <>
                          <button type="button" aria-label="Antworten" onClick={() => startReply(message)}>
                            <CornerUpLeft size={15} />
                          </button>
                          <button
                            type="button"
                            aria-label="Reaktion hinzufügen"
                            onClick={() => setReactionPickerId((current) => current === message.id ? null : message.id)}
                          >
                            <SmilePlus size={15} />
                          </button>
                        </>
                      )}
                      {message.author.id === currentUserId && (
                        <button
                          type="button"
                          aria-label="Nachricht bearbeiten"
                          onClick={() => { setEditingId(message.id); setEditContent(message.content); }}
                        ><Pencil size={15} /></button>
                      )}
                      {(message.author.id === currentUserId || canManageMessages) && (
                        <button type="button" className="danger" aria-label="Nachricht löschen" onClick={() => removeMessage(message.id)}>
                          <Trash2 size={15} />
                        </button>
                      )}
                      {message.author.id !== currentUserId && (
                        <button type="button" aria-label="Nachricht melden" onClick={() => reportMessage(message)}><Flag size={15} /></button>
                      )}
                    </div>
                  )}
                  {reactionPickerId === message.id && (
                    <div className="reaction-picker" role="menu" aria-label="Reaktion auswählen">
                      {QUICK_REACTIONS.map((emoji) => (
                        <button type="button" role="menuitem" key={emoji} onClick={() => toggleReaction(message.id, emoji)}>
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}
                </article>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="composer-area">
        {typingUsers.size > 0 && <div className="typing-indicator">{typingUsers.size === 1 ? 'Ein Mitglied schreibt …' : `${typingUsers.size} Mitglieder schreiben …`}</div>}
        {mentionSuggestions.length > 0 && (
          <div className="mention-suggestions">
            <small>Mitglied erwähnen</small>
            {mentionSuggestions.map((member) => (
              <button type="button" key={member.user_id} onClick={() => insertMention(member)}>
                <span className="mini-avatar">
                  {member.avatar_url ? <img src={member.avatar_url} alt="" /> : authorName(member)[0].toUpperCase()}
                </span>
                <strong>{authorName(member)}</strong>
                <span>@{member.username}</span>
              </button>
            ))}
          </div>
        )}
        {replyingTo && (
          <div className="composer-reply">
            <CornerUpLeft size={15} />
            <span>Antwort an <strong>{authorName(replyingTo.author)}</strong></span>
            <button type="button" aria-label="Antwort abbrechen" onClick={() => setReplyingTo(null)}><X size={16} /></button>
          </div>
        )}
        {pendingFiles.length > 0 && <div className="pending-attachments">{pendingFiles.map((file, index) => <span key={`${file.name}-${index}`}>{file.name}<button type="button" onClick={() => setPendingFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}><X size={13} /></button></span>)}</div>}
        {composerEmojiOpen && <div className="emoji-picker">{QUICK_REACTIONS.map((emoji) => <button type="button" key={emoji} onClick={() => updateDraft(`${draft}${emoji}`)}>{emoji}</button>)}</div>}
        <div className="composer-shell">
          {canAttachFiles && <label className="composer-tool" title="Datei anhängen"><Paperclip size={19} /><input type="file" multiple hidden onChange={(event) => setPendingFiles([...event.target.files].slice(0, 5))} /></label>}
          <button className="composer-tool" type="button" title="Emoji auswählen" onClick={() => setComposerEmojiOpen((current) => !current)}><SmilePlus size={19} /></button>
          <textarea
            ref={composerRef}
            value={draft}
            maxLength={2000}
            rows={1}
            placeholder={canSendMessages ? `Nachricht an #${channel.name}` : 'Du darfst in diesem Channel nicht schreiben.'}
            aria-label={`Nachricht an #${channel.name}`}
            disabled={!canSendMessages}
            onChange={(event) => updateDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && replyingTo) {
                setReplyingTo(null);
                return;
              }
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                sendMessage();
              }
            }}
          />
          <span className={draft.length > 1800 ? 'character-count is-near-limit' : 'character-count'}>
            {draft.length > 1800 ? 2000 - draft.length : ''}
          </span>
          <button type="button" onClick={sendMessage} disabled={!canSendMessages || (!draft.trim() && !pendingFiles.length) || sending} aria-label="Nachricht senden">
            {sending ? <LoaderCircle className="spin" size={19} /> : <Send size={19} />}
          </button>
        </div>
      </div>
    </section>
  );
}
