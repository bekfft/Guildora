import { Download, ExternalLink, FileArchive, FileImage, FileText, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENT_COUNT = 5;
export const ATTACHMENT_ACCEPT = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif', 'image/heic', 'image/heif',
  'application/pdf', 'text/plain', 'text/csv', 'application/json',
  'audio/mpeg', 'audio/ogg', 'audio/webm', 'audio/mp4', 'audio/wav', 'video/mp4', 'video/webm',
  '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.zip', '.7z', '.rar'
].join(',');

function isImage(type = '') {
  return type.startsWith('image/');
}

function isArchive(attachment) {
  return /(?:zip|7z|rar|compressed)/i.test(`${attachment.mime_type || ''} ${attachment.name || ''}`);
}

export function formatFileSize(size = 0) {
  const bytes = Number(size) || 0;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

function fileTypeLabel(attachment) {
  const extension = attachment.name?.split('.').pop()?.toUpperCase();
  if (extension && extension.length <= 5) return extension;
  if (attachment.mime_type === 'application/pdf') return 'PDF';
  return 'DATEI';
}

function FileIcon({ attachment, size = 26 }) {
  if (isImage(attachment.mime_type)) return <FileImage size={size} />;
  if (isArchive(attachment)) return <FileArchive size={size} />;
  return <FileText size={size} />;
}

export function appendSelectedFiles(event, currentFiles, onToast) {
  const selected = [...(event.target.files || [])];
  event.target.value = '';
  const usable = selected.filter((file) => {
    if (file.size <= MAX_ATTACHMENT_BYTES) return true;
    onToast?.(`${file.name} ist größer als 10 MB.`, 'error');
    return false;
  });
  const unique = [...currentFiles];
  for (const file of usable) {
    if (!unique.some((item) => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified)) unique.push(file);
  }
  if (unique.length > MAX_ATTACHMENT_COUNT) onToast?.('Du kannst höchstens fünf Dateien gleichzeitig senden.', 'error');
  return unique.slice(0, MAX_ATTACHMENT_COUNT);
}

export function PendingAttachments({ files, onRemove }) {
  const [previews, setPreviews] = useState([]);

  useEffect(() => {
    let active = true;
    Promise.all(files.map((file) => new Promise((resolve) => {
      if (!isImage(file.type)) return resolve({ file, url: null });
      const reader = new FileReader();
      reader.onload = () => resolve({ file, url: String(reader.result || '') });
      reader.onerror = () => resolve({ file, url: null });
      reader.readAsDataURL(file);
    }))).then((next) => active && setPreviews(next));
    return () => { active = false; };
  }, [files]);

  return (
    <div className="pending-attachments" aria-label="Ausgewählte Anhänge">
      {previews.map(({ file, url }, index) => (
        <article className={url ? 'pending-attachment is-image' : 'pending-attachment'} key={`${file.name}-${file.size}-${file.lastModified}`}>
          {url ? <img src={url} alt={`Vorschau von ${file.name}`} /> : <FileIcon attachment={{ name: file.name, mime_type: file.type }} />}
          <div>
            <strong title={file.name}>{file.name}</strong>
            <span>{fileTypeLabel({ name: file.name, mime_type: file.type })} · {formatFileSize(file.size)}</span>
          </div>
          <button type="button" aria-label={`${file.name} entfernen`} onClick={() => onRemove(index)}><X size={16} /></button>
        </article>
      ))}
    </div>
  );
}

export function MessageAttachment({ attachment }) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const image = isImage(attachment.mime_type) && !imageFailed;
  const downloadUrl = `${attachment.url}${attachment.url.includes('?') ? '&' : '?'}download=1`;

  useEffect(() => {
    if (!lightboxOpen) return undefined;
    const close = (event) => event.key === 'Escape' && setLightboxOpen(false);
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [lightboxOpen]);

  if (image) {
    return (
      <>
        <button className="message-image-attachment" type="button" onClick={() => setLightboxOpen(true)} aria-label={`${attachment.name} vergrößern`}>
          <img src={attachment.url} alt={attachment.name} loading="lazy" onError={() => setImageFailed(true)} />
          <span>{attachment.name}</span>
        </button>
        {lightboxOpen && createPortal(
          <div className="attachment-lightbox" role="dialog" aria-modal="true" aria-label={`Bildvorschau ${attachment.name}`} onMouseDown={(event) => event.target === event.currentTarget && setLightboxOpen(false)}>
            <button className="attachment-lightbox__close" type="button" aria-label="Bildvorschau schließen" onClick={() => setLightboxOpen(false)}><X size={24} /></button>
            <img src={attachment.url} alt={attachment.name} />
            <footer>
              <div><strong>{attachment.name}</strong><span>{formatFileSize(attachment.size_bytes)}</span></div>
              <a href={downloadUrl} download={attachment.name}><Download size={18} /> Herunterladen</a>
            </footer>
          </div>,
          document.body
        )}
      </>
    );
  }

  return (
    <article className="message-file-attachment">
      <span className="message-file-attachment__icon"><FileIcon attachment={attachment} /></span>
      <div>
        <strong title={attachment.name}>{attachment.name}</strong>
        <span>{fileTypeLabel(attachment)} · {formatFileSize(attachment.size_bytes)}</span>
      </div>
      <a href={attachment.url} target="_blank" rel="noreferrer" aria-label={`${attachment.name} öffnen`} title="Öffnen"><ExternalLink size={17} /></a>
      <a href={downloadUrl} download={attachment.name} aria-label={`${attachment.name} herunterladen`} title="Herunterladen"><Download size={17} /></a>
    </article>
  );
}
