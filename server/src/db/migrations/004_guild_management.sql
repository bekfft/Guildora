-- dialect:postgres
CREATE TABLE IF NOT EXISTS role_permissions (
  role_id UUID PRIMARY KEY REFERENCES roles(id) ON DELETE CASCADE,
  manage_server BOOLEAN NOT NULL DEFAULT FALSE,
  manage_channels BOOLEAN NOT NULL DEFAULT FALSE,
  manage_roles BOOLEAN NOT NULL DEFAULT FALSE,
  kick_members BOOLEAN NOT NULL DEFAULT FALSE,
  manage_messages BOOLEAN NOT NULL DEFAULT FALSE
);
INSERT INTO role_permissions
(role_id, manage_server, manage_channels, manage_roles, kick_members, manage_messages)
SELECT id, TRUE, TRUE, TRUE, TRUE, TRUE FROM roles WHERE LOWER(name) = 'admin'
ON CONFLICT(role_id) DO NOTHING;

-- dialect:sqlite
CREATE TABLE IF NOT EXISTS role_permissions (
  role_id TEXT PRIMARY KEY REFERENCES roles(id) ON DELETE CASCADE,
  manage_server INTEGER NOT NULL DEFAULT 0,
  manage_channels INTEGER NOT NULL DEFAULT 0,
  manage_roles INTEGER NOT NULL DEFAULT 0,
  kick_members INTEGER NOT NULL DEFAULT 0,
  manage_messages INTEGER NOT NULL DEFAULT 0
);
INSERT INTO role_permissions
(role_id, manage_server, manage_channels, manage_roles, kick_members, manage_messages)
SELECT id, 1, 1, 1, 1, 1 FROM roles WHERE LOWER(name) = 'admin'
ON CONFLICT(role_id) DO NOTHING;
