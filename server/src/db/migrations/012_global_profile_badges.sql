-- dialect:postgres
CREATE TABLE IF NOT EXISTS profile_badges (
  id UUID PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  icon TEXT NOT NULL,
  color_start TEXT NOT NULL,
  color_end TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_badges (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_id UUID NOT NULL REFERENCES profile_badges(id) ON DELETE CASCADE,
  awarded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  display_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, badge_id)
);
CREATE INDEX IF NOT EXISTS idx_user_badges_user_order
  ON user_badges(user_id, display_order, awarded_at);

INSERT INTO profile_badges
  (id, slug, name, description, icon, color_start, color_end, sort_order)
VALUES
  ('00000000-0000-4000-8000-000000000001', 'guildora-team', 'Guildora-Team', 'Offizielles Mitglied des Guildora-Teams.', 'crown', '#7C5CFF', '#B65CFF', 10),
  ('00000000-0000-4000-8000-000000000002', 'founding-member', 'Gründungsmitglied', 'Von Anfang an Teil der Guildora-Community.', 'gem', '#E8A83E', '#FF6B6B', 20),
  ('00000000-0000-4000-8000-000000000003', 'supporter', 'Unterstützer', 'Unterstützt Guildora und seine Weiterentwicklung.', 'heart', '#F45B9A', '#FF7A59', 30),
  ('00000000-0000-4000-8000-000000000004', 'bug-hunter', 'Bugjäger', 'Hat Guildora mit hilfreichen Fehlermeldungen verbessert.', 'bug', '#29B6A6', '#4E8DFC', 40),
  ('00000000-0000-4000-8000-000000000005', 'community-helper', 'Community-Helfer', 'Hilft anderen und stärkt die Guildora-Community.', 'handshake', '#43B581', '#2EC4B6', 50),
  ('00000000-0000-4000-8000-000000000006', 'verified-creator', 'Verifizierter Creator', 'Verifizierter Creator und offizieller Guildora-Partner.', 'badge-check', '#4E8DFC', '#7C5CFF', 60)
ON CONFLICT (id) DO NOTHING;

INSERT INTO user_badges (user_id, badge_id, display_order)
SELECT u.id, b.id, b.sort_order
FROM users u
CROSS JOIN profile_badges b
WHERE LOWER(u.username) = 'bekfft'
  AND b.slug IN (
    'guildora-team',
    'founding-member',
    'supporter',
    'bug-hunter',
    'community-helper',
    'verified-creator'
  )
ON CONFLICT (user_id, badge_id) DO NOTHING;

-- dialect:sqlite
CREATE TABLE IF NOT EXISTS profile_badges (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  icon TEXT NOT NULL,
  color_start TEXT NOT NULL,
  color_end TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_badges (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_id TEXT NOT NULL REFERENCES profile_badges(id) ON DELETE CASCADE,
  awarded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  display_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, badge_id)
);
CREATE INDEX IF NOT EXISTS idx_user_badges_user_order
  ON user_badges(user_id, display_order, awarded_at);

INSERT INTO profile_badges
  (id, slug, name, description, icon, color_start, color_end, sort_order)
VALUES
  ('00000000-0000-4000-8000-000000000001', 'guildora-team', 'Guildora-Team', 'Offizielles Mitglied des Guildora-Teams.', 'crown', '#7C5CFF', '#B65CFF', 10),
  ('00000000-0000-4000-8000-000000000002', 'founding-member', 'Gründungsmitglied', 'Von Anfang an Teil der Guildora-Community.', 'gem', '#E8A83E', '#FF6B6B', 20),
  ('00000000-0000-4000-8000-000000000003', 'supporter', 'Unterstützer', 'Unterstützt Guildora und seine Weiterentwicklung.', 'heart', '#F45B9A', '#FF7A59', 30),
  ('00000000-0000-4000-8000-000000000004', 'bug-hunter', 'Bugjäger', 'Hat Guildora mit hilfreichen Fehlermeldungen verbessert.', 'bug', '#29B6A6', '#4E8DFC', 40),
  ('00000000-0000-4000-8000-000000000005', 'community-helper', 'Community-Helfer', 'Hilft anderen und stärkt die Guildora-Community.', 'handshake', '#43B581', '#2EC4B6', 50),
  ('00000000-0000-4000-8000-000000000006', 'verified-creator', 'Verifizierter Creator', 'Verifizierter Creator und offizieller Guildora-Partner.', 'badge-check', '#4E8DFC', '#7C5CFF', 60)
ON CONFLICT (id) DO NOTHING;

INSERT INTO user_badges (user_id, badge_id, display_order)
SELECT u.id, b.id, b.sort_order
FROM users u
CROSS JOIN profile_badges b
WHERE LOWER(u.username) = 'bekfft'
  AND b.slug IN (
    'guildora-team',
    'founding-member',
    'supporter',
    'bug-hunter',
    'community-helper',
    'verified-creator'
  )
ON CONFLICT (user_id, badge_id) DO NOTHING;
