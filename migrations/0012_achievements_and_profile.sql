PRAGMA foreign_keys = ON;

ALTER TABLE daily_tasks_v2
ADD COLUMN achievement_name TEXT NOT NULL DEFAULT '' CHECK (length(trim(achievement_name)) <= 120);

ALTER TABLE daily_tasks_v2
ADD COLUMN achievement_unit TEXT NOT NULL DEFAULT '' CHECK (length(trim(achievement_unit)) <= 24);

CREATE TABLE user_profile_v2 (
  id TEXT PRIMARY KEY CHECK (id = '00000000-0000-7000-8000-000000000003'),
  birth_date TEXT,
  deleted_at TEXT,
  source_type TEXT NOT NULL DEFAULT 'SYSTEM',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);

INSERT INTO user_profile_v2
  (id, birth_date, source_type, created_at, updated_at, version)
VALUES
  ('00000000-0000-7000-8000-000000000003', NULL, 'SYSTEM', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1);

UPDATE schema_metadata
SET value = '12', updated_at = CURRENT_TIMESTAMP
WHERE key = 'application_schema_version';
