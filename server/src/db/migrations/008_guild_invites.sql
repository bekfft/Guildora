-- dialect:postgres
CREATE TABLE IF NOT EXISTS guild_invites (
  id UUID PRIMARY KEY,
  guild_id UUID NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  creator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ,
  max_uses INTEGER CHECK (max_uses IS NULL OR max_uses > 0),
  uses INTEGER NOT NULL DEFAULT 0 CHECK (uses >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_guild_invites_guild ON guild_invites(guild_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_guild_invites_code ON guild_invites(code);

-- dialect:sqlite
CREATE TABLE IF NOT EXISTS guild_invites (
  id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  creator_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  expires_at TEXT,
  max_uses INTEGER CHECK (max_uses IS NULL OR max_uses > 0),
  uses INTEGER NOT NULL DEFAULT 0 CHECK (uses >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_guild_invites_guild ON guild_invites(guild_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_guild_invites_code ON guild_invites(code);
