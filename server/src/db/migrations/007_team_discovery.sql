-- dialect:postgres
UPDATE guilds
SET is_verified = CASE WHEN is_official = TRUE THEN TRUE ELSE FALSE END,
    is_public = CASE WHEN is_official = TRUE THEN TRUE ELSE FALSE END;

-- dialect:sqlite
UPDATE guilds
SET is_verified = CASE WHEN is_official = 1 THEN 1 ELSE 0 END,
    is_public = CASE WHEN is_official = 1 THEN 1 ELSE 0 END;
