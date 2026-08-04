-- dialect:postgres
UPDATE users
SET avatar_url = '/icons/guildora-192.png'
WHERE avatar_url IS NULL OR TRIM(avatar_url) = '';
ALTER TABLE users ALTER COLUMN avatar_url SET DEFAULT '/icons/guildora-192.png';

-- dialect:sqlite
UPDATE users
SET avatar_url = '/icons/guildora-192.png'
WHERE avatar_url IS NULL OR TRIM(avatar_url) = '';
CREATE TRIGGER IF NOT EXISTS users_default_avatar_after_insert
AFTER INSERT ON users
WHEN NEW.avatar_url IS NULL OR TRIM(NEW.avatar_url) = ''
BEGIN
  UPDATE users SET avatar_url = '/icons/guildora-192.png' WHERE id = NEW.id;
END;
