PRAGMA foreign_keys = ON;

-- Cost guardrail records are append-only evidence/event streams. The current
-- window, reservation and breaker tables are materialized state derived from
-- those records and are never used as provider invoice truth.
CREATE TABLE cost_guardrail_contract_observations (
  id TEXT PRIMARY KEY,
  resource_key TEXT NOT NULL,
  contract_version TEXT NOT NULL,
  included_amount INTEGER,
  unit TEXT NOT NULL,
  measurement_window TEXT NOT NULL,
  period_key TEXT NOT NULL,
  reset_at TEXT,
  reset_timezone TEXT,
  billing_period_start TEXT,
  billing_period_end TEXT,
  invoice_cutoff TEXT,
  source_url TEXT,
  source_version TEXT,
  quality TEXT NOT NULL CHECK (quality IN ('EXACT','LOCAL_CONSERVATIVE','UNKNOWN','STALE','MISMATCH')),
  behavior TEXT NOT NULL CHECK (behavior IN ('HARD_REJECT','SOFT_LIMIT','AUTO_BILL','ALERT_ONLY','UNKNOWN')),
  risk_class TEXT NOT NULL CHECK (risk_class IN ('AUTO_OVERAGE_OR_UNKNOWN','HARD_REJECT_ONLY','ACCOUNT_CONTROL')),
  admission_mode TEXT NOT NULL CHECK (admission_mode IN ('GATE','OBSERVE_ONLY','ACCOUNT_CONTROL')),
  evidence_json TEXT NOT NULL CHECK (json_valid(evidence_json)),
  observed_at TEXT NOT NULL,
  stale_after TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_cost_contract_latest
ON cost_guardrail_contract_observations(resource_key, period_key, observed_at DESC);

CREATE TABLE cost_guardrail_usage_observations (
  id TEXT PRIMARY KEY,
  resource_key TEXT NOT NULL,
  metric_key TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount >= 0),
  unit TEXT NOT NULL,
  quality TEXT NOT NULL CHECK (quality IN ('EXACT','LOCAL_CONSERVATIVE','UNKNOWN','STALE','MISMATCH')),
  measurement_window TEXT NOT NULL,
  period_key TEXT NOT NULL,
  reset_at TEXT,
  reset_timezone TEXT,
  billing_period_start TEXT,
  billing_period_end TEXT,
  invoice_cutoff TEXT,
  source_url TEXT,
  source_version TEXT,
  evidence_json TEXT NOT NULL CHECK (json_valid(evidence_json)),
  observed_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_cost_usage_latest
ON cost_guardrail_usage_observations(resource_key, period_key, observed_at DESC);

CREATE TABLE cost_guardrail_budget_windows (
  resource_key TEXT NOT NULL,
  period_key TEXT NOT NULL,
  contract_observation_id TEXT NOT NULL REFERENCES cost_guardrail_contract_observations(id) ON DELETE RESTRICT,
  included_amount INTEGER NOT NULL CHECK (included_amount > 0),
  internal_limit INTEGER NOT NULL CHECK (internal_limit > 0),
  degrade_threshold INTEGER NOT NULL CHECK (degrade_threshold > 0),
  hard_stop_threshold INTEGER NOT NULL CHECK (hard_stop_threshold > 0),
  unit TEXT NOT NULL,
  measurement_window TEXT NOT NULL,
  reset_at TEXT,
  reset_timezone TEXT,
  billing_period_start TEXT,
  billing_period_end TEXT,
  invoice_cutoff TEXT,
  quality TEXT NOT NULL CHECK (quality IN ('EXACT','LOCAL_CONSERVATIVE','UNKNOWN','STALE','MISMATCH')),
  behavior TEXT NOT NULL CHECK (behavior IN ('HARD_REJECT','SOFT_LIMIT','AUTO_BILL','ALERT_ONLY','UNKNOWN')),
  risk_class TEXT NOT NULL CHECK (risk_class IN ('AUTO_OVERAGE_OR_UNKNOWN','HARD_REJECT_ONLY','ACCOUNT_CONTROL')),
  breaker_state TEXT NOT NULL CHECK (breaker_state IN ('CLOSED','DEGRADED','OPEN','OVERRIDDEN')),
  local_reserved_amount INTEGER NOT NULL DEFAULT 0 CHECK (local_reserved_amount >= 0),
  local_consumed_amount INTEGER NOT NULL DEFAULT 0 CHECK (local_consumed_amount >= 0),
  breaker_reason TEXT,
  opened_at TEXT,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY(resource_key, period_key)
);

CREATE TABLE cost_guardrail_reservations (
  id TEXT PRIMARY KEY,
  operation_id TEXT NOT NULL,
  resource_key TEXT NOT NULL,
  period_key TEXT NOT NULL,
  planned_amount INTEGER NOT NULL CHECK (planned_amount >= 0),
  reserved_amount INTEGER NOT NULL CHECK (reserved_amount > 0),
  status TEXT NOT NULL CHECK (status IN ('RESERVED','COMMITTED','RELEASED','EXPIRED')),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(operation_id, resource_key, period_key)
);

CREATE INDEX idx_cost_reservations_active
ON cost_guardrail_reservations(resource_key, period_key, status, expires_at);

-- Keep the materialized reservation counter and the reservation row atomic.
-- A concurrent scheduler/manual-sync reservation that loses the window fails
-- this insert, so no orphan reservation or ledger event can be committed.
CREATE TRIGGER cost_guardrail_reservation_budget_guard
BEFORE INSERT ON cost_guardrail_reservations
WHEN NEW.status = 'RESERVED'
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM cost_guardrail_budget_windows budget
    WHERE budget.resource_key = NEW.resource_key
      AND budget.period_key = NEW.period_key
      AND budget.quality = 'EXACT'
      AND budget.breaker_state IN ('CLOSED','OVERRIDDEN')
      AND budget.local_consumed_amount + budget.local_reserved_amount + NEW.reserved_amount
        < COALESCE((
          SELECT override.approved_internal_limit
          FROM cost_guardrail_overrides override
          WHERE override.resource_key = NEW.resource_key
            AND override.period_key = NEW.period_key
            AND override.status = 'ACTIVE'
            AND override.expires_at > CURRENT_TIMESTAMP
          ORDER BY override.expires_at DESC
          LIMIT 1
        ), budget.degrade_threshold)
      AND budget.local_consumed_amount + budget.local_reserved_amount + NEW.reserved_amount
        <= COALESCE((
          SELECT override.approved_internal_limit
          FROM cost_guardrail_overrides override
          WHERE override.resource_key = NEW.resource_key
            AND override.period_key = NEW.period_key
            AND override.status = 'ACTIVE'
            AND override.expires_at > CURRENT_TIMESTAMP
          ORDER BY override.expires_at DESC
          LIMIT 1
        ), budget.internal_limit)
  ) THEN RAISE(ABORT, 'COST_GUARDRAIL_RESERVATION_LIMIT') END;

  UPDATE cost_guardrail_budget_windows
  SET local_reserved_amount = local_reserved_amount + NEW.reserved_amount,
      breaker_state = CASE WHEN EXISTS (
        SELECT 1
        FROM cost_guardrail_overrides override
        WHERE override.resource_key = NEW.resource_key
          AND override.period_key = NEW.period_key
          AND override.status = 'ACTIVE'
          AND override.expires_at > CURRENT_TIMESTAMP
      ) THEN 'OVERRIDDEN' ELSE breaker_state END,
      breaker_reason = CASE WHEN EXISTS (
        SELECT 1
        FROM cost_guardrail_overrides override
        WHERE override.resource_key = NEW.resource_key
          AND override.period_key = NEW.period_key
          AND override.status = 'ACTIVE'
          AND override.expires_at > CURRENT_TIMESTAMP
      ) THEN 'COST_GUARDRAIL_OVERRIDE' ELSE breaker_reason END,
      updated_at = CURRENT_TIMESTAMP,
      version = version + 1
  WHERE resource_key = NEW.resource_key
    AND period_key = NEW.period_key;
END;

CREATE TABLE cost_guardrail_ledger_events (
  id TEXT PRIMARY KEY,
  reservation_id TEXT,
  operation_id TEXT NOT NULL,
  resource_key TEXT NOT NULL,
  period_key TEXT NOT NULL,
  event_kind TEXT NOT NULL CHECK (event_kind IN ('RESERVE','COMMIT','RELEASE','EXPIRE','OBSERVE')),
  amount INTEGER NOT NULL CHECK (amount >= 0),
  quality TEXT NOT NULL CHECK (quality IN ('EXACT','LOCAL_CONSERVATIVE','UNKNOWN','STALE','MISMATCH')),
  evidence_json TEXT NOT NULL CHECK (json_valid(evidence_json)),
  occurred_at TEXT NOT NULL
);

CREATE INDEX idx_cost_ledger_resource
ON cost_guardrail_ledger_events(resource_key, period_key, occurred_at);

CREATE TABLE cost_guardrail_alerts (
  id TEXT PRIMARY KEY,
  resource_key TEXT NOT NULL,
  period_key TEXT NOT NULL,
  threshold_percent INTEGER NOT NULL CHECK (threshold_percent IN (50,70,75,80,85,100)),
  status TEXT NOT NULL CHECK (status IN ('PENDING','DELIVERED','FAILED')),
  attempt INTEGER NOT NULL DEFAULT 0,
  last_error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(resource_key, period_key, threshold_percent)
);

CREATE TABLE cost_guardrail_breaker_events (
  id TEXT PRIMARY KEY,
  resource_key TEXT NOT NULL,
  period_key TEXT NOT NULL,
  from_state TEXT,
  to_state TEXT NOT NULL CHECK (to_state IN ('CLOSED','DEGRADED','OPEN','OVERRIDDEN')),
  reason_code TEXT NOT NULL,
  actor_id TEXT,
  occurred_at TEXT NOT NULL,
  evidence_json TEXT NOT NULL CHECK (json_valid(evidence_json))
);

CREATE TABLE cost_guardrail_overrides (
  id TEXT PRIMARY KEY,
  resource_key TEXT NOT NULL,
  period_key TEXT NOT NULL,
  approved_internal_limit INTEGER NOT NULL CHECK (approved_internal_limit > 0),
  reason TEXT NOT NULL CHECK (length(trim(reason)) >= 10),
  actor_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ACTIVE','EXPIRED','REVOKED')),
  created_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE INDEX idx_cost_overrides_active
ON cost_guardrail_overrides(resource_key, period_key, status, expires_at);

CREATE TABLE cost_guardrail_drift_audits (
  id TEXT PRIMARY KEY,
  environment TEXT NOT NULL,
  allowlist_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PASS','DRIFT','UNKNOWN')),
  observed_json TEXT NOT NULL CHECK (json_valid(observed_json)),
  error_code TEXT,
  created_at TEXT NOT NULL
);

UPDATE schema_metadata
SET value = '11', updated_at = CURRENT_TIMESTAMP
WHERE key = 'application_schema_version';
