-- dialect:postgres
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS activity_status BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS detect_games BOOLEAN NOT NULL DEFAULT TRUE;

-- dialect:sqlite
ALTER TABLE user_settings ADD COLUMN activity_status INTEGER NOT NULL DEFAULT 1;
ALTER TABLE user_settings ADD COLUMN detect_games INTEGER NOT NULL DEFAULT 1;
