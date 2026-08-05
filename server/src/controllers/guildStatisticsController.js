import { db } from '../db/index.js';
import { isUserOnline } from '../realtime.js';
import { requirePermission } from './guildAdminController.js';

const DAY = 24 * 60 * 60 * 1000;

function isoDay(value) {
  return new Date(value).toISOString().slice(0, 10);
}

function percentage(current, previous) {
  if (!previous) return current ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

export async function getGuildStatistics(req, res) {
  await requirePermission(req.params.id, req.userId, 'manageServer');
  const now = Date.now();
  const since60 = new Date(now - 60 * DAY);
  const [messages, members, channels] = await Promise.all([
    db.all(
      `SELECT m.created_at, m.author_id, m.channel_id
       FROM messages m JOIN channels c ON c.id = m.channel_id
       WHERE c.guild_id = ? AND m.created_at >= ? ORDER BY m.created_at DESC`,
      [req.params.id, since60.toISOString()]
    ),
    db.all(
      `SELECT gm.user_id, gm.joined_at, gm.nickname, u.username,
              COALESCE(NULLIF(gmp.display_name, ''), u.display_name) AS display_name,
              COALESCE(gmp.avatar_url, u.avatar_url) AS avatar_url
       FROM guild_members gm JOIN users u ON u.id = gm.user_id
       LEFT JOIN guild_member_profiles gmp ON gmp.guild_id = gm.guild_id AND gmp.user_id = gm.user_id
       WHERE gm.guild_id = ?`,
      [req.params.id]
    ),
    db.all("SELECT id, name FROM channels WHERE guild_id = ? AND type = 'text'", [req.params.id])
  ]);
  const recent = messages.filter((message) => new Date(message.created_at) >= since60);
  const cutoff7 = now - 7 * DAY;
  const cutoff14 = now - 14 * DAY;
  const cutoff30 = now - 30 * DAY;
  const current7 = recent.filter((message) => new Date(message.created_at).getTime() >= cutoff7);
  const previous7 = recent.filter((message) => {
    const time = new Date(message.created_at).getTime();
    return time >= cutoff14 && time < cutoff7;
  });
  const current30 = recent.filter((message) => new Date(message.created_at).getTime() >= cutoff30);
  const activeMembers = new Set(current30.map((message) => message.author_id));
  const channelCounts = new Map();
  const authorCounts = new Map();
  for (const message of current30) {
    channelCounts.set(message.channel_id, (channelCounts.get(message.channel_id) || 0) + 1);
    authorCounts.set(message.author_id, (authorCounts.get(message.author_id) || 0) + 1);
  }
  const memberById = new Map(members.map((member) => [member.user_id, member]));
  const dailyMap = new Map();
  for (let offset = 29; offset >= 0; offset -= 1) {
    const date = new Date(now - offset * DAY);
    dailyMap.set(isoDay(date), { date: isoDay(date), messages: 0, joins: 0 });
  }
  for (const message of current30) {
    const day = dailyMap.get(isoDay(message.created_at));
    if (day) day.messages += 1;
  }
  for (const member of members) {
    const day = dailyMap.get(isoDay(member.joined_at));
    if (day) day.joins += 1;
  }
  return res.json({
    period_days: 30,
    overview: {
      total_members: members.length,
      online_members: members.filter((member) => isUserOnline(member.user_id)).length,
      messages_7d: current7.length,
      messages_30d: current30.length,
      active_members_30d: activeMembers.size,
      new_members_30d: members.filter((member) => new Date(member.joined_at).getTime() >= cutoff30).length,
      message_change_percent: percentage(current7.length, previous7.length)
    },
    daily: [...dailyMap.values()],
    top_channels: channels.map((channel) => ({ ...channel, messages: channelCounts.get(channel.id) || 0 }))
      .sort((a, b) => b.messages - a.messages).slice(0, 5),
    top_members: [...authorCounts.entries()].map(([userId, count]) => ({
      ...memberById.get(userId),
      messages: count
    })).filter((member) => member.user_id).sort((a, b) => b.messages - a.messages).slice(0, 5)
  });
}
