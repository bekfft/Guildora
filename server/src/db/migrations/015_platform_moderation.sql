-- dialect:postgres
CREATE TABLE IF NOT EXISTS platform_staff (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('support','moderation','administration','management')),
  is_owner BOOLEAN NOT NULL DEFAULT FALSE,
  assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS platform_cases (
  id UUID PRIMARY KEY, source_type TEXT NOT NULL DEFAULT 'manual', source_id UUID,
  reporter_id UUID REFERENCES users(id) ON DELETE SET NULL,
  target_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  guild_id UUID REFERENCES guilds(id) ON DELETE SET NULL,
  category TEXT NOT NULL DEFAULT 'other', reason TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','critical')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewing','resolved','dismissed')),
  assignee_id UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_by UUID REFERENCES users(id) ON DELETE SET NULL, resolution TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS platform_case_notes (
  id UUID PRIMARY KEY, case_id UUID NOT NULL REFERENCES platform_cases(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, body TEXT NOT NULL,
  internal BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS platform_case_evidence (
  id UUID PRIMARY KEY, case_id UUID NOT NULL REFERENCES platform_cases(id) ON DELETE CASCADE,
  type TEXT NOT NULL, snapshot TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS global_sanctions (
  id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('warning','restrict_social','restrict_dms','restrict_guild_creation','restrict_communication','suspension','ban')),
  reason TEXT NOT NULL, case_id UUID REFERENCES platform_cases(id) ON DELETE SET NULL,
  issued_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT, expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ, revoked_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS guild_platform_restrictions (
  id UUID PRIMARY KEY, guild_id UUID NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('discovery_hidden','restricted','suspended')),
  reason TEXT NOT NULL, case_id UUID REFERENCES platform_cases(id) ON DELETE SET NULL,
  issued_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT, expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ, revoked_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS platform_appeals (
  id UUID PRIMARY KEY, appellant_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sanction_id UUID REFERENCES global_sanctions(id) ON DELETE SET NULL,
  guild_restriction_id UUID REFERENCES guild_platform_restrictions(id) ON DELETE SET NULL,
  message TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewing','accepted','rejected')),
  reviewer_id UUID REFERENCES users(id) ON DELETE SET NULL, response TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS staff_audit_logs (
  id UUID PRIMARY KEY, actor_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action TEXT NOT NULL, target_type TEXT NOT NULL, target_id TEXT,
  case_id UUID REFERENCES platform_cases(id) ON DELETE SET NULL, details TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS platform_approvals (
  id UUID PRIMARY KEY, requester_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  approver_id UUID REFERENCES users(id) ON DELETE SET NULL, action TEXT NOT NULL,
  target_type TEXT NOT NULL, target_id TEXT NOT NULL, payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, decided_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_platform_cases_queue ON platform_cases(status, priority, created_at);
CREATE INDEX IF NOT EXISTS idx_global_sanctions_user ON global_sanctions(user_id, revoked_at, expires_at);
CREATE INDEX IF NOT EXISTS idx_guild_platform_restrictions_guild ON guild_platform_restrictions(guild_id, revoked_at, expires_at);
CREATE INDEX IF NOT EXISTS idx_staff_audit_created ON staff_audit_logs(created_at);
INSERT INTO platform_staff (user_id, role, is_owner)
SELECT id, 'management', TRUE FROM users WHERE LOWER(username) = 'bekfft'
ON CONFLICT (user_id) DO UPDATE SET role = 'management', is_owner = TRUE, updated_at = CURRENT_TIMESTAMP;

-- dialect:sqlite
CREATE TABLE IF NOT EXISTS platform_staff (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('support','moderation','administration','management')),
  is_owner INTEGER NOT NULL DEFAULT 0,
  assigned_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS platform_cases (
  id TEXT PRIMARY KEY, source_type TEXT NOT NULL DEFAULT 'manual', source_id TEXT,
  reporter_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  target_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  guild_id TEXT REFERENCES guilds(id) ON DELETE SET NULL,
  category TEXT NOT NULL DEFAULT 'other', reason TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','critical')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewing','resolved','dismissed')),
  assignee_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  resolved_by TEXT REFERENCES users(id) ON DELETE SET NULL, resolution TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, resolved_at TEXT
);
CREATE TABLE IF NOT EXISTS platform_case_notes (
  id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES platform_cases(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, body TEXT NOT NULL,
  internal INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS platform_case_evidence (
  id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES platform_cases(id) ON DELETE CASCADE,
  type TEXT NOT NULL, snapshot TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS global_sanctions (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('warning','restrict_social','restrict_dms','restrict_guild_creation','restrict_communication','suspension','ban')),
  reason TEXT NOT NULL, case_id TEXT REFERENCES platform_cases(id) ON DELETE SET NULL,
  issued_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, expires_at TEXT,
  revoked_at TEXT, revoked_by TEXT REFERENCES users(id) ON DELETE SET NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS guild_platform_restrictions (
  id TEXT PRIMARY KEY, guild_id TEXT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('discovery_hidden','restricted','suspended')),
  reason TEXT NOT NULL, case_id TEXT REFERENCES platform_cases(id) ON DELETE SET NULL,
  issued_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, expires_at TEXT,
  revoked_at TEXT, revoked_by TEXT REFERENCES users(id) ON DELETE SET NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS platform_appeals (
  id TEXT PRIMARY KEY, appellant_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sanction_id TEXT REFERENCES global_sanctions(id) ON DELETE SET NULL,
  guild_restriction_id TEXT REFERENCES guild_platform_restrictions(id) ON DELETE SET NULL,
  message TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewing','accepted','rejected')),
  reviewer_id TEXT REFERENCES users(id) ON DELETE SET NULL, response TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS staff_audit_logs (
  id TEXT PRIMARY KEY, actor_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action TEXT NOT NULL, target_type TEXT NOT NULL, target_id TEXT,
  case_id TEXT REFERENCES platform_cases(id) ON DELETE SET NULL, details TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS platform_approvals (
  id TEXT PRIMARY KEY, requester_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  approver_id TEXT REFERENCES users(id) ON DELETE SET NULL, action TEXT NOT NULL,
  target_type TEXT NOT NULL, target_id TEXT NOT NULL, payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, decided_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_platform_cases_queue ON platform_cases(status, priority, created_at);
CREATE INDEX IF NOT EXISTS idx_global_sanctions_user ON global_sanctions(user_id, revoked_at, expires_at);
CREATE INDEX IF NOT EXISTS idx_guild_platform_restrictions_guild ON guild_platform_restrictions(guild_id, revoked_at, expires_at);
CREATE INDEX IF NOT EXISTS idx_staff_audit_created ON staff_audit_logs(created_at);
INSERT INTO platform_staff (user_id, role, is_owner)
SELECT id, 'management', 1 FROM users WHERE LOWER(username) = 'bekfft'
ON CONFLICT(user_id) DO UPDATE SET role = 'management', is_owner = 1, updated_at = CURRENT_TIMESTAMP;
