import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import { db } from '../db/index.js';
import { ApiError } from '../middleware/errorHandler.js';
import { requireChannelPermission } from '../utils/channelPermissions.js';
import { requireNotTimedOut } from '../utils/moderation.js';

function liveKitConfig() {
  const url = process.env.LIVEKIT_URL?.trim();
  const apiKey = process.env.LIVEKIT_API_KEY?.trim();
  const apiSecret = process.env.LIVEKIT_API_SECRET?.trim();
  if (!url || !apiKey || !apiSecret) return null;

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new ApiError(503, 'VOICE_CONFIGURATION_INVALID', 'Voice ist auf diesem Server noch nicht korrekt konfiguriert.');
  }
  if (!['ws:', 'wss:'].includes(parsed.protocol)) {
    throw new ApiError(503, 'VOICE_CONFIGURATION_INVALID', 'Die Voice-Adresse muss eine WebSocket-Adresse sein.');
  }
  if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'wss:') {
    throw new ApiError(503, 'VOICE_CONFIGURATION_INVALID', 'Voice benötigt in Produktion eine verschlüsselte Verbindung.');
  }
  return { url: parsed.toString(), apiKey, apiSecret };
}

function liveKitHttpUrl(websocketUrl) {
  const parsed = new URL(websocketUrl);
  parsed.protocol = parsed.protocol === 'wss:' ? 'https:' : 'http:';
  return parsed.toString();
}

function voiceRoomName(guildId, channelId) {
  return `guildora-${guildId}-${channelId}`;
}

export async function getVoiceStatus(req, res) {
  let available = false;
  try {
    available = Boolean(liveKitConfig());
  } catch {
    available = false;
  }
  return res.json({
    provider: 'livekit',
    available
  });
}

export async function createVoiceToken(req, res) {
  const permissions = await requireChannelPermission(req.params.channelId, req.userId, 'viewChannel');
  if (permissions.channelType !== 'voice') {
    throw new ApiError(400, 'NOT_A_VOICE_CHANNEL', 'Dieser Channel ist kein Sprachkanal.');
  }
  await requireNotTimedOut(permissions.guildId, req.userId);

  const config = liveKitConfig();
  if (!config) {
    throw new ApiError(
      503,
      'VOICE_UNAVAILABLE',
      'Voice ist noch nicht freigeschaltet. Bitte hinterlege zuerst die LiveKit-Verbindung.'
    );
  }

  const participant = await db.get(
    `SELECT u.id, u.username, u.display_name, u.avatar_url, gm.nickname
     FROM users u
     JOIN guild_members gm ON gm.user_id = u.id AND gm.guild_id = ?
     WHERE u.id = ?`,
    [permissions.guildId, req.userId]
  );
  if (!participant) {
    throw new ApiError(403, 'NOT_MEMBER', 'Du bist kein Mitglied dieses Servers.');
  }

  const roomName = voiceRoomName(permissions.guildId, req.params.channelId);
  const displayName = participant.nickname || participant.display_name || participant.username;
  const accessToken = new AccessToken(config.apiKey, config.apiSecret, {
    identity: participant.id,
    name: displayName,
    ttl: '10m',
    metadata: JSON.stringify({
      username: participant.username,
      avatarUrl: participant.avatar_url || null,
      channelId: req.params.channelId,
      guildId: permissions.guildId
    })
  });
  accessToken.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canSubscribe: true,
    canPublishData: false
  });

  return res.status(201).json({
    url: config.url,
    token: await accessToken.toJwt(),
    room: {
      name: roomName,
      guild_id: permissions.guildId,
      channel_id: req.params.channelId
    },
    participant: {
      id: participant.id,
      username: participant.username,
      display_name: displayName,
      avatar_url: participant.avatar_url
    }
  });
}

export async function getVoiceParticipants(req, res) {
  const permissions = await requireChannelPermission(req.params.channelId, req.userId, 'viewChannel');
  if (permissions.channelType !== 'voice') {
    throw new ApiError(400, 'NOT_A_VOICE_CHANNEL', 'Dieser Channel ist kein Sprachkanal.');
  }

  const config = liveKitConfig();
  if (!config) {
    throw new ApiError(503, 'VOICE_UNAVAILABLE', 'Voice ist auf diesem Server noch nicht freigeschaltet.');
  }

  const roomService = new RoomServiceClient(
    liveKitHttpUrl(config.url),
    config.apiKey,
    config.apiSecret
  );
  const roomName = voiceRoomName(permissions.guildId, req.params.channelId);
  let participants;
  try {
    participants = await roomService.listParticipants(roomName);
  } catch (error) {
    if (error?.code === 5 || error?.status === 404) participants = [];
    else throw new ApiError(502, 'VOICE_PROVIDER_ERROR', 'Der Voice-Raum konnte nicht abgefragt werden.');
  }

  return res.json({
    participants: participants.map((participant) => {
      let metadata = {};
      try {
        metadata = JSON.parse(participant.metadata || '{}');
      } catch {
        metadata = {};
      }
      const microphoneTracks = participant.tracks.filter((track) => track.source === 2);
      return {
        id: participant.identity,
        name: participant.name || metadata.username || 'Unbekannt',
        username: metadata.username || null,
        avatar_url: metadata.avatarUrl || null,
        is_local: participant.identity === req.userId,
        is_speaking: false,
        is_muted: microphoneTracks.length === 0 || microphoneTracks.every((track) => track.muted),
        connection_quality: 'unknown'
      };
    })
  });
}
