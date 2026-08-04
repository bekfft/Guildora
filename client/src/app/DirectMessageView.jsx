import { FileText, Image, LoaderCircle, Paperclip, Send, SmilePlus, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { socket } from '../lib/socket.js';

const EMOJIS = ['😀', '😂', '😍', '👍', '❤️', '🎉', '🔥', '👀', '🙏', '✅', '🤝', '💬', '🚀', '✨', '😎', '🤔'];

function nameOf(user) {
  return user?.display_name || user?.username || 'Direktnachricht';
}

function fitComposer(field) {
  if (!field) return;
  field.style.height = 'auto';
  const height = Math.min(160, Math.max(36, field.scrollHeight));
  field.style.height = `${height}px`;
  field.style.overflowY = field.scrollHeight > 160 ? 'auto' : 'hidden';
}

function Attachment({ attachment }) {
  const image = attachment.mime_type?.startsWith('image/');
  return (
    <a className={`message-attachment ${image ? 'is-image' : ''}`} href={attachment.url} target="_blank" rel="noreferrer">
      {image ? <img src={attachment.url} alt={attachment.name} /> : <FileText size={22} />}
      <span>{attachment.name}</span>
    </a>
  );
}

export default function DirectMessageView({ conversation, currentUserId, onOpenProfile, onToast, onRefresh }) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const composer = useRef(null);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [sending, setSending] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [typingUsers, setTypingUsers] = useState(new Set());
  const [readMessageId, setReadMessageId] = useState(null);
  const typingTimer = useRef(null);
  const scroller = useRef(null);

  useEffect(() => {
    if (!conversation?.id) return undefined;
    let active = true;
    setMessages([]);
    api.dmMessages(conversation.id).then((result) => {
      if (!active) return;
      setMessages(result.messages);
      setReadMessageId(result.read_by?.[0]?.last_read_message_id || null);
      api.markDmRead(conversation.id).then(() => onRefresh?.()).catch(() => {});
    }).catch((error) => onToast(error.message, 'error'));
    const onMessage = ({ message }) => {
      if (message.conversation_id !== conversation.id) return;
      setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
      if (message.author.id !== currentUserId) api.markDmRead(conversation.id).then(() => onRefresh?.()).catch(() => {});
    };
    const onTyping = ({ conversationId, userId, typing }) => {
      if (conversationId !== conversation.id) return;
      setTypingUsers((current) => {
        const next = new Set(current);
        if (typing) next.add(userId); else next.delete(userId);
        return next;
      });
    };
    const onRead = ({ conversationId, userId, messageId }) => {
      if (conversationId === conversation.id && userId !== currentUserId) setReadMessageId(messageId);
    };
    const join = () => socket.emit('dm:join', { conversationId: conversation.id });
    socket.on('dm:message', onMessage);
    socket.on('dm:typing', onTyping);
    socket.on('dm:read', onRead);
    socket.on('connect', join);
    if (!socket.connected) socket.connect(); else join();
    return () => {
      active = false;
      socket.emit('dm:typing', { conversationId: conversation.id, typing: false });
      socket.off('dm:message', onMessage);
      socket.off('dm:typing', onTyping);
      socket.off('dm:read', onRead);
      socket.off('connect', join);
    };
  }, [conversation?.id, currentUserId, onRefresh, onToast]);

  useEffect(() => {
    requestAnimationFrame(() => {
      if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
    });
  }, [messages.length]);

  useEffect(() => {
    fitComposer(composer.current);
  }, [draft, conversation?.id]);

  function updateDraft(value) {
    setDraft(value);
    if (!conversation?.id) return;
    socket.emit('dm:typing', { conversationId: conversation.id, typing: Boolean(value) });
    if (typingTimer.current) window.clearTimeout(typingTimer.current);
    typingTimer.current = window.setTimeout(() => {
      socket.emit('dm:typing', { conversationId: conversation.id, typing: false });
    }, 1200);
  }

  async function send() {
    if ((!draft.trim() && !pendingFiles.length) || sending) return;
    setSending(true);
    try {
      const uploaded = pendingFiles.length ? await api.uploadFiles(pendingFiles) : { attachments: [] };
      const result = await api.sendDm(conversation.id, draft.trim(), uploaded.attachments.map((item) => item.id));
      setMessages((current) => current.some((item) => item.id === result.message.id) ? current : [...current, result.message]);
      setDraft('');
      setPendingFiles([]);
      setEmojiOpen(false);
      socket.emit('dm:typing', { conversationId: conversation.id, typing: false });
      onRefresh?.();
    } catch (error) {
      onToast(error.message, 'error');
    } finally {
      setSending(false);
    }
  }

  if (!conversation) return <div className="content-skeleton"><span /><span /><span /></div>;
  return (
    <section className="channel-view dm-view">
      <div className="messages-scroller" ref={scroller}>
        <div className="dm-welcome">
          <button className="friend-avatar" type="button" onClick={() => onOpenProfile(conversation.user.id)}>
            {conversation.user.avatar_url ? <img src={conversation.user.avatar_url} alt="" /> : nameOf(conversation.user)[0].toUpperCase()}
          </button>
          <button className="dm-profile-name" type="button" onClick={() => onOpenProfile(conversation.user.id)}>{nameOf(conversation.user)}</button>
          <p>Das ist der Beginn eurer Direktnachrichten.</p>
        </div>
        <div className="messages-list">
          {messages.map((message) => (
            <article className="message-row" key={message.id}>
              <button className="message-avatar" type="button" onClick={() => onOpenProfile(message.author.id)} aria-label={`Profil von ${nameOf(message.author)} öffnen`}>
                {message.author.avatar_url ? <img src={message.author.avatar_url} alt="" /> : nameOf(message.author)[0].toUpperCase()}
              </button>
              <div className="message-content">
                <div className="message-meta"><button className="message-author-button" type="button" onClick={() => onOpenProfile(message.author.id)}>{nameOf(message.author)}</button><time>{new Date(message.created_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</time></div>
                {message.content && <p>{message.content}</p>}
                {message.attachments?.length > 0 && <div className="message-attachments">{message.attachments.map((item) => <Attachment attachment={item} key={item.id} />)}</div>}
              </div>
            </article>
          ))}
          {readMessageId && messages.at(-1)?.id === readMessageId && messages.at(-1)?.author.id === currentUserId && <div className="dm-read-receipt">Gelesen</div>}
        </div>
      </div>
      <div className="composer-area">
        {typingUsers.size > 0 && <div className="typing-indicator">{nameOf(conversation.user)} schreibt …</div>}
        {pendingFiles.length > 0 && <div className="pending-attachments">{pendingFiles.map((file, index) => <span key={`${file.name}-${index}`}>{file.name}<button type="button" onClick={() => setPendingFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}><X size={13} /></button></span>)}</div>}
        {emojiOpen && <div className="emoji-picker">{EMOJIS.map((emoji) => <button type="button" key={emoji} onClick={() => updateDraft(`${draft}${emoji}`)}>{emoji}</button>)}</div>}
        <div className="composer-shell">
          <label className="composer-tool" title="Datei anhängen"><Paperclip size={19} /><input type="file" multiple hidden onChange={(event) => setPendingFiles([...event.target.files].slice(0, 5))} /></label>
          <button className="composer-tool" type="button" title="Emoji" onClick={() => setEmojiOpen((current) => !current)}><SmilePlus size={19} /></button>
          <textarea ref={composer} value={draft} maxLength={2000} rows={1} placeholder="Nachricht schreiben …" onChange={(event) => updateDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(); } }} />
          <button type="button" onClick={send} disabled={sending || (!draft.trim() && !pendingFiles.length)}>{sending ? <LoaderCircle className="spin" size={19} /> : <Send size={19} />}</button>
        </div>
      </div>
    </section>
  );
}
