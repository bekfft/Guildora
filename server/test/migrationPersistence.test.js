import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'guildora-migrations-'));
const databasePath = path.join(temporaryDirectory, 'persistence.sqlite');
process.env.NODE_ENV = 'test';
delete process.env.DATABASE_URL;
process.env.SQLITE_PATH = databasePath;

const { db, runMigrations } = await import('../src/db/index.js');
const serverDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

after(async () => {
  await db.close();
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
});

test('Migrationen laufen nur einmal und erhalten Server-, Rollen- und Channel-Zustände', async () => {
  await runMigrations();

  const ownerId = crypto.randomUUID();
  const guildId = crypto.randomUUID();
  const memberId = crypto.randomUUID();
  const categoryId = crypto.randomUUID();
  const channelId = crypto.randomUUID();
  const roleId = crypto.randomUUID();

  await db.run(
    `INSERT INTO users
     (id, email, username, display_name, password_hash, birthdate)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [ownerId, 'bekfft@example.test', 'bekfft', 'Bek FFT', 'test-hash', '1990-01-01']
  );
  await db.run(
    `INSERT INTO guilds
     (id, name, slug, description, icon_url, banner_url, owner_id, is_public, is_official, is_verified, category)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      guildId,
      'Meine Guildora-Konfiguration',
      'guildora-official',
      'Eigene Beschreibung',
      '/custom-icon.png',
      '/custom-banner.png',
      ownerId,
      true,
      true,
      true,
      'Gaming'
    ]
  );
  await db.run(
    'INSERT INTO guild_members (id, guild_id, user_id, nickname) VALUES (?, ?, ?, ?)',
    [memberId, guildId, ownerId, 'Eigener Nickname']
  );
  await db.run(
    'INSERT INTO channel_categories (id, guild_id, name, position) VALUES (?, ?, ?, ?)',
    [categoryId, guildId, 'EIGENE KATEGORIE', 77]
  );
  await db.run(
    `INSERT INTO channels
     (id, guild_id, category_id, name, type, topic, position)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [channelId, guildId, categoryId, 'eigener-channel', 'text', 'Eigenes Thema', 42]
  );
  await db.run(
    'INSERT INTO roles (id, guild_id, name, color, position, is_default) VALUES (?, ?, ?, ?, ?, ?)',
    [roleId, guildId, 'Moderator', '#4e8dfc', 10, false]
  );
  await db.run(
    `INSERT INTO role_permissions
     (role_id, manage_server, manage_channels, manage_roles, kick_members, manage_messages)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [roleId, true, true, true, true, true]
  );
  await db.run(
    'INSERT INTO member_roles (member_id, role_id) VALUES (?, ?)',
    [memberId, roleId]
  );
  await db.run(
    `INSERT INTO channel_role_permissions
     (channel_id, role_id, view_channel, read_history, send_messages, attach_files, manage_messages)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [channelId, roleId, 1, 1, -1, 1, 1]
  );

  await db.exec('DROP TABLE schema_migrations');
  await db.close();
  await runMigrations();
  await db.close();
  await runMigrations();

  const guild = await db.get(
    `SELECT name, description, icon_url, banner_url, is_public, is_verified, category
     FROM guilds WHERE id = ?`,
    [guildId]
  );
  const channel = await db.get(
    'SELECT name, topic, position, category_id FROM channels WHERE id = ?',
    [channelId]
  );
  const role = await db.get('SELECT name, color, position FROM roles WHERE id = ?', [roleId]);
  const memberRole = await db.get(
    'SELECT member_id, role_id FROM member_roles WHERE member_id = ? AND role_id = ?',
    [memberId, roleId]
  );
  const channelPermission = await db.get(
    `SELECT view_channel, read_history, send_messages, attach_files, manage_messages
     FROM channel_role_permissions WHERE channel_id = ? AND role_id = ?`,
    [channelId, roleId]
  );
  const migrationCount = await db.get('SELECT COUNT(*) AS count FROM schema_migrations');
  const bekfftBadges = await db.all(
    `SELECT b.slug
     FROM user_badges ub
     JOIN profile_badges b ON b.id = ub.badge_id
     WHERE ub.user_id = ?
     ORDER BY ub.display_order`,
    [ownerId]
  );

  assert.deepEqual({ ...guild }, {
    name: 'Meine Guildora-Konfiguration',
    description: 'Eigene Beschreibung',
    icon_url: '/custom-icon.png',
    banner_url: '/custom-banner.png',
    is_public: 1,
    is_verified: 1,
    category: 'Gaming'
  });
  assert.deepEqual({ ...channel }, {
    name: 'eigener-channel',
    topic: 'Eigenes Thema',
    position: 42,
    category_id: categoryId
  });
  assert.deepEqual({ ...role }, { name: 'Moderator', color: '#4e8dfc', position: 10 });
  assert.deepEqual({ ...memberRole }, { member_id: memberId, role_id: roleId });
  assert.deepEqual({ ...channelPermission }, {
    view_channel: 1,
    read_history: 1,
    send_messages: -1,
    attach_files: 1,
    manage_messages: 1
  });
  assert.equal(migrationCount.count, 19);
  assert.deepEqual(bekfftBadges.map((badge) => badge.slug), [
    'guildora-team',
    'founding-member',
    'supporter',
    'bug-hunter',
    'community-helper',
    'verified-creator'
  ]);
  const backups = fs.readdirSync(path.join(temporaryDirectory, 'backups'));
  assert.equal(backups.length, 2);
  assert.ok(backups.some((backup) => /^guildora-before-migration-baseline-.+\.sqlite$/.test(backup)));
  assert.ok(backups.some((backup) => /^guildora-before-migration-010_read_states_notifications_search-.+\.sqlite$/.test(backup)));
});

test('Seed verändert einen bereits vorhandenen offiziellen Server nicht', async () => {
  await db.close();
  const result = spawnSync(process.execPath, ['src/db/seed.js'], {
    cwd: serverDirectory,
    encoding: 'utf8',
    env: {
      ...process.env,
      SQLITE_PATH: databasePath
    }
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /gespeicherte Einstellungen bleiben unverändert/);

  const guild = await db.get(
    `SELECT name, description, icon_url, banner_url, is_public, is_verified, category
     FROM guilds WHERE slug = ?`,
    ['guildora-official']
  );
  const channels = await db.all(
    'SELECT name FROM channels WHERE guild_id = (SELECT id FROM guilds WHERE slug = ?) ORDER BY name',
    ['guildora-official']
  );
  const roles = await db.all(
    'SELECT name FROM roles WHERE guild_id = (SELECT id FROM guilds WHERE slug = ?) ORDER BY name',
    ['guildora-official']
  );

  assert.deepEqual({ ...guild }, {
    name: 'Meine Guildora-Konfiguration',
    description: 'Eigene Beschreibung',
    icon_url: '/custom-icon.png',
    banner_url: '/custom-banner.png',
    is_public: 1,
    is_verified: 1,
    category: 'Gaming'
  });
  assert.deepEqual(channels.map((channel) => ({ ...channel })), [{ name: 'eigener-channel' }]);
  assert.deepEqual(roles.map((role) => ({ ...role })), [{ name: 'Moderator' }]);
});
