import { ArrowLeft, Camera, Link2, PlusCircle, Server } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../components/Button.jsx';
import TextField from '../components/TextField.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useGuilds } from '../context/GuildContext.jsx';
import { api } from '../lib/api.js';
import Modal from './Modal.jsx';

export default function GuildModal({ onClose, onToast }) {
  const { user } = useAuth();
  const { createGuild, joinGuild } = useGuilds();
  const navigate = useNavigate();
  const [step, setStep] = useState('choose');
  const [name, setName] = useState(`Servers von ${user.display_name || user.username}`);
  const [slug, setSlug] = useState('');
  const [iconFile, setIconFile] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const preview = useMemo(() => iconFile ? URL.createObjectURL(iconFile) : null, [iconFile]);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  async function handleCreate(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const uploaded = iconFile ? await api.uploadFiles([iconFile]) : null;
      const result = await createGuild({
        name,
        ...(uploaded ? { iconAttachmentId: uploaded.attachments[0].id } : {})
      });
      onClose();
      navigate(`/app/channels/${result.guild.id}/${result.channel.id}`);
      onToast('Dein Server wurde erstellt.', 'success');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleJoin(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const normalized = slug.trim().split('/').filter(Boolean).pop()?.toLowerCase();
      const result = await api.discoverGuilds(`?q=${encodeURIComponent(normalized || '')}`);
      const guild = result.guilds.find((item) => item.slug === normalized);
      if (!guild) throw new Error('Unter diesem Slug wurde kein öffentlicher Server gefunden.');
      if (guild.is_member) {
        onClose();
        navigate(`/app/channels/${guild.id}`);
        return;
      }
      const joined = await joinGuild(guild);
      onClose();
      navigate(`/app/channels/${guild.id}/${joined.channel.id}`);
      onToast(`Du bist ${guild.name} beigetreten.`, 'success');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal title={step === 'choose' ? 'Dein Platz auf Guildora' : step === 'create' ? 'Server erstellen' : 'Server beitreten'} onClose={onClose}>
      {step === 'choose' && (
        <div className="guild-modal-choice">
          <p>Starte etwas Eigenes oder finde eine bestehende Community.</p>
          <button type="button" onClick={() => setStep('create')}><span><Server size={26} /></span><strong>Eigenen Server erstellen</strong><PlusCircle size={20} /></button>
          <div>Hast du eine Einladung? <button type="button" onClick={() => setStep('join')}>Server beitreten</button></div>
        </div>
      )}
      {step === 'create' && (
        <form className="guild-modal-form" onSubmit={handleCreate}>
          <label className="icon-upload">
            <input type="file" accept="image/*" onChange={(event) => {
              const file = event.target.files?.[0];
              setIconFile(file || null);
            }} />
            {preview ? <img src={preview} alt="Lokale Icon-Vorschau" /> : <><Camera size={26} /><span>Icon</span></>}
          </label>
          <TextField id="guild-name" label="Servername" value={name} error={error} onChange={(event) => setName(event.target.value)} autoFocus />
          <div className="modal-actions"><Button type="button" variant="ghost" onClick={() => setStep('choose')}><ArrowLeft size={17} /> Zurück</Button><Button type="submit" loading={loading} disabled={name.trim().length < 2}>Erstellen</Button></div>
        </form>
      )}
      {step === 'join' && (
        <form className="guild-modal-form" onSubmit={handleJoin}>
          <div className="modal-symbol"><Link2 size={30} /></div>
          <TextField id="guild-slug" label="Einladungslink oder Server-Slug" value={slug} error={error} onChange={(event) => setSlug(event.target.value)} placeholder="guildora-official" autoFocus />
          <div className="modal-actions"><Button type="button" variant="ghost" onClick={() => setStep('choose')}><ArrowLeft size={17} /> Zurück</Button><Button type="submit" loading={loading} disabled={!slug.trim()}>Beitreten</Button></div>
        </form>
      )}
    </Modal>
  );
}
