-- dialect:postgres
CREATE TABLE IF NOT EXISTS bot_applications (
  id UUID PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bot_user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  token_hash TEXT NOT NULL UNIQUE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_bot_applications_owner ON bot_applications(owner_id, created_at DESC);

CREATE TABLE IF NOT EXISTS bot_guilds (
  app_id UUID NOT NULL REFERENCES bot_applications(id) ON DELETE CASCADE,
  guild_id UUID NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  added_by UUID REFERENCES users(id) ON DELETE SET NULL,
  scopes TEXT NOT NULL,
  installed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (app_id, guild_id)
);

CREATE TABLE IF NOT EXISTS bot_commands (
  id UUID PRIMARY KEY,
  app_id UUID NOT NULL REFERENCES bot_applications(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  response_template TEXT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (app_id, name)
);

CREATE TABLE IF NOT EXISTS bot_events (
  id UUID PRIMARY KEY,
  app_id UUID NOT NULL REFERENCES bot_applications(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  guild_id UUID REFERENCES guilds(id) ON DELETE CASCADE,
  channel_id UUID REFERENCES channels(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  payload TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  consumed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_bot_events_app ON bot_events(app_id, created_at DESC);

-- dialect:sqlite
CREATE TABLE IF NOT EXISTS bot_applications (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bot_user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  token_hash TEXT NOT NULL UNIQUE,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_bot_applications_owner ON bot_applications(owner_id, created_at DESC);

CREATE TABLE IF NOT EXISTS bot_guilds (
  app_id TEXT NOT NULL REFERENCES bot_applications(id) ON DELETE CASCADE,
  guild_id TEXT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  added_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  scopes TEXT NOT NULL,
  installed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (app_id, guild_id)
);

CREATE TABLE IF NOT EXISTS bot_commands (
  id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL REFERENCES bot_applications(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  response_template TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (app_id, name)
);

CREATE TABLE IF NOT EXISTS bot_events (
  id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL REFERENCES bot_applications(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  guild_id TEXT REFERENCES guilds(id) ON DELETE CASCADE,
  channel_id TEXT REFERENCES channels(id) ON DELETE CASCADE,
  actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  consumed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_bot_events_app ON bot_events(app_id, created_at DESC);
