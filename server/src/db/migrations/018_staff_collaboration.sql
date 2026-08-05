-- dialect:postgres
CREATE TABLE IF NOT EXISTS platform_staff_permissions (
  user_id UUID PRIMARY KEY REFERENCES platform_staff(user_id) ON DELETE CASCADE,
  custom_permissions TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS platform_case_watchers (
  case_id UUID NOT NULL REFERENCES platform_cases(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  added_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (case_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_platform_case_watchers_user ON platform_case_watchers(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS platform_case_mentions (
  id UUID PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES platform_cases(id) ON DELETE CASCADE,
  note_id UUID NOT NULL REFERENCES platform_case_notes(id) ON DELETE CASCADE,
  mentioned_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mentioned_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (note_id, mentioned_user_id)
);

CREATE TABLE IF NOT EXISTS platform_appeal_messages (
  id UUID PRIMARY KEY,
  appeal_id UUID NOT NULL REFERENCES platform_appeals(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  is_staff BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_platform_appeal_messages_thread ON platform_appeal_messages(appeal_id, created_at);

-- dialect:sqlite
CREATE TABLE IF NOT EXISTS platform_staff_permissions (
  user_id TEXT PRIMARY KEY REFERENCES platform_staff(user_id) ON DELETE CASCADE,
  custom_permissions TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS platform_case_watchers (
  case_id TEXT NOT NULL REFERENCES platform_cases(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  added_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (case_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_platform_case_watchers_user ON platform_case_watchers(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS platform_case_mentions (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES platform_cases(id) ON DELETE CASCADE,
  note_id TEXT NOT NULL REFERENCES platform_case_notes(id) ON DELETE CASCADE,
  mentioned_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mentioned_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (note_id, mentioned_user_id)
);

CREATE TABLE IF NOT EXISTS platform_appeal_messages (
  id TEXT PRIMARY KEY,
  appeal_id TEXT NOT NULL REFERENCES platform_appeals(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  is_staff INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_platform_appeal_messages_thread ON platform_appeal_messages(appeal_id, created_at);
