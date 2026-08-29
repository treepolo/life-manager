PRAGMA foreign_keys = ON;

CREATE TABLE task_categories_v2 (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  description TEXT NOT NULL DEFAULT '',
  archived_at TEXT,
  deleted_at TEXT,
  source_type TEXT NOT NULL DEFAULT 'MANUAL',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX idx_task_categories_v2_active
  ON task_categories_v2(name)
  WHERE deleted_at IS NULL AND archived_at IS NULL;

CREATE TABLE daily_tasks_v2 (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES task_categories_v2(id) ON DELETE RESTRICT,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 180),
  description TEXT NOT NULL DEFAULT '',
  archived_at TEXT,
  deleted_at TEXT,
  source_type TEXT NOT NULL DEFAULT 'MANUAL',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX idx_daily_tasks_v2_category
  ON daily_tasks_v2(category_id)
  WHERE deleted_at IS NULL;

CREATE TABLE daily_task_completions_v2 (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES daily_tasks_v2(id) ON DELETE RESTRICT,
  completed_local_date TEXT NOT NULL,
  completed_at TEXT NOT NULL,
  deleted_at TEXT,
  source_type TEXT NOT NULL DEFAULT 'MANUAL',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX uq_daily_task_completions_v2_active_day
  ON daily_task_completions_v2(task_id, completed_local_date)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_daily_task_completions_v2_date
  ON daily_task_completions_v2(completed_local_date)
  WHERE deleted_at IS NULL;

CREATE TABLE financial_goals_v2 (
  id TEXT PRIMARY KEY,
  goal_kind TEXT NOT NULL UNIQUE CHECK (goal_kind IN ('MONTHLY_INCOME', 'SAVINGS')),
  amount_minor INTEGER CHECK (amount_minor IS NULL OR amount_minor >= 0),
  currency_code TEXT NOT NULL DEFAULT 'TWD' CHECK (currency_code = 'TWD'),
  minor_unit_scale INTEGER NOT NULL DEFAULT 0 CHECK (minor_unit_scale = 0),
  deleted_at TEXT,
  source_type TEXT NOT NULL DEFAULT 'MANUAL',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE financial_history_v2 (
  id TEXT PRIMARY KEY,
  metric_kind TEXT NOT NULL CHECK (metric_kind IN ('MONTHLY_INCOME', 'SAVINGS')),
  effective_local_date TEXT NOT NULL,
  amount_minor INTEGER NOT NULL,
  currency_code TEXT NOT NULL DEFAULT 'TWD' CHECK (currency_code = 'TWD'),
  minor_unit_scale INTEGER NOT NULL DEFAULT 0 CHECK (minor_unit_scale = 0),
  deleted_at TEXT,
  source_type TEXT NOT NULL DEFAULT 'MANUAL',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  CHECK (metric_kind = 'SAVINGS' OR amount_minor >= 0)
);

CREATE INDEX idx_financial_history_v2_metric_date
  ON financial_history_v2(metric_kind, effective_local_date, updated_at)
  WHERE deleted_at IS NULL;

INSERT INTO financial_goals_v2
  (id, goal_kind, amount_minor, currency_code, minor_unit_scale, source_type, created_at, updated_at, version)
VALUES
  ('00000000-0000-7000-8000-000000000001', 'MONTHLY_INCOME', NULL, 'TWD', 0, 'SYSTEM', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1),
  ('00000000-0000-7000-8000-000000000002', 'SAVINGS', NULL, 'TWD', 0, 'SYSTEM', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1);

UPDATE schema_metadata
SET value = '11', updated_at = CURRENT_TIMESTAMP
WHERE key = 'application_schema_version';
