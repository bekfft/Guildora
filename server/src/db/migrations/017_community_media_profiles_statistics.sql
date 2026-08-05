-- dialect:postgres
CREATE TABLE IF NOT EXISTS voice_message_attachments (
  attachment_id UUID PRIMARY KEY REFERENCES attachments(id) ON DELETE CASCADE,
  duration_ms INTEGER NOT NULL,
  waveform TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS message_link_previews (
  id UUID PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  site_name TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (message_id, url)
);
CREATE INDEX IF NOT EXISTS idx_message_link_previews_message ON message_link_previews(message_id);

CREATE TABLE IF NOT EXISTS dm_message_link_previews (
  id UUID PRIMARY KEY,
  dm_message_id UUID NOT NULL REFERENCES dm_messages(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  site_name TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (dm_message_id, url)
);
CREATE INDEX IF NOT EXISTS idx_dm_message_link_previews_message ON dm_message_link_previews(dm_message_id);

CREATE TABLE IF NOT EXISTS guild_member_profiles (
  guild_id UUID NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  banner_url TEXT,
  bio TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (guild_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_messages_author_created ON messages(author_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_guild_members_joined ON guild_members(guild_id, joined_at DESC);

-- dialect:sqlite
CREATE TABLE IF NOT EXISTS voice_message_attachments (
  attachment_id TEXT PRIMARY KEY REFERENCES attachments(id) ON DELETE CASCADE,
  duration_ms INTEGER NOT NULL,
  waveform TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS message_link_previews (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  site_name TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (message_id, url)
);
CREATE INDEX IF NOT EXISTS idx_message_link_previews_message ON message_link_previews(message_id);

CREATE TABLE IF NOT EXISTS dm_message_link_previews (
  id TEXT PRIMARY KEY,
  dm_message_id TEXT NOT NULL REFERENCES dm_messages(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  site_name TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (dm_message_id, url)
);
CREATE INDEX IF NOT EXISTS idx_dm_message_link_previews_message ON dm_message_link_previews(dm_message_id);

CREATE TABLE IF NOT EXISTS guild_member_profiles (
  guild_id TEXT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  banner_url TEXT,
  bio TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (guild_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_messages_author_created ON messages(author_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_guild_members_joined ON guild_members(guild_id, joined_at DESC);
