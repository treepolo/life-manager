PRAGMA foreign_keys = ON;

CREATE TABLE provider_sync_run_payloads (
  sync_run_id TEXT NOT NULL REFERENCES provider_sync_runs(id) ON DELETE RESTRICT,
  payload_order INTEGER NOT NULL CHECK (payload_order >= 0),
  raw_payload_id TEXT NOT NULL REFERENCES provider_raw_payloads(id) ON DELETE RESTRICT,
  linked_at TEXT NOT NULL,
  PRIMARY KEY (sync_run_id, payload_order)
);

CREATE INDEX idx_provider_sync_run_payloads_raw
ON provider_sync_run_payloads(raw_payload_id, sync_run_id);

INSERT INTO provider_sync_run_payloads (sync_run_id, payload_order, raw_payload_id, linked_at)
SELECT
  sync_run_id,
  ROW_NUMBER() OVER (PARTITION BY sync_run_id ORDER BY created_at, id) - 1,
  id,
  created_at
FROM provider_raw_payloads;

UPDATE schema_metadata
SET value = '10', updated_at = CURRENT_TIMESTAMP
WHERE key = 'application_schema_version';
