-- dialect:postgres
CREATE TABLE IF NOT EXISTS channel_read_states (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  last_read_message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, channel_id)
);

CREATE INDEX IF NOT EXISTS idx_channel_read_states_channel
  ON channel_read_states(channel_id, last_read_at);

CREATE TABLE IF NOT EXISTS user_notifications (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('mention', 'reply')),
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  actor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  read_at TIMESTAMPTZ,
  UNIQUE (user_id, type, message_id)
);

CREATE INDEX IF NOT EXISTS idx_user_notifications_user_created
  ON user_notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_notifications_user_unread
  ON user_notifications(user_id, read_at, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_search
  ON messages(channel_id, author_id, created_at DESC);

INSERT INTO channel_read_states
(user_id, channel_id, last_read_message_id, last_read_at, updated_at)
SELECT gm.user_id, c.id,
       (SELECT m2.id FROM messages m2 WHERE m2.channel_id = c.id ORDER BY m2.created_at DESC, m2.id DESC LIMIT 1),
       COALESCE((SELECT MAX(m3.created_at) FROM messages m3 WHERE m3.channel_id = c.id), CURRENT_TIMESTAMP),
       CURRENT_TIMESTAMP
FROM guild_members gm
JOIN channels c ON c.guild_id = gm.guild_id
ON CONFLICT (user_id, channel_id) DO NOTHING;

-- dialect:sqlite
CREATE TABLE IF NOT EXISTS channel_read_states (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  last_read_message_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
  last_read_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, channel_id)
);

CREATE INDEX IF NOT EXISTS idx_channel_read_states_channel
  ON channel_read_states(channel_id, last_read_at);

CREATE TABLE IF NOT EXISTS user_notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('mention', 'reply')),
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  actor_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  read_at TEXT,
  UNIQUE (user_id, type, message_id)
);

CREATE INDEX IF NOT EXISTS idx_user_notifications_user_created
  ON user_notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_notifications_user_unread
  ON user_notifications(user_id, read_at, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_search
  ON messages(channel_id, author_id, created_at DESC);

INSERT INTO channel_read_states
(user_id, channel_id, last_read_message_id, last_read_at, updated_at)
SELECT gm.user_id, c.id,
       (SELECT m2.id FROM messages m2 WHERE m2.channel_id = c.id ORDER BY m2.created_at DESC, m2.id DESC LIMIT 1),
       COALESCE((SELECT MAX(m3.created_at) FROM messages m3 WHERE m3.channel_id = c.id), CURRENT_TIMESTAMP),
       CURRENT_TIMESTAMP
FROM guild_members gm
JOIN channels c ON c.guild_id = gm.guild_id
ON CONFLICT (user_id, channel_id) DO NOTHING;
