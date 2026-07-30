-- dialect:postgres
CREATE TABLE IF NOT EXISTS user_settings (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  friend_requests TEXT NOT NULL DEFAULT 'everyone' CHECK (friend_requests IN ('everyone', 'shared_servers', 'none')),
  direct_messages TEXT NOT NULL DEFAULT 'friends' CHECK (direct_messages IN ('everyone', 'shared_servers', 'friends', 'none')),
  content_filter TEXT NOT NULL DEFAULT 'non_friends' CHECK (content_filter IN ('all', 'non_friends', 'off')),
  desktop_notifications BOOLEAN NOT NULL DEFAULT TRUE,
  notification_sounds BOOLEAN NOT NULL DEFAULT TRUE,
  notify_mentions BOOLEAN NOT NULL DEFAULT TRUE,
  notify_direct_messages BOOLEAN NOT NULL DEFAULT TRUE,
  notify_friend_requests BOOLEAN NOT NULL DEFAULT TRUE,
  quiet_hours_start TEXT,
  quiet_hours_end TEXT,
  theme TEXT NOT NULL DEFAULT 'dark' CHECK (theme IN ('dark', 'light', 'system')),
  accent_color TEXT NOT NULL DEFAULT '#7c5cff',
  message_density TEXT NOT NULL DEFAULT 'cozy' CHECK (message_density IN ('cozy', 'compact')),
  font_scale INTEGER NOT NULL DEFAULT 100,
  app_zoom INTEGER NOT NULL DEFAULT 100,
  reduce_motion BOOLEAN NOT NULL DEFAULT FALSE,
  high_contrast BOOLEAN NOT NULL DEFAULT FALSE,
  color_vision TEXT NOT NULL DEFAULT 'none' CHECK (color_vision IN ('none', 'deuteranopia', 'protanopia', 'tritanopia')),
  screen_reader BOOLEAN NOT NULL DEFAULT FALSE,
  captions BOOLEAN NOT NULL DEFAULT FALSE,
  language TEXT NOT NULL DEFAULT 'de' CHECK (language IN ('de', 'en')),
  date_format TEXT NOT NULL DEFAULT 'de-DE',
  time_format TEXT NOT NULL DEFAULT '24h' CHECK (time_format IN ('24h', '12h')),
  timezone TEXT NOT NULL DEFAULT 'Europe/Berlin',
  spellcheck BOOLEAN NOT NULL DEFAULT TRUE,
  voice_input_device TEXT,
  voice_output_device TEXT,
  voice_camera_device TEXT,
  voice_input_mode TEXT NOT NULL DEFAULT 'voice_activity' CHECK (voice_input_mode IN ('voice_activity', 'push_to_talk')),
  voice_sensitivity INTEGER NOT NULL DEFAULT 50,
  voice_noise_suppression BOOLEAN NOT NULL DEFAULT TRUE,
  voice_echo_cancellation BOOLEAN NOT NULL DEFAULT TRUE,
  voice_auto_gain BOOLEAN NOT NULL DEFAULT TRUE,
  push_to_talk_key TEXT NOT NULL DEFAULT 'Space',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_security (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  totp_secret_encrypted TEXT,
  totp_pending_encrypted TEXT,
  two_factor_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  deactivated_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_connections (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  display_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_user_connections_user ON user_connections(user_id);

-- dialect:sqlite
CREATE TABLE IF NOT EXISTS user_settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  friend_requests TEXT NOT NULL DEFAULT 'everyone' CHECK (friend_requests IN ('everyone', 'shared_servers', 'none')),
  direct_messages TEXT NOT NULL DEFAULT 'friends' CHECK (direct_messages IN ('everyone', 'shared_servers', 'friends', 'none')),
  content_filter TEXT NOT NULL DEFAULT 'non_friends' CHECK (content_filter IN ('all', 'non_friends', 'off')),
  desktop_notifications INTEGER NOT NULL DEFAULT 1,
  notification_sounds INTEGER NOT NULL DEFAULT 1,
  notify_mentions INTEGER NOT NULL DEFAULT 1,
  notify_direct_messages INTEGER NOT NULL DEFAULT 1,
  notify_friend_requests INTEGER NOT NULL DEFAULT 1,
  quiet_hours_start TEXT,
  quiet_hours_end TEXT,
  theme TEXT NOT NULL DEFAULT 'dark' CHECK (theme IN ('dark', 'light', 'system')),
  accent_color TEXT NOT NULL DEFAULT '#7c5cff',
  message_density TEXT NOT NULL DEFAULT 'cozy' CHECK (message_density IN ('cozy', 'compact')),
  font_scale INTEGER NOT NULL DEFAULT 100,
  app_zoom INTEGER NOT NULL DEFAULT 100,
  reduce_motion INTEGER NOT NULL DEFAULT 0,
  high_contrast INTEGER NOT NULL DEFAULT 0,
  color_vision TEXT NOT NULL DEFAULT 'none' CHECK (color_vision IN ('none', 'deuteranopia', 'protanopia', 'tritanopia')),
  screen_reader INTEGER NOT NULL DEFAULT 0,
  captions INTEGER NOT NULL DEFAULT 0,
  language TEXT NOT NULL DEFAULT 'de' CHECK (language IN ('de', 'en')),
  date_format TEXT NOT NULL DEFAULT 'de-DE',
  time_format TEXT NOT NULL DEFAULT '24h' CHECK (time_format IN ('24h', '12h')),
  timezone TEXT NOT NULL DEFAULT 'Europe/Berlin',
  spellcheck INTEGER NOT NULL DEFAULT 1,
  voice_input_device TEXT,
  voice_output_device TEXT,
  voice_camera_device TEXT,
  voice_input_mode TEXT NOT NULL DEFAULT 'voice_activity' CHECK (voice_input_mode IN ('voice_activity', 'push_to_talk')),
  voice_sensitivity INTEGER NOT NULL DEFAULT 50,
  voice_noise_suppression INTEGER NOT NULL DEFAULT 1,
  voice_echo_cancellation INTEGER NOT NULL DEFAULT 1,
  voice_auto_gain INTEGER NOT NULL DEFAULT 1,
  push_to_talk_key TEXT NOT NULL DEFAULT 'Space',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_security (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  totp_secret_encrypted TEXT,
  totp_pending_encrypted TEXT,
  two_factor_enabled INTEGER NOT NULL DEFAULT 0,
  deactivated_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_connections (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  display_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_user_connections_user ON user_connections(user_id);
