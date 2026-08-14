PRAGMA foreign_keys = ON;

-- RETROFIT-W1A requires idempotency replay to be bound to the authenticated
-- actor. Existing rows remain nullable for backwards compatibility; new
-- actor-aware commands must write this column and reject legacy rows rather
-- than replaying a response without an actor match.
ALTER TABLE api_idempotency ADD COLUMN actor_id TEXT;

CREATE INDEX idx_api_idempotency_actor_created
ON api_idempotency(actor_id, created_at);

UPDATE schema_metadata
SET value = '13', updated_at = CURRENT_TIMESTAMP
WHERE key = 'application_schema_version';
