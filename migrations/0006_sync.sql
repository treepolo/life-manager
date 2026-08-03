PRAGMA foreign_keys = ON;

CREATE TABLE sync_devices (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  user_agent_summary TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  disabled_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE sync_operations (
  operation_id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES sync_devices(id) ON DELETE RESTRICT,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  operation_kind TEXT NOT NULL CHECK (operation_kind IN ('UPSERT','ARCHIVE','RESTORE','DELETE','APPEND')),
  base_version INTEGER,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  client_occurred_at TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('APPLIED','CONFLICT','REJECTED')),
  result_version INTEGER,
  error_code TEXT,
  applied_at TEXT NOT NULL
);

CREATE TABLE sync_change_log (
  cursor INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  operation_kind TEXT NOT NULL,
  entity_version INTEGER NOT NULL,
  snapshot_json TEXT NOT NULL CHECK (json_valid(snapshot_json)),
  changed_at TEXT NOT NULL,
  operation_id TEXT REFERENCES sync_operations(operation_id) ON DELETE RESTRICT
);

CREATE INDEX idx_sync_change_log_entity ON sync_change_log(entity_type, entity_id, cursor);

CREATE TABLE sync_cursors (
  device_id TEXT PRIMARY KEY REFERENCES sync_devices(id) ON DELETE RESTRICT,
  last_pulled_cursor INTEGER NOT NULL DEFAULT 0,
  last_pushed_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE conflict_records (
  id TEXT PRIMARY KEY,
  operation_id TEXT NOT NULL REFERENCES sync_operations(operation_id) ON DELETE RESTRICT,
  device_id TEXT NOT NULL REFERENCES sync_devices(id) ON DELETE RESTRICT,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  base_version INTEGER,
  server_version INTEGER NOT NULL,
  local_payload_json TEXT NOT NULL CHECK (json_valid(local_payload_json)),
  server_payload_json TEXT NOT NULL CHECK (json_valid(server_payload_json)),
  field_diff_json TEXT NOT NULL CHECK (json_valid(field_diff_json)),
  status TEXT NOT NULL CHECK (status IN ('OPEN','RESOLVED_LOCAL','RESOLVED_SERVER','RESOLVED_MERGED')),
  resolution_operation_id TEXT,
  created_at TEXT NOT NULL,
  resolved_at TEXT
);

CREATE TABLE export_history (
  id TEXT PRIMARY KEY,
  export_kind TEXT NOT NULL CHECK (export_kind IN ('FULL_JSON','MODULE_CSV','D1_SQL')),
  module_key TEXT,
  schema_version INTEGER NOT NULL,
  entity_counts_json TEXT NOT NULL CHECK (json_valid(entity_counts_json)),
  checksum TEXT NOT NULL,
  exported_at TEXT NOT NULL
);

CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL CHECK (json_valid(value_json)),
  source_type TEXT NOT NULL DEFAULT 'MANUAL',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);

UPDATE schema_metadata
SET value = '6', updated_at = CURRENT_TIMESTAMP
WHERE key = 'application_schema_version';
