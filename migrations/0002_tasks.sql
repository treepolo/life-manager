PRAGMA foreign_keys = ON;

CREATE TABLE task_definitions (
  id TEXT PRIMARY KEY,
  area_id TEXT REFERENCES areas(id) ON DELETE RESTRICT,
  business_id TEXT REFERENCES businesses(id) ON DELETE RESTRICT,
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 240),
  description TEXT NOT NULL DEFAULT '',
  why_text TEXT NOT NULL DEFAULT '',
  completion_criteria TEXT NOT NULL DEFAULT '',
  low_clarity_guide TEXT NOT NULL DEFAULT '',
  metric_role TEXT CHECK (metric_role IS NULL OR metric_role IN ('ACTION','SYSTEM','CONDITION','CAPABILITY','OUTCOME')),
  estimated_minutes INTEGER CHECK (estimated_minutes IS NULL OR estimated_minutes >= 0),
  priority INTEGER NOT NULL DEFAULT 50 CHECK (priority BETWEEN 0 AND 100),
  pinned_next_action INTEGER NOT NULL DEFAULT 0 CHECK (pinned_next_action IN (0,1)),
  archived_at TEXT,
  deleted_at TEXT,
  source_type TEXT NOT NULL DEFAULT 'MANUAL',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE task_schedules (
  id TEXT PRIMARY KEY,
  task_definition_id TEXT NOT NULL REFERENCES task_definitions(id) ON DELETE RESTRICT,
  recurrence_kind TEXT NOT NULL CHECK (recurrence_kind IN ('ONCE','DAILY','WEEKLY','MONTHLY','CUSTOM_RRULE')),
  starts_on_local_date TEXT NOT NULL,
  due_local_time TEXT,
  timezone TEXT NOT NULL DEFAULT 'Asia/Taipei',
  weekdays_json TEXT CHECK (weekdays_json IS NULL OR json_valid(weekdays_json)),
  month_day INTEGER CHECK (month_day IS NULL OR month_day BETWEEN 1 AND 31),
  rrule_text TEXT,
  interval_value INTEGER NOT NULL DEFAULT 1 CHECK (interval_value > 0),
  ends_on_local_date TEXT,
  deleted_at TEXT,
  source_type TEXT NOT NULL DEFAULT 'MANUAL',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX idx_task_schedules_task ON task_schedules(task_definition_id);

CREATE TABLE task_occurrences (
  id TEXT PRIMARY KEY,
  task_definition_id TEXT NOT NULL REFERENCES task_definitions(id) ON DELETE RESTRICT,
  task_schedule_id TEXT REFERENCES task_schedules(id) ON DELETE RESTRICT,
  scheduled_local_date TEXT NOT NULL,
  due_at TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','COMPLETED','DEFERRED','SKIPPED')),
  deferred_to_local_date TEXT,
  generated_from_schedule_version INTEGER NOT NULL,
  deleted_at TEXT,
  source_type TEXT NOT NULL DEFAULT 'SYSTEM',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  UNIQUE(task_definition_id, task_schedule_id, scheduled_local_date)
);

CREATE INDEX idx_task_occurrences_today ON task_occurrences(status, scheduled_local_date);

CREATE TABLE task_completions (
  id TEXT PRIMARY KEY,
  task_definition_id TEXT NOT NULL REFERENCES task_definitions(id) ON DELETE RESTRICT,
  task_occurrence_id TEXT REFERENCES task_occurrences(id) ON DELETE RESTRICT,
  scheduled_local_date TEXT NOT NULL,
  completed_at TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  numeric_value TEXT,
  metric_definition_id TEXT REFERENCES metric_definitions(id) ON DELETE RESTRICT,
  source_type TEXT NOT NULL DEFAULT 'MANUAL',
  created_at TEXT NOT NULL
);

CREATE INDEX idx_task_completions_history ON task_completions(task_definition_id, completed_at);
