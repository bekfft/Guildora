import { LoaderCircle, Mic, Paperclip, Send, SmilePlus, Square, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { bindComposerViewport } from '../lib/composerViewport.js';
import { socket } from '../lib/socket.js';
import { appendSelectedFiles, ATTACHMENT_ACCEPT, MessageAttachment, PendingAttachments } from './MessageAttachment.jsx';

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
  if (attachment.is_voice_message) {
    const waveform = attachment.waveform?.length ? attachment.waveform : Array.from({ length: 32 }, (_, index) => 24 + ((index * 17) % 58));
    return <div className="voice-message"><audio controls preload="metadata" src={attachment.url} /><div className="voice-message__waveform" aria-hidden="true">{waveform.map((height, index) => <i style={{ height: `${height}%` }} key={index} />)}</div><time>{formatDuration(attachment.duration_ms)}</time></div>;
  }
  return <MessageAttachment attachment={attachment} />;
}

function formatDuration(durationMs = 0) {
  const total = Math.max(0, Math.round(durationMs / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function LinkPreview({ preview }) {
  return (
    <a className="message-link-preview" href={preview.url} target="_blank" rel="noreferrer">
      <span>{preview.site_name}</span>
      <strong>{preview.title || preview.url}</strong>
      {preview.description && <p>{preview.description}</p>}
      <small>{new URL(preview.url).hostname}</small>
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
  const [recording, setRecording] = useState(false);
  const [recordingMs, setRecordingMs] = useState(0);
  const [pendingVoice, setPendingVoice] = useState(null);
  const typingTimer = useRef(null);
  const scroller = useRef(null);
  const recorderRef = useRef(null);
  const recordingTimerRef = useRef(null);
  const recordingStartedRef = useRef(0);
  const recordingChunksRef = useRef([]);
  const waveformRef = useRef([]);

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

  useEffect(() => bindComposerViewport(composer.current, scroller.current), [conversation?.id]);

  useEffect(() => () => {
    if (recordingTimerRef.current) window.clearInterval(recordingTimerRef.current);
    recorderRef.current?.stream?.getTracks().forEach((track) => track.stop());
    if (pendingVoice?.url) URL.revokeObjectURL(pendingVoice.url);
  }, [conversation?.id, pendingVoice?.url]);

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

  async function startVoiceRecording() {
    if (recording || pendingVoice) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus']
        .find((type) => window.MediaRecorder?.isTypeSupported(type)) || '';
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recordingChunksRef.current = [];
      waveformRef.current = [];
      recordingStartedRef.current = Date.now();
      recorder.ondataavailable = (event) => event.data.size && recordingChunksRef.current.push(event.data);
      recorder.onstop = () => {
        const durationMs = Math.max(250, Date.now() - recordingStartedRef.current);
        const type = recorder.mimeType || 'audio/webm';
        const blob = new Blob(recordingChunksRef.current, { type });
        setPendingVoice({
          file: new File([blob], `sprachnachricht-${Date.now()}.${type.includes('ogg') ? 'ogg' : 'webm'}`, { type }),
          url: URL.createObjectURL(blob),
          durationMs,
          waveform: waveformRef.current.length ? waveformRef.current.slice(-48) : Array.from({ length: 32 }, (_, index) => 24 + ((index * 17) % 58))
        });
        stream.getTracks().forEach((track) => track.stop());
      };
      recorderRef.current = recorder;
      recorder.start(250);
      setRecording(true);
      setRecordingMs(0);
      recordingTimerRef.current = window.setInterval(() => {
        const elapsed = Date.now() - recordingStartedRef.current;
        setRecordingMs(elapsed);
        waveformRef.current.push(18 + Math.round(Math.random() * 78));
        if (elapsed >= 300000) {
          window.clearInterval(recordingTimerRef.current);
          recordingTimerRef.current = null;
          setRecording(false);
          if (recorder.state === 'recording') recorder.stop();
        }
      }, 180);
    } catch (error) {
      onToast(error.name === 'NotAllowedError' ? 'Mikrofonzugriff wurde nicht erlaubt.' : 'Das Mikrofon konnte nicht gestartet werden.', 'error');
    }
  }

  function stopVoiceRecording() {
    if (!recording) return;
    if (recordingTimerRef.current) window.clearInterval(recordingTimerRef.current);
    recordingTimerRef.current = null;
    setRecording(false);
    recorderRef.current?.stop();
  }

  function discardVoice() {
    if (pendingVoice?.url) URL.revokeObjectURL(pendingVoice.url);
    setPendingVoice(null);
  }

  async function sendVoiceMessage() {
    if (!pendingVoice || sending) return;
    setSending(true);
    try {
      const uploaded = await api.uploadFiles([pendingVoice.file]);
      const attachmentId = uploaded.attachments[0].id;
      const result = await api.sendDm(conversation.id, '', [attachmentId], {
        attachmentId,
        durationMs: Math.min(300000, pendingVoice.durationMs),
        waveform: pendingVoice.waveform.map((value) => Math.max(1, Math.min(100, Math.round(value))))
      });
      setMessages((current) => current.some((item) => item.id === result.message.id) ? current : [...current, result.message]);
      discardVoice();
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
                {message.link_previews?.map((preview) => <LinkPreview preview={preview} key={preview.id} />)}
              </div>
            </article>
          ))}
          {readMessageId && messages.at(-1)?.id === readMessageId && messages.at(-1)?.author.id === currentUserId && <div className="dm-read-receipt">Gelesen</div>}
        </div>
      </div>
      <div className="composer-area">
        {typingUsers.size > 0 && <div className="typing-indicator">{nameOf(conversation.user)} schreibt …</div>}
        {pendingFiles.length > 0 && <PendingAttachments files={pendingFiles} onRemove={(index) => setPendingFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))} />}
        {recording && <div className="voice-recorder is-recording"><span><i /> Aufnahme läuft</span><time>{formatDuration(recordingMs)}</time><button type="button" onClick={stopVoiceRecording}><Square size={14} fill="currentColor" /> Aufnahme beenden</button></div>}
        {pendingVoice && <div className="voice-recorder is-ready"><audio controls src={pendingVoice.url} /><time>{formatDuration(pendingVoice.durationMs)}</time><button type="button" className="is-cancel" onClick={discardVoice}><Trash2 size={15} /> Verwerfen</button><button type="button" className="is-send" onClick={sendVoiceMessage} disabled={sending}><Send size={15} /> Senden</button></div>}
        {emojiOpen && <div className="emoji-picker">{EMOJIS.map((emoji) => <button type="button" key={emoji} onClick={() => updateDraft(`${draft}${emoji}`)}>{emoji}</button>)}</div>}
        <div className="composer-shell">
          <label className="composer-tool" title="Datei anhängen"><Paperclip size={19} /><input type="file" multiple hidden accept={ATTACHMENT_ACCEPT} onChange={(event) => setPendingFiles((current) => appendSelectedFiles(event, current, onToast))} /></label>
          <button className="composer-tool" type="button" title="Emoji" onClick={() => setEmojiOpen((current) => !current)}><SmilePlus size={19} /></button>
          <button className={`composer-tool ${recording ? 'is-recording' : ''}`} type="button" title="Sprachnachricht aufnehmen" onClick={recording ? stopVoiceRecording : startVoiceRecording} disabled={Boolean(pendingVoice)}><Mic size={19} /></button>
          <textarea ref={composer} value={draft} maxLength={2000} rows={1} placeholder="Nachricht schreiben …" onChange={(event) => updateDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(); } }} />
          <button type="button" onClick={send} disabled={sending || (!draft.trim() && !pendingFiles.length)}>{sending ? <LoaderCircle className="spin" size={19} /> : <Send size={19} />}</button>
        </div>
      </div>
    </section>
  );
}
