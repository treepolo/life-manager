PRAGMA foreign_keys = ON;

CREATE TABLE schema_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO schema_metadata (key, value, updated_at)
VALUES ('application_schema_version', '1', CURRENT_TIMESTAMP);

CREATE TABLE areas (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  description TEXT NOT NULL DEFAULT '',
  why_text TEXT NOT NULL DEFAULT '',
  principles_text TEXT NOT NULL DEFAULT '',
  strategy_text TEXT NOT NULL DEFAULT '',
  next_action_text TEXT NOT NULL DEFAULT '',
  low_clarity_guide TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  archived_at TEXT,
  deleted_at TEXT,
  source_type TEXT NOT NULL CHECK (source_type IN ('MANUAL','CSV_IMPORT','YOUTUBE_API','INSTAGRAM_API','DERIVED','SYSTEM')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0)
);

CREATE UNIQUE INDEX idx_areas_active_name ON areas(name) WHERE deleted_at IS NULL;
CREATE INDEX idx_areas_sort ON areas(archived_at, sort_order, name);

CREATE TABLE businesses (
  id TEXT PRIMARY KEY,
  area_id TEXT NOT NULL REFERENCES areas(id) ON DELETE RESTRICT,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 160),
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','PAUSED','COMPLETED')),
  why_text TEXT NOT NULL DEFAULT '',
  principles_text TEXT NOT NULL DEFAULT '',
  strategy_text TEXT NOT NULL DEFAULT '',
  next_action_text TEXT NOT NULL DEFAULT '',
  low_clarity_guide TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  archived_at TEXT,
  deleted_at TEXT,
  source_type TEXT NOT NULL CHECK (source_type IN ('MANUAL','CSV_IMPORT','YOUTUBE_API','INSTAGRAM_API','DERIVED','SYSTEM')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0)
);

CREATE UNIQUE INDEX idx_businesses_active_name ON businesses(area_id, name) WHERE deleted_at IS NULL;
CREATE INDEX idx_businesses_area_sort ON businesses(area_id, archived_at, sort_order, name);

CREATE TABLE entity_links (
  id TEXT PRIMARY KEY,
  from_type TEXT NOT NULL,
  from_id TEXT NOT NULL,
  to_type TEXT NOT NULL,
  to_id TEXT NOT NULL,
  relation_type TEXT NOT NULL,
  deleted_at TEXT,
  source_type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  UNIQUE(from_type, from_id, to_type, to_id, relation_type)
);

CREATE TABLE tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color_token TEXT NOT NULL DEFAULT 'neutral',
  archived_at TEXT,
  deleted_at TEXT,
  source_type TEXT NOT NULL DEFAULT 'MANUAL',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX idx_tags_active_name ON tags(name) WHERE deleted_at IS NULL;

CREATE TABLE entity_tags (
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  PRIMARY KEY(entity_type, entity_id, tag_id)
);

CREATE TABLE event_types (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color_token TEXT NOT NULL DEFAULT 'event',
  archived_at TEXT,
  deleted_at TEXT,
  source_type TEXT NOT NULL DEFAULT 'MANUAL',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX idx_event_types_active_name ON event_types(name) WHERE deleted_at IS NULL;

CREATE TABLE events (
  id TEXT PRIMARY KEY,
  event_type_id TEXT NOT NULL REFERENCES event_types(id) ON DELETE RESTRICT,
  area_id TEXT REFERENCES areas(id) ON DELETE RESTRICT,
  business_id TEXT REFERENCES businesses(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  input_timezone TEXT NOT NULL DEFAULT 'Asia/Taipei',
  source_reference TEXT,
  archived_at TEXT,
  deleted_at TEXT,
  source_type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  CHECK (ends_at IS NULL OR ends_at >= starts_at)
);

CREATE INDEX idx_events_timeline ON events(starts_at, ends_at);

CREATE TABLE metric_definitions (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  unit TEXT NOT NULL,
  value_type TEXT NOT NULL CHECK (value_type IN ('INTEGER','DECIMAL','PERCENTAGE','DURATION','TEXT')),
  role TEXT NOT NULL CHECK (role IN ('ACTION','SYSTEM','CONDITION','CAPABILITY','OUTCOME')),
  domain TEXT NOT NULL,
  area_id TEXT REFERENCES areas(id) ON DELETE RESTRICT,
  business_id TEXT REFERENCES businesses(id) ON DELETE RESTRICT,
  recording_frequency TEXT NOT NULL DEFAULT 'AD_HOC',
  source_policy TEXT NOT NULL DEFAULT 'MANUAL',
  precision INTEGER NOT NULL DEFAULT 2 CHECK (precision BETWEEN 0 AND 12),
  archived_at TEXT,
  deleted_at TEXT,
  source_type TEXT NOT NULL DEFAULT 'MANUAL',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX idx_metric_definitions_active_key ON metric_definitions(key) WHERE deleted_at IS NULL;

CREATE TABLE metric_observations (
  id TEXT PRIMARY KEY,
  metric_definition_id TEXT NOT NULL REFERENCES metric_definitions(id) ON DELETE RESTRICT,
  observed_at TEXT NOT NULL,
  input_local_date TEXT,
  input_timezone TEXT NOT NULL DEFAULT 'Asia/Taipei',
  value_decimal TEXT,
  value_text TEXT,
  quality TEXT NOT NULL DEFAULT 'EXACT' CHECK (quality IN ('EXACT','NEAREST','INTERPOLATED','INSUFFICIENT','MANUAL','SOURCE_REPORTED')),
  source_ref_type TEXT,
  source_ref_id TEXT,
  deleted_at TEXT,
  source_type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  CHECK ((value_decimal IS NOT NULL) <> (value_text IS NOT NULL))
);

CREATE INDEX idx_metric_observations_series ON metric_observations(metric_definition_id, observed_at);

CREATE TABLE formula_definitions (
  id TEXT PRIMARY KEY,
  metric_definition_id TEXT NOT NULL REFERENCES metric_definitions(id) ON DELETE RESTRICT,
  formula_version INTEGER NOT NULL CHECK (formula_version > 0),
  expression TEXT NOT NULL,
  ast_json TEXT NOT NULL CHECK (json_valid(ast_json)),
  window_json TEXT NOT NULL CHECK (json_valid(window_json)),
  missing_policy TEXT NOT NULL CHECK (missing_policy IN ('FAIL','EXCLUDE','ZERO')),
  rounding_mode TEXT NOT NULL DEFAULT 'HALF_UP',
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  UNIQUE(metric_definition_id, formula_version)
);

CREATE TABLE saved_views (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  module_key TEXT NOT NULL,
  filter_json TEXT NOT NULL CHECK (json_valid(filter_json)),
  chart_json TEXT NOT NULL CHECK (json_valid(chart_json)),
  archived_at TEXT,
  deleted_at TEXT,
  source_type TEXT NOT NULL DEFAULT 'MANUAL',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  before_json TEXT CHECK (before_json IS NULL OR json_valid(before_json)),
  after_json TEXT CHECK (after_json IS NULL OR json_valid(after_json)),
  occurred_at TEXT NOT NULL
);

CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id, occurred_at);
