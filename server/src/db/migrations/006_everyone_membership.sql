-- dialect:postgres
UPDATE roles SET name = '@everyone' WHERE is_default = TRUE;

DELETE FROM member_roles
WHERE role_id IN (SELECT id FROM roles WHERE is_default = TRUE);

DELETE FROM member_roles
WHERE member_id IN (
  SELECT gm.id
  FROM guild_members gm
  JOIN guilds g ON g.id = gm.guild_id AND g.owner_id = gm.user_id
);

DELETE FROM roles
WHERE is_default = FALSE
  AND LOWER(name) = 'admin'
  AND LOWER(COALESCE(color, '')) = '#f23f43'
  AND position = 20
  AND EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp.role_id = roles.id
      AND rp.manage_server = TRUE
      AND rp.manage_channels = TRUE
      AND rp.manage_roles = TRUE
      AND rp.kick_members = TRUE
      AND rp.manage_messages = TRUE
  );

DELETE FROM roles
WHERE is_default = FALSE
  AND LOWER(name) = 'moderator'
  AND LOWER(COALESCE(color, '')) = '#4e8dfc'
  AND position = 10
  AND guild_id IN (SELECT id FROM guilds WHERE is_official = TRUE);

-- dialect:sqlite
UPDATE roles SET name = '@everyone' WHERE is_default = 1;

DELETE FROM member_roles
WHERE role_id IN (SELECT id FROM roles WHERE is_default = 1);

DELETE FROM member_roles
WHERE member_id IN (
  SELECT gm.id
  FROM guild_members gm
  JOIN guilds g ON g.id = gm.guild_id AND g.owner_id = gm.user_id
);

DELETE FROM roles
WHERE is_default = 0
  AND LOWER(name) = 'admin'
  AND LOWER(COALESCE(color, '')) = '#f23f43'
  AND position = 20
  AND EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp.role_id = roles.id
      AND rp.manage_server = 1
      AND rp.manage_channels = 1
      AND rp.manage_roles = 1
      AND rp.kick_members = 1
      AND rp.manage_messages = 1
  );

DELETE FROM roles
WHERE is_default = 0
  AND LOWER(name) = 'moderator'
  AND LOWER(COALESCE(color, '')) = '#4e8dfc'
  AND position = 10
  AND guild_id IN (SELECT id FROM guilds WHERE is_official = 1);
