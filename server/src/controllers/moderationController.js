import crypto from 'node:crypto';
import { db } from '../db/index.js';
import { ApiError } from '../middleware/errorHandler.js';
import { emitGuildRefresh, emitGuildRemoved, emitToUsers } from '../realtime.js';
import { requirePermission } from './guildAdminController.js';
import {
  moderationSchema,
  reportActionSchema,
  reportSchema,
  timeoutSchema
} from '../validation/socialSchemas.js';

async function membership(guildId, userId) {
  return db.get('SELECT * FROM guild_members WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
}

async function audit(guildId, actorId, action, targetUserId = null, details = null) {
  await db.run(
    'INSERT INTO guild_audit_logs (id, guild_id, actor_id, action, target_user_id, details) VALUES (?, ?, ?, ?, ?, ?)',
    [crypto.randomUUID(), guildId, actorId, action, targetUserId, details ? JSON.stringify(details) : null]
  );
}

export async function listModeration(req, res) {
  await requirePermission(req.params.id, req.userId, 'kickMembers');
  const [bans, timeouts, reports, logs] = await Promise.all([
    db.all(`SELECT b.*, u.username, u.display_name FROM guild_bans b JOIN users u ON u.id = b.user_id WHERE b.guild_id = ? ORDER BY b.created_at DESC`, [req.params.id]),
    db.all(`SELECT t.*, u.username, u.display_name FROM guild_timeouts t JOIN users u ON u.id = t.user_id WHERE t.guild_id = ? AND t.expires_at > ? ORDER BY t.expires_at DESC`, [req.params.id, new Date().toISOString()]),
    db.all(`SELECT r.*, reporter.username AS reporter_username, reported.username AS reported_username
      FROM guild_reports r JOIN users reporter ON reporter.id = r.reporter_id
      LEFT JOIN users reported ON reported.id = r.reported_user_id
      WHERE r.guild_id = ? ORDER BY r.created_at DESC LIMIT 100`, [req.params.id]),
    db.all(`SELECT l.*, actor.username AS actor_username, target.username AS target_username
      FROM guild_audit_logs l JOIN users actor ON actor.id = l.actor_id
      LEFT JOIN users target ON target.id = l.target_user_id
      WHERE l.guild_id = ? ORDER BY l.created_at DESC LIMIT 100`, [req.params.id])
  ]);
  return res.json({ bans, timeouts, reports, audit_logs: logs.map((log) => ({ ...log, details: log.details ? JSON.parse(log.details) : null })) });
}

export async function banMember(req, res) {
  const guild = await requirePermission(req.params.id, req.userId, 'kickMembers');
  const data = moderationSchema.parse(req.body);
  if (data.userId === guild.owner_id) throw new ApiError(409, 'OWNER_CANNOT_BE_BANNED', 'Der Serverbesitzer kann nicht gesperrt werden.');
  await db.run(
    `INSERT INTO guild_bans (guild_id, user_id, moderator_id, reason) VALUES (?, ?, ?, ?)
     ON CONFLICT(guild_id, user_id) DO UPDATE SET moderator_id = excluded.moderator_id, reason = excluded.reason, created_at = CURRENT_TIMESTAMP`,
    [req.params.id, data.userId, req.userId, data.reason || null]
  );
  const member = await membership(req.params.id, data.userId);
  if (member) await db.run('DELETE FROM guild_members WHERE id = ?', [member.id]);
  await audit(req.params.id, req.userId, 'member.ban', data.userId, { reason: data.reason });
  emitGuildRemoved(data.userId, req.params.id, 'banned');
  await emitGuildRefresh(req.params.id, ['members', 'list']);
  return res.status(204).end();
}

export async function unbanMember(req, res) {
  await requirePermission(req.params.id, req.userId, 'kickMembers');
  await db.run('DELETE FROM guild_bans WHERE guild_id = ? AND user_id = ?', [req.params.id, req.params.userId]);
  await audit(req.params.id, req.userId, 'member.unban', req.params.userId);
  return res.status(204).end();
}

export async function timeoutMember(req, res) {
  const guild = await requirePermission(req.params.id, req.userId, 'kickMembers');
  const data = timeoutSchema.parse(req.body);
  if (data.userId === guild.owner_id) throw new ApiError(409, 'OWNER_CANNOT_BE_TIMED_OUT', 'Der Serverbesitzer kann keinen Timeout erhalten.');
  if (!(await membership(req.params.id, data.userId))) throw new ApiError(404, 'MEMBER_NOT_FOUND', 'Dieses Mitglied wurde nicht gefunden.');
  const expiresAt = new Date(Date.now() + data.durationMinutes * 60_000).toISOString();
  await db.run(
    `INSERT INTO guild_timeouts (guild_id, user_id, moderator_id, reason, expires_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(guild_id, user_id) DO UPDATE SET moderator_id = excluded.moderator_id, reason = excluded.reason, expires_at = excluded.expires_at, created_at = CURRENT_TIMESTAMP`,
    [req.params.id, data.userId, req.userId, data.reason || null, expiresAt]
  );
  await audit(req.params.id, req.userId, 'member.timeout', data.userId, { reason: data.reason, expiresAt });
  emitToUsers([data.userId], 'moderation:timeout', { guildId: req.params.id, expiresAt, reason: data.reason });
  return res.json({ expires_at: expiresAt });
}

export async function clearTimeout(req, res) {
  await requirePermission(req.params.id, req.userId, 'kickMembers');
  await db.run('DELETE FROM guild_timeouts WHERE guild_id = ? AND user_id = ?', [req.params.id, req.params.userId]);
  await audit(req.params.id, req.userId, 'member.timeout.clear', req.params.userId);
  return res.status(204).end();
}

export async function createReport(req, res) {
  const member = await membership(req.params.id, req.userId);
  if (!member) throw new ApiError(403, 'NOT_MEMBER', 'Du bist kein Mitglied dieses Servers.');
  const data = reportSchema.parse(req.body);
  if (data.messageId) {
    const message = await db.get(`SELECT m.id, m.author_id FROM messages m JOIN channels c ON c.id = m.channel_id WHERE m.id = ? AND c.guild_id = ?`, [data.messageId, req.params.id]);
    if (!message) throw new ApiError(404, 'MESSAGE_NOT_FOUND', 'Diese Nachricht wurde nicht gefunden.');
    data.reportedUserId ||= message.author_id;
  }
  const id = crypto.randomUUID();
  await db.run(
    `INSERT INTO guild_reports (id, guild_id, reporter_id, reported_user_id, message_id, reason)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, req.params.id, req.userId, data.reportedUserId || null, data.messageId || null, data.reason]
  );
  const moderators = await db.all('SELECT user_id FROM guild_members WHERE guild_id = ?', [req.params.id]);
  emitToUsers(moderators.map((item) => item.user_id), 'moderation:refresh', { guildId: req.params.id });
  return res.status(201).json({ report: { id, status: 'open' } });
}

export async function resolveReport(req, res) {
  await requirePermission(req.params.id, req.userId, 'kickMembers');
  const { status } = reportActionSchema.parse(req.body);
  const result = await db.run(
    'UPDATE guild_reports SET status = ?, resolved_at = ?, resolver_id = ? WHERE id = ? AND guild_id = ?',
    [status, new Date().toISOString(), req.userId, req.params.reportId, req.params.id]
  );
  if (!Number(result.changes)) throw new ApiError(404, 'REPORT_NOT_FOUND', 'Diese Meldung wurde nicht gefunden.');
  await audit(req.params.id, req.userId, `report.${status}`, null, { reportId: req.params.reportId });
  return res.status(204).end();
}
