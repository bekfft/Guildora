import crypto from 'node:crypto';
import { db } from '../db/index.js';
import { ApiError } from '../middleware/errorHandler.js';
import { STAFF_ROLES, assertNotProtectedOwner, auditStaff, getStaff } from '../services/platformModeration.js';

const CASE_STATUSES = ['open', 'reviewing', 'resolved', 'dismissed'];
const PRIORITIES = ['low', 'normal', 'high', 'critical'];
const USER_ACTIONS = ['warning', 'restrict_social', 'restrict_dms', 'restrict_guild_creation', 'restrict_communication', 'suspension', 'ban'];
const GUILD_ACTIONS = ['discovery_hidden', 'restricted', 'suspended'];
const clean = (value, max = 1000) => String(value || '').trim().slice(0, max);
const bool = (value) => Boolean(value);

async function userOrThrow(id) {
  const user = await db.get('SELECT id, username, display_name, avatar_url, email, created_at FROM users WHERE id = ?', [id]);
  if (!user) throw new ApiError(404, 'USER_NOT_FOUND', 'Dieser Nutzer wurde nicht gefunden.');
  return user;
}

async function userByIdentifierOrThrow(identifier) {
  const normalized = clean(identifier, 254).toLowerCase();
  const user = await db.get(
    `SELECT id, username, display_name, avatar_url, email, created_at FROM users
     WHERE id = ? OR LOWER(username) = ? OR LOWER(email) = ?`,
    [identifier, normalized, normalized]
  );
  if (!user) throw new ApiError(404, 'USER_NOT_FOUND', 'Dieser Nutzer wurde nicht gefunden.');
  return user;
}

export async function staffMe(req, res) {
  return res.json({ staff: await getStaff(req.userId) });
}

export async function dashboard(req, res) {
  const [cases, sanctions, appeals, guilds, recent] = await Promise.all([
    db.get(`SELECT COUNT(*) AS count FROM platform_cases WHERE status IN ('open','reviewing')`),
    db.get(`SELECT COUNT(*) AS count FROM global_sanctions WHERE revoked_at IS NULL AND (expires_at IS NULL OR expires_at > ?)`, [new Date().toISOString()]),
    db.get(`SELECT COUNT(*) AS count FROM platform_appeals WHERE status IN ('open','reviewing')`),
    db.get(`SELECT COUNT(*) AS count FROM guild_platform_restrictions WHERE revoked_at IS NULL AND (expires_at IS NULL OR expires_at > ?)`, [new Date().toISOString()]),
    db.all(`SELECT pc.*, target.username AS target_username, assignee.username AS assignee_username
      FROM platform_cases pc LEFT JOIN users target ON target.id = pc.target_user_id
      LEFT JOIN users assignee ON assignee.id = pc.assignee_id ORDER BY pc.created_at DESC LIMIT 8`)
  ]);
  return res.json({ counts: { cases: Number(cases.count), sanctions: Number(sanctions.count), appeals: Number(appeals.count), guilds: Number(guilds.count) }, recent_cases: recent });
}

export async function listCases(req, res) {
  const params = [];
  const where = [];
  if (CASE_STATUSES.includes(req.query.status)) { where.push('pc.status = ?'); params.push(req.query.status); }
  if (req.query.q) { where.push('(LOWER(pc.reason) LIKE ? OR LOWER(target.username) LIKE ?)'); const q = `%${clean(req.query.q, 80).toLowerCase()}%`; params.push(q, q); }
  const cases = await db.all(`SELECT pc.*, target.username AS target_username, reporter.username AS reporter_username,
      assignee.username AS assignee_username, g.name AS guild_name
    FROM platform_cases pc LEFT JOIN users target ON target.id = pc.target_user_id
    LEFT JOIN users reporter ON reporter.id = pc.reporter_id LEFT JOIN users assignee ON assignee.id = pc.assignee_id
    LEFT JOIN guilds g ON g.id = pc.guild_id ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY CASE pc.priority WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'normal' THEN 2 ELSE 1 END DESC, pc.created_at DESC LIMIT 200`, params);
  return res.json({ cases });
}

export async function getCase(req, res) {
  const item = await db.get(`SELECT pc.*, target.username AS target_username, reporter.username AS reporter_username, g.name AS guild_name
    FROM platform_cases pc LEFT JOIN users target ON target.id = pc.target_user_id LEFT JOIN users reporter ON reporter.id = pc.reporter_id
    LEFT JOIN guilds g ON g.id = pc.guild_id WHERE pc.id = ?`, [req.params.id]);
  if (!item) throw new ApiError(404, 'CASE_NOT_FOUND', 'Dieser Fall wurde nicht gefunden.');
  const [notes, sanctions, evidence] = await Promise.all([
    db.all(`SELECT n.*, u.username AS author_username FROM platform_case_notes n JOIN users u ON u.id = n.author_id WHERE n.case_id = ? ORDER BY n.created_at`, [item.id]),
    db.all('SELECT * FROM global_sanctions WHERE case_id = ? ORDER BY created_at DESC', [item.id]),
    db.all('SELECT * FROM platform_case_evidence WHERE case_id = ? ORDER BY created_at', [item.id])
  ]);
  return res.json({ case: item, notes, sanctions, evidence: evidence.map((row) => ({ ...row, snapshot: JSON.parse(row.snapshot) })) });
}

export async function removePlatformMessage(req, res) {
  const message = await db.get('SELECT id, author_id, channel_id, content FROM messages WHERE id = ?', [req.params.id]);
  if (!message) throw new ApiError(404, 'MESSAGE_NOT_FOUND', 'Diese Nachricht wurde nicht gefunden.');
  await assertNotProtectedOwner(message.author_id);
  await db.run('DELETE FROM messages WHERE id = ?', [message.id]);
  await auditStaff(req.userId, 'content.remove', 'message', message.id, { channelId: message.channel_id, preview: message.content.slice(0, 160), reason: clean(req.body.reason, 1000) || null, caseId: req.body.caseId || null }, req.body.caseId || null);
  return res.status(204).end();
}

export async function updateCase(req, res) {
  const item = await db.get('SELECT * FROM platform_cases WHERE id = ?', [req.params.id]);
  if (!item) throw new ApiError(404, 'CASE_NOT_FOUND', 'Dieser Fall wurde nicht gefunden.');
  const status = CASE_STATUSES.includes(req.body.status) ? req.body.status : item.status;
  const priority = PRIORITIES.includes(req.body.priority) ? req.body.priority : item.priority;
  const assigneeId = req.body.assignToMe ? req.userId : (req.body.assigneeId ?? item.assignee_id);
  if (assigneeId) await userOrThrow(assigneeId);
  const resolved = ['resolved', 'dismissed'].includes(status);
  await db.run(`UPDATE platform_cases SET status = ?, priority = ?, assignee_id = ?, resolution = ?,
    resolved_by = ?, resolved_at = ?, updated_at = ? WHERE id = ?`, [status, priority, assigneeId || null, clean(req.body.resolution || item.resolution, 2000) || null,
    resolved ? req.userId : null, resolved ? new Date().toISOString() : null, new Date().toISOString(), item.id]);
  await auditStaff(req.userId, 'case.update', 'case', item.id, { status, priority, assigneeId }, item.id);
  return res.json({ case: await db.get('SELECT * FROM platform_cases WHERE id = ?', [item.id]) });
}

export async function addCaseNote(req, res) {
  const body = clean(req.body.body, 4000);
  if (body.length < 2) throw new ApiError(400, 'INVALID_NOTE', 'Die Notiz ist zu kurz.');
  if (!await db.get('SELECT id FROM platform_cases WHERE id = ?', [req.params.id])) throw new ApiError(404, 'CASE_NOT_FOUND', 'Dieser Fall wurde nicht gefunden.');
  const id = crypto.randomUUID();
  await db.run('INSERT INTO platform_case_notes (id, case_id, author_id, body, internal) VALUES (?, ?, ?, ?, ?)', [id, req.params.id, req.userId, body, true]);
  await auditStaff(req.userId, 'case.note', 'case', req.params.id, null, req.params.id);
  return res.status(201).json({ note: await db.get('SELECT * FROM platform_case_notes WHERE id = ?', [id]) });
}

export async function searchUsers(req, res) {
  const q = `%${clean(req.query.q, 80).toLowerCase()}%`;
  const users = await db.all(`SELECT u.id, u.username, u.display_name, u.avatar_url, u.email, u.created_at,
      ps.role AS staff_role, COALESCE(ps.is_owner, 0) AS is_owner
    FROM users u LEFT JOIN platform_staff ps ON ps.user_id = u.id
    WHERE LOWER(u.username) LIKE ? OR LOWER(u.display_name) LIKE ? OR LOWER(u.email) LIKE ? ORDER BY u.created_at DESC LIMIT 50`, [q, q, q]);
  return res.json({ users: users.map((u) => ({ ...u, is_owner: bool(u.is_owner) })) });
}

export async function getUser(req, res) {
  const user = await userOrThrow(req.params.id);
  const [staff, sanctions, cases, guilds] = await Promise.all([
    getStaff(user.id),
    db.all('SELECT * FROM global_sanctions WHERE user_id = ? ORDER BY created_at DESC LIMIT 100', [user.id]),
    db.all('SELECT * FROM platform_cases WHERE target_user_id = ? ORDER BY created_at DESC LIMIT 100', [user.id]),
    db.all(`SELECT g.id, g.name, g.owner_id, gm.joined_at FROM guild_members gm JOIN guilds g ON g.id = gm.guild_id WHERE gm.user_id = ?`, [user.id])
  ]);
  return res.json({ user, staff, sanctions, cases, guilds });
}

export async function sanctionUser(req, res) {
  const type = req.body.type;
  const reason = clean(req.body.reason, 1500);
  if (!USER_ACTIONS.includes(type) || reason.length < 5) throw new ApiError(400, 'INVALID_ACTION', 'Wähle eine gültige Maßnahme und gib einen nachvollziehbaren Grund an.');
  await userOrThrow(req.params.id);
  await assertNotProtectedOwner(req.params.id);
  if (['suspension', 'ban'].includes(type) && !['administration', 'management'].includes(req.staff.role)) throw new ApiError(403, 'STAFF_FORBIDDEN', 'Diese Maßnahme erfordert Administration oder Management.');
  if (type === 'ban' && !req.staff.is_owner) {
    const approvalId = crypto.randomUUID();
    await db.run('INSERT INTO platform_approvals (id, requester_id, action, target_type, target_id, payload) VALUES (?, ?, ?, ?, ?, ?)', [approvalId, req.userId, 'user.ban', 'user', req.params.id, JSON.stringify({ type, reason, caseId: req.body.caseId || null, expiresAt: req.body.expiresAt || null })]);
    await auditStaff(req.userId, 'approval.request', 'user', req.params.id, { approvalId, action: 'user.ban' }, req.body.caseId || null);
    return res.status(202).json({ approval: await db.get('SELECT * FROM platform_approvals WHERE id = ?', [approvalId]) });
  }
  const id = crypto.randomUUID();
  const expiresAt = req.body.expiresAt ? new Date(req.body.expiresAt).toISOString() : null;
  await db.run('INSERT INTO global_sanctions (id, user_id, type, reason, case_id, issued_by, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [id, req.params.id, type, reason, req.body.caseId || null, req.userId, expiresAt]);
  await auditStaff(req.userId, `user.${type}`, 'user', req.params.id, { reason, expiresAt }, req.body.caseId || null);
  return res.status(201).json({ sanction: await db.get('SELECT * FROM global_sanctions WHERE id = ?', [id]) });
}

export async function revokeSanction(req, res) {
  const sanction = await db.get('SELECT * FROM global_sanctions WHERE id = ?', [req.params.id]);
  if (!sanction) throw new ApiError(404, 'SANCTION_NOT_FOUND', 'Diese Maßnahme wurde nicht gefunden.');
  await assertNotProtectedOwner(sanction.user_id);
  await db.run('UPDATE global_sanctions SET revoked_at = ?, revoked_by = ? WHERE id = ?', [new Date().toISOString(), req.userId, sanction.id]);
  await auditStaff(req.userId, 'sanction.revoke', 'user', sanction.user_id, { sanctionId: sanction.id }, sanction.case_id);
  return res.status(204).end();
}

export async function searchGuilds(req, res) {
  const q = `%${clean(req.query.q, 80).toLowerCase()}%`;
  const guilds = await db.all(`SELECT g.*, u.username AS owner_username,
      (SELECT COUNT(*) FROM guild_members gm WHERE gm.guild_id = g.id) AS member_count
    FROM guilds g JOIN users u ON u.id = g.owner_id WHERE LOWER(g.name) LIKE ? OR LOWER(g.slug) LIKE ? ORDER BY g.created_at DESC LIMIT 50`, [q, q]);
  return res.json({ guilds });
}

export async function getGuild(req, res) {
  const guild = await db.get(`SELECT g.*, u.username AS owner_username FROM guilds g JOIN users u ON u.id = g.owner_id WHERE g.id = ?`, [req.params.id]);
  if (!guild) throw new ApiError(404, 'GUILD_NOT_FOUND', 'Dieser Server wurde nicht gefunden.');
  const [members, channels, restrictions] = await Promise.all([
    db.all(`SELECT u.id, u.username, u.display_name, gm.joined_at FROM guild_members gm JOIN users u ON u.id = gm.user_id WHERE gm.guild_id = ? ORDER BY gm.joined_at LIMIT 200`, [guild.id]),
    db.all('SELECT id, name, type, topic FROM channels WHERE guild_id = ? ORDER BY position', [guild.id]),
    db.all('SELECT * FROM guild_platform_restrictions WHERE guild_id = ? ORDER BY created_at DESC', [guild.id])
  ]);
  return res.json({ guild, members, channels, restrictions });
}

export async function restrictGuild(req, res) {
  const type = req.body.type;
  const reason = clean(req.body.reason, 1500);
  if (!GUILD_ACTIONS.includes(type) || reason.length < 5) throw new ApiError(400, 'INVALID_ACTION', 'Wähle eine gültige Servermaßnahme und gib einen Grund an.');
  const guild = await db.get('SELECT * FROM guilds WHERE id = ?', [req.params.id]);
  if (!guild) throw new ApiError(404, 'GUILD_NOT_FOUND', 'Dieser Server wurde nicht gefunden.');
  await assertNotProtectedOwner(guild.owner_id);
  if (type === 'suspended' && !req.staff.is_owner) {
    const approvalId = crypto.randomUUID();
    await db.run('INSERT INTO platform_approvals (id, requester_id, action, target_type, target_id, payload) VALUES (?, ?, ?, ?, ?, ?)', [approvalId, req.userId, 'guild.suspended', 'guild', guild.id, JSON.stringify({ type, reason, caseId: req.body.caseId || null, expiresAt: req.body.expiresAt || null })]);
    await auditStaff(req.userId, 'approval.request', 'guild', guild.id, { approvalId, action: 'guild.suspended' }, req.body.caseId || null);
    return res.status(202).json({ approval: await db.get('SELECT * FROM platform_approvals WHERE id = ?', [approvalId]) });
  }
  const id = crypto.randomUUID();
  const expiresAt = req.body.expiresAt ? new Date(req.body.expiresAt).toISOString() : null;
  await db.run('INSERT INTO guild_platform_restrictions (id, guild_id, type, reason, case_id, issued_by, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [id, guild.id, type, reason, req.body.caseId || null, req.userId, expiresAt]);
  await auditStaff(req.userId, `guild.${type}`, 'guild', guild.id, { reason, expiresAt }, req.body.caseId || null);
  return res.status(201).json({ restriction: await db.get('SELECT * FROM guild_platform_restrictions WHERE id = ?', [id]) });
}

export async function revokeGuildRestriction(req, res) {
  const restriction = await db.get('SELECT * FROM guild_platform_restrictions WHERE id = ?', [req.params.id]);
  if (!restriction) throw new ApiError(404, 'GUILD_RESTRICTION_NOT_FOUND', 'Diese Servermaßnahme wurde nicht gefunden.');
  const guild = await db.get('SELECT owner_id FROM guilds WHERE id = ?', [restriction.guild_id]);
  if (guild) await assertNotProtectedOwner(guild.owner_id);
  await db.run(
    'UPDATE guild_platform_restrictions SET revoked_at = ?, revoked_by = ? WHERE id = ?',
    [new Date().toISOString(), req.userId, restriction.id]
  );
  await auditStaff(req.userId, 'guild.restriction.revoke', 'guild', restriction.guild_id, { restrictionId: restriction.id }, restriction.case_id);
  return res.status(204).end();
}

export async function listAppeals(req, res) {
  const appeals = await db.all(`SELECT a.*, u.username AS appellant_username, reviewer.username AS reviewer_username, s.type AS sanction_type
    FROM platform_appeals a JOIN users u ON u.id = a.appellant_id LEFT JOIN users reviewer ON reviewer.id = a.reviewer_id
    LEFT JOIN global_sanctions s ON s.id = a.sanction_id ORDER BY a.created_at DESC LIMIT 200`);
  return res.json({ appeals });
}

export async function reviewAppeal(req, res) {
  const status = ['reviewing', 'accepted', 'rejected'].includes(req.body.status) ? req.body.status : null;
  if (!status) throw new ApiError(400, 'INVALID_STATUS', 'Dieser Einspruchsstatus ist ungültig.');
  const appeal = await db.get('SELECT * FROM platform_appeals WHERE id = ?', [req.params.id]);
  if (!appeal) throw new ApiError(404, 'APPEAL_NOT_FOUND', 'Dieser Einspruch wurde nicht gefunden.');
  await db.run('UPDATE platform_appeals SET status = ?, reviewer_id = ?, response = ?, updated_at = ? WHERE id = ?', [status, req.userId, clean(req.body.response, 2000) || null, new Date().toISOString(), appeal.id]);
  if (status === 'accepted' && appeal.sanction_id) await db.run('UPDATE global_sanctions SET revoked_at = ?, revoked_by = ? WHERE id = ?', [new Date().toISOString(), req.userId, appeal.sanction_id]);
  await auditStaff(req.userId, `appeal.${status}`, 'appeal', appeal.id);
  return res.json({ appeal: await db.get('SELECT * FROM platform_appeals WHERE id = ?', [appeal.id]) });
}

export async function listAudit(req, res) {
  const logs = await db.all(`SELECT l.*, u.username AS actor_username FROM staff_audit_logs l JOIN users u ON u.id = l.actor_id ORDER BY l.created_at DESC LIMIT 300`);
  return res.json({ logs: logs.map((row) => ({ ...row, details: row.details ? JSON.parse(row.details) : null })) });
}

export async function listTeam(req, res) {
  const team = await db.all(`SELECT ps.*, u.username, u.display_name, u.avatar_url FROM platform_staff ps JOIN users u ON u.id = ps.user_id ORDER BY ps.is_owner DESC, ps.created_at`);
  return res.json({ team: team.map((member) => ({ ...member, is_owner: bool(member.is_owner) })) });
}

export async function listApprovals(req, res) {
  const approvals = await db.all(`SELECT a.*, requester.username AS requester_username, approver.username AS approver_username
    FROM platform_approvals a JOIN users requester ON requester.id = a.requester_id
    LEFT JOIN users approver ON approver.id = a.approver_id ORDER BY a.created_at DESC LIMIT 200`);
  return res.json({ approvals: approvals.map((a) => ({ ...a, payload: JSON.parse(a.payload) })) });
}

export async function decideApproval(req, res) {
  const decision = req.body.decision;
  if (!['approved', 'rejected'].includes(decision)) throw new ApiError(400, 'INVALID_DECISION', 'Diese Entscheidung ist ungültig.');
  const approval = await db.get('SELECT * FROM platform_approvals WHERE id = ? AND status = ?', [req.params.id, 'pending']);
  if (!approval) throw new ApiError(404, 'APPROVAL_NOT_FOUND', 'Diese offene Freigabe wurde nicht gefunden.');
  if (approval.requester_id === req.userId) throw new ApiError(403, 'SELF_APPROVAL_FORBIDDEN', 'Kritische Maßnahmen müssen von einer zweiten Person freigegeben werden.');
  const payload = JSON.parse(approval.payload);
  if (decision === 'approved') {
    if (approval.action === 'user.ban') {
      await assertNotProtectedOwner(approval.target_id);
      await db.run('INSERT INTO global_sanctions (id, user_id, type, reason, case_id, issued_by, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [crypto.randomUUID(), approval.target_id, 'ban', payload.reason, payload.caseId || null, approval.requester_id, payload.expiresAt ? new Date(payload.expiresAt).toISOString() : null]);
    } else if (approval.action === 'guild.suspended') {
      const guild = await db.get('SELECT owner_id FROM guilds WHERE id = ?', [approval.target_id]);
      if (!guild) throw new ApiError(404, 'GUILD_NOT_FOUND', 'Dieser Server wurde nicht gefunden.');
      await assertNotProtectedOwner(guild.owner_id);
      await db.run('INSERT INTO guild_platform_restrictions (id, guild_id, type, reason, case_id, issued_by, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [crypto.randomUUID(), approval.target_id, 'suspended', payload.reason, payload.caseId || null, approval.requester_id, payload.expiresAt ? new Date(payload.expiresAt).toISOString() : null]);
    }
  }
  await db.run('UPDATE platform_approvals SET status = ?, approver_id = ?, decided_at = ? WHERE id = ?', [decision, req.userId, new Date().toISOString(), approval.id]);
  await auditStaff(req.userId, `approval.${decision}`, approval.target_type, approval.target_id, { approvalId: approval.id, action: approval.action });
  return res.json({ approval: await db.get('SELECT * FROM platform_approvals WHERE id = ?', [approval.id]) });
}

export async function upsertTeamMember(req, res) {
  if (!STAFF_ROLES.includes(req.body.role)) throw new ApiError(400, 'INVALID_ROLE', 'Diese Staff-Rolle ist ungültig.');
  const target = await userByIdentifierOrThrow(req.params.userId);
  const existing = await getStaff(target.id);
  if (existing?.is_owner) throw new ApiError(403, 'OWNER_PROTECTED', 'Die Rolle des Inhabers kann nicht verändert werden.');
  await db.run(`INSERT INTO platform_staff (user_id, role, assigned_by) VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET role = ?, assigned_by = ?, updated_at = ?`, [target.id, req.body.role, req.userId, req.body.role, req.userId, new Date().toISOString()]);
  await auditStaff(req.userId, 'staff.upsert', 'user', target.id, { role: req.body.role });
  return res.json({ staff: await getStaff(target.id) });
}

export async function removeTeamMember(req, res) {
  await assertNotProtectedOwner(req.params.userId);
  await db.run('DELETE FROM platform_staff WHERE user_id = ?', [req.params.userId]);
  await auditStaff(req.userId, 'staff.remove', 'user', req.params.userId);
  return res.status(204).end();
}

export async function myAppeals(req, res) {
  return res.json({ appeals: await db.all('SELECT * FROM platform_appeals WHERE appellant_id = ? ORDER BY created_at DESC', [req.userId]) });
}

export async function createAppeal(req, res) {
  const message = clean(req.body.message, 3000);
  if (message.length < 10) throw new ApiError(400, 'INVALID_APPEAL', 'Beschreibe deinen Einspruch bitte etwas genauer.');
  const sanction = await db.get('SELECT * FROM global_sanctions WHERE id = ? AND user_id = ?', [req.body.sanctionId, req.userId]);
  if (!sanction) throw new ApiError(404, 'SANCTION_NOT_FOUND', 'Diese Maßnahme wurde nicht gefunden.');
  const id = crypto.randomUUID();
  await db.run('INSERT INTO platform_appeals (id, appellant_id, sanction_id, message) VALUES (?, ?, ?, ?)', [id, req.userId, sanction.id, message]);
  return res.status(201).json({ appeal: await db.get('SELECT * FROM platform_appeals WHERE id = ?', [id]) });
}
