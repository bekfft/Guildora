-- dialect:postgres
ALTER TABLE bot_applications ADD COLUMN public_bot BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE bot_applications ADD COLUMN default_scopes TEXT NOT NULL DEFAULT '["messages.write","commands"]';

-- dialect:sqlite
ALTER TABLE bot_applications ADD COLUMN public_bot INTEGER NOT NULL DEFAULT 1;
ALTER TABLE bot_applications ADD COLUMN default_scopes TEXT NOT NULL DEFAULT '["messages.write","commands"]';
