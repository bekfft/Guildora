import { db } from '../db/index.js';
import { ApiError } from '../middleware/errorHandler.js';

export async function guildImageUrl(userId, attachmentId) {
  if (attachmentId === undefined) return undefined;
  if (attachmentId === null) return null;
  const attachment = await db.get(
    `SELECT id, mime_type FROM attachments
     WHERE id = ? AND owner_id = ? AND message_id IS NULL AND dm_message_id IS NULL`,
    [attachmentId, userId]
  );
  if (!attachment || !attachment.mime_type.startsWith('image/')) {
    throw new ApiError(400, 'INVALID_GUILD_IMAGE', 'Das Serverlogo muss ein eigener Bild-Upload sein.');
  }
  return `/api/uploads/${attachment.id}`;
}
