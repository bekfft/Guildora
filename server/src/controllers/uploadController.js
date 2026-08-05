import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { resolveServerDataPath } from '../config/dataPaths.js';
import { db } from '../db/index.js';
import { ApiError } from '../middleware/errorHandler.js';
import { requireChannelPermission } from '../utils/channelPermissions.js';

const uploadRoot = resolveServerDataPath(process.env.UPLOAD_DIR, 'uploads');
fs.mkdirSync(uploadRoot, { recursive: true });

const allowedTypes = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif', 'image/heic', 'image/heif',
  'application/pdf', 'text/plain', 'text/csv', 'application/json',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip', 'application/x-7z-compressed', 'application/vnd.rar', 'application/x-rar-compressed',
  'audio/mpeg', 'audio/ogg', 'audio/webm', 'audio/mp4', 'audio/wav',
  'video/mp4', 'video/webm'
]);

const allowedExtensions = new Map([
  ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'], ['.png', 'image/png'], ['.gif', 'image/gif'], ['.webp', 'image/webp'],
  ['.pdf', 'application/pdf'],
  ['.txt', 'text/plain'], ['.csv', 'text/csv'], ['.json', 'application/json'],
  ['.doc', 'application/msword'], ['.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ['.xls', 'application/vnd.ms-excel'], ['.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  ['.ppt', 'application/vnd.ms-powerpoint'], ['.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  ['.zip', 'application/zip'], ['.7z', 'application/x-7z-compressed'], ['.rar', 'application/vnd.rar'],
  ['.heic', 'image/heic'], ['.heif', 'image/heif'], ['.avif', 'image/avif'],
  ['.mp3', 'audio/mpeg'], ['.ogg', 'audio/ogg'], ['.wav', 'audio/wav'], ['.webm', 'video/webm'], ['.mp4', 'video/mp4']
]);

function normalizeOriginalName(value) {
  const decoded = Buffer.from(value, 'latin1').toString('utf8');
  return decoded.includes('\uFFFD') ? value : decoded;
}

export const attachmentUpload = multer({
  storage: multer.diskStorage({
    destination: uploadRoot,
    filename: (_req, file, callback) => callback(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase().slice(0, 10)}`)
  }),
  limits: { fileSize: 10 * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, callback) => {
    file.originalname = normalizeOriginalName(file.originalname);
    const fallbackType = allowedExtensions.get(path.extname(file.originalname).toLowerCase());
    if ((!file.mimetype || file.mimetype === 'application/octet-stream') && fallbackType) file.mimetype = fallbackType;
    const allowed = allowedTypes.has(file.mimetype);
    callback(allowed ? null : new ApiError(400, 'INVALID_FILE_TYPE', 'Dieser Dateityp ist nicht erlaubt.'), allowed);
  }
});

export async function createUploads(req, res) {
  if (!req.files?.length) throw new ApiError(400, 'NO_FILES', 'Bitte wähle mindestens eine Datei aus.');
  const attachments = [];
  for (const file of req.files) {
    const id = crypto.randomUUID();
    await db.run(
      `INSERT INTO attachments
       (id, owner_id, stored_name, original_name, mime_type, size_bytes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, req.userId, file.filename, file.originalname.slice(0, 255), file.mimetype, file.size]
    );
    attachments.push({
      id,
      name: file.originalname,
      mime_type: file.mimetype,
      size_bytes: file.size,
      url: `/api/uploads/${id}`
    });
  }
  return res.status(201).json({ attachments });
}

export async function getUpload(req, res) {
  const attachment = await db.get('SELECT * FROM attachments WHERE id = ?', [req.params.id]);
  if (!attachment) throw new ApiError(404, 'ATTACHMENT_NOT_FOUND', 'Dieser Anhang wurde nicht gefunden.');
  if (attachment.message_id) {
    const message = await db.get('SELECT channel_id FROM messages WHERE id = ?', [attachment.message_id]);
    if (!message) throw new ApiError(404, 'ATTACHMENT_NOT_FOUND', 'Dieser Anhang wurde nicht gefunden.');
    await requireChannelPermission(message.channel_id, req.userId, 'viewChannel');
  } else if (attachment.dm_message_id) {
    const allowed = await db.get(
      `SELECT 1 AS allowed FROM dm_messages m JOIN dm_members dm ON dm.conversation_id = m.conversation_id
       WHERE m.id = ? AND dm.user_id = ?`,
      [attachment.dm_message_id, req.userId]
    );
    if (!allowed) throw new ApiError(403, 'ATTACHMENT_FORBIDDEN', 'Du darfst diesen Anhang nicht öffnen.');
  } else if (attachment.owner_id !== req.userId) {
    const profileAsset = await db.get(
      `SELECT 1 AS allowed
       FROM users u
       LEFT JOIN user_profiles p ON p.user_id = u.id
       LEFT JOIN guild_member_profiles gp ON gp.user_id = u.id
       WHERE u.avatar_url = ? OR p.banner_url = ? OR gp.avatar_url = ? OR gp.banner_url = ?
       LIMIT 1`,
      Array(4).fill(`/api/uploads/${attachment.id}`)
    );
    const guildAsset = await db.get(
      `SELECT 1 AS allowed FROM guilds
       WHERE icon_url = ? OR banner_url = ?
       LIMIT 1`,
      [`/api/uploads/${attachment.id}`, `/api/uploads/${attachment.id}`]
    );
    if (!profileAsset && !guildAsset) {
      throw new ApiError(403, 'ATTACHMENT_FORBIDDEN', 'Du darfst diesen Anhang nicht öffnen.');
    }
  }
  const filePath = path.join(uploadRoot, attachment.stored_name);
  if (!fs.existsSync(filePath)) throw new ApiError(404, 'ATTACHMENT_FILE_MISSING', 'Die Datei ist nicht mehr verfügbar.');
  res.setHeader('Content-Type', attachment.mime_type);
  res.setHeader('Cache-Control', 'private, max-age=3600');
  const disposition = req.query.download === '1' ? 'attachment' : 'inline';
  res.setHeader('Content-Disposition', `${disposition}; filename*=UTF-8''${encodeURIComponent(attachment.original_name)}`);
  return res.sendFile(filePath);
}
