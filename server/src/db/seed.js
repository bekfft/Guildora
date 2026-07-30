import 'dotenv/config';
import crypto from 'node:crypto';
import { db, runMigrations } from './index.js';

const OFFICIAL_GUILD = {
  name: 'Guildora Official',
  slug: 'guildora-official',
  description: 'Der offizielle Server von Guildora — Ankündigungen, Hilfe und Feedback.',
  category: 'Community',
  iconUrl: '/assets/guildora-mark.png',
  bannerUrl: '/assets/guildora-official-banner.png'
};

async function ensureCategory(guildId, name, position) {
  let category = await db.get(
    'SELECT id FROM channel_categories WHERE guild_id = ? AND name = ?',
    [guildId, name]
  );
  if (!category) {
    category = { id: crypto.randomUUID() };
    await db.run(
      'INSERT INTO channel_categories (id, guild_id, name, position) VALUES (?, ?, ?, ?)',
      [category.id, guildId, name, position]
    );
  }
  return category.id;
}

async function ensureChannel(guildId, categoryId, channel, position) {
  const existing = await db.get(
    'SELECT id FROM channels WHERE guild_id = ? AND name = ? AND type = ?',
    [guildId, channel.name, channel.type]
  );
  if (!existing) {
    await db.run(
      `INSERT INTO channels
       (id, guild_id, category_id, name, type, topic, position)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [crypto.randomUUID(), guildId, categoryId, channel.name, channel.type, channel.topic || null, position]
    );
  }
}

async function ensureRole(guildId, name, color, position, isDefault = false) {
  let role = isDefault
    ? await db.get('SELECT id FROM roles WHERE guild_id = ? AND is_default = ?', [guildId, true])
    : await db.get('SELECT id FROM roles WHERE guild_id = ? AND name = ?', [guildId, name]);
  if (!role) {
    role = { id: crypto.randomUUID() };
    await db.run(
      'INSERT INTO roles (id, guild_id, name, color, position, is_default) VALUES (?, ?, ?, ?, ?, ?)',
      [role.id, guildId, name, color, position, isDefault]
    );
  }
  return role.id;
}

async function ensureOwnerMembership(guildId, ownerId) {
  let member = await db.get(
    'SELECT id FROM guild_members WHERE guild_id = ? AND user_id = ?',
    [guildId, ownerId]
  );
  if (!member) {
    member = { id: crypto.randomUUID() };
    await db.run(
      'INSERT INTO guild_members (id, guild_id, user_id) VALUES (?, ?, ?)',
      [member.id, guildId, ownerId]
    );
  }
}

try {
  await runMigrations();

  const owner = await db.get('SELECT id FROM users WHERE username = ?', ['bekfft']);
  if (!owner) {
    throw new Error('Der Benutzer bekfft muss registriert sein, bevor der offizielle Server angelegt werden kann.');
  }

  let guild = await db.get('SELECT id FROM guilds WHERE slug = ?', [OFFICIAL_GUILD.slug]);
  if (!guild) {
    guild = { id: crypto.randomUUID() };
    await db.run(
      `INSERT INTO guilds
       (id, name, slug, description, icon_url, banner_url, owner_id, is_public, is_official, is_verified, category)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        guild.id,
        OFFICIAL_GUILD.name,
        OFFICIAL_GUILD.slug,
        OFFICIAL_GUILD.description,
        OFFICIAL_GUILD.iconUrl,
        OFFICIAL_GUILD.bannerUrl,
        owner.id,
        true,
        true,
        true,
        OFFICIAL_GUILD.category
      ]
    );
    const information = await ensureCategory(guild.id, 'INFORMATIONEN', 0);
    const community = await ensureCategory(guild.id, 'COMMUNITY', 10);
    const support = await ensureCategory(guild.id, 'SUPPORT', 20);

    await ensureChannel(guild.id, information, { name: 'willkommen', type: 'text', topic: 'Start hier' }, 0);
    await ensureChannel(guild.id, information, { name: 'ankündigungen', type: 'text' }, 10);
    await ensureChannel(guild.id, information, { name: 'regeln', type: 'text' }, 20);
    await ensureChannel(guild.id, community, { name: 'allgemein', type: 'text' }, 0);
    await ensureChannel(guild.id, community, { name: 'vorstellungen', type: 'text' }, 10);
    await ensureChannel(guild.id, community, { name: 'feedback', type: 'text' }, 20);
    await ensureChannel(guild.id, community, { name: 'Allgemeiner Chat', type: 'voice' }, 30);
    await ensureChannel(guild.id, community, { name: 'Musik', type: 'voice' }, 40);
    await ensureChannel(guild.id, support, { name: 'hilfe', type: 'text' }, 0);
    await ensureChannel(guild.id, support, { name: 'bug-reports', type: 'text' }, 10);

    await ensureRole(guild.id, '@everyone', null, 0, true);
    await ensureOwnerMembership(guild.id, owner.id);
    console.log('Guildora Official wurde einmalig angelegt.');
  } else {
    console.log('Guildora Official existiert bereits; gespeicherte Einstellungen bleiben unverändert.');
  }
} catch (error) {
  console.error('Seed fehlgeschlagen:', error);
  process.exitCode = 1;
} finally {
  await db.close();
}
