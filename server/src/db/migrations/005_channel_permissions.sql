-- dialect:postgres
CREATE TABLE IF NOT EXISTS channel_role_permissions (
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  view_channel SMALLINT NOT NULL DEFAULT 0 CHECK (view_channel IN (-1, 0, 1)),
  read_history SMALLINT NOT NULL DEFAULT 0 CHECK (read_history IN (-1, 0, 1)),
  send_messages SMALLINT NOT NULL DEFAULT 0 CHECK (send_messages IN (-1, 0, 1)),
  attach_files SMALLINT NOT NULL DEFAULT 0 CHECK (attach_files IN (-1, 0, 1)),
  manage_messages SMALLINT NOT NULL DEFAULT 0 CHECK (manage_messages IN (-1, 0, 1)),
  PRIMARY KEY (channel_id, role_id)
);
CREATE INDEX IF NOT EXISTS idx_channel_permissions_role ON channel_role_permissions(role_id);

-- dialect:sqlite
CREATE TABLE IF NOT EXISTS channel_role_permissions (
  channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  view_channel INTEGER NOT NULL DEFAULT 0 CHECK (view_channel IN (-1, 0, 1)),
  read_history INTEGER NOT NULL DEFAULT 0 CHECK (read_history IN (-1, 0, 1)),
  send_messages INTEGER NOT NULL DEFAULT 0 CHECK (send_messages IN (-1, 0, 1)),
  attach_files INTEGER NOT NULL DEFAULT 0 CHECK (attach_files IN (-1, 0, 1)),
  manage_messages INTEGER NOT NULL DEFAULT 0 CHECK (manage_messages IN (-1, 0, 1)),
  PRIMARY KEY (channel_id, role_id)
);
CREATE INDEX IF NOT EXISTS idx_channel_permissions_role ON channel_role_permissions(role_id);
