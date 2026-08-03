PRAGMA foreign_keys = ON;

CREATE TABLE api_idempotency (
  operation_id TEXT PRIMARY KEY,
  request_hash TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  response_status INTEGER NOT NULL,
  response_json TEXT NOT NULL CHECK (json_valid(response_json)),
  created_at TEXT NOT NULL
);

CREATE INDEX idx_api_idempotency_created ON api_idempotency(created_at);

UPDATE schema_metadata
SET value = '7', updated_at = CURRENT_TIMESTAMP
WHERE key = 'application_schema_version';
