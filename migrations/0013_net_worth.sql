PRAGMA foreign_keys = ON;

ALTER TABLE financial_goals_v2 RENAME TO financial_goals_v2_legacy;

CREATE TABLE financial_goals_v2 (
  id TEXT PRIMARY KEY,
  goal_kind TEXT NOT NULL UNIQUE CHECK (goal_kind IN ('MONTHLY_INCOME', 'NET_WORTH')),
  amount_minor INTEGER CHECK (amount_minor IS NULL OR amount_minor >= 0),
  currency_code TEXT NOT NULL DEFAULT 'TWD' CHECK (currency_code = 'TWD'),
  minor_unit_scale INTEGER NOT NULL DEFAULT 0 CHECK (minor_unit_scale = 0),
  deleted_at TEXT,
  source_type TEXT NOT NULL DEFAULT 'MANUAL',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);

INSERT INTO financial_goals_v2
  (id, goal_kind, amount_minor, currency_code, minor_unit_scale, deleted_at, source_type, created_at, updated_at, version)
SELECT
  id,
  CASE goal_kind WHEN 'SAVINGS' THEN 'NET_WORTH' ELSE goal_kind END,
  amount_minor,
  currency_code,
  minor_unit_scale,
  deleted_at,
  source_type,
  created_at,
  updated_at,
  version
FROM financial_goals_v2_legacy;

DROP TABLE financial_goals_v2_legacy;

ALTER TABLE financial_history_v2 RENAME TO financial_history_v2_legacy;

CREATE TABLE financial_history_v2 (
  id TEXT PRIMARY KEY,
  metric_kind TEXT NOT NULL CHECK (metric_kind IN ('MONTHLY_INCOME', 'NET_WORTH')),
  effective_local_date TEXT NOT NULL,
  amount_minor INTEGER NOT NULL,
  currency_code TEXT NOT NULL DEFAULT 'TWD' CHECK (currency_code = 'TWD'),
  minor_unit_scale INTEGER NOT NULL DEFAULT 0 CHECK (minor_unit_scale = 0),
  deleted_at TEXT,
  source_type TEXT NOT NULL DEFAULT 'MANUAL',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  CHECK (metric_kind = 'NET_WORTH' OR amount_minor >= 0)
);

INSERT INTO financial_history_v2
  (id, metric_kind, effective_local_date, amount_minor, currency_code, minor_unit_scale, deleted_at, source_type, created_at, updated_at, version)
SELECT
  id,
  CASE metric_kind WHEN 'SAVINGS' THEN 'NET_WORTH' ELSE metric_kind END,
  effective_local_date,
  amount_minor,
  currency_code,
  minor_unit_scale,
  deleted_at,
  source_type,
  created_at,
  updated_at,
  version
FROM financial_history_v2_legacy;

DROP TABLE financial_history_v2_legacy;

CREATE INDEX idx_financial_history_v2_metric_date
  ON financial_history_v2(metric_kind, effective_local_date, updated_at)
  WHERE deleted_at IS NULL;

UPDATE schema_metadata
SET value = '13', updated_at = CURRENT_TIMESTAMP
WHERE key = 'application_schema_version';
