PRAGMA foreign_keys = ON;

ALTER TABLE cost_guardrail_reservations
ADD COLUMN settled_amount INTEGER CHECK (settled_amount IS NULL OR settled_amount >= 0);

ALTER TABLE cost_guardrail_reservations
ADD COLUMN succeeded INTEGER CHECK (succeeded IS NULL OR succeeded IN (0,1));

-- A status transition is the single source of truth for release/commit. The
-- trigger aborts the whole SQLite transaction if a duplicate or concurrent
-- transition cannot debit the reserved amount.
CREATE TRIGGER cost_guardrail_reservation_commit
AFTER UPDATE OF status, settled_amount ON cost_guardrail_reservations
WHEN OLD.status = 'RESERVED' AND NEW.status = 'COMMITTED'
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM cost_guardrail_budget_windows budget
    WHERE budget.resource_key = OLD.resource_key
      AND budget.period_key = OLD.period_key
      AND budget.local_reserved_amount >= OLD.reserved_amount
  ) THEN RAISE(ABORT, 'COST_GUARDRAIL_COMMIT_CONFLICT') END;

  UPDATE cost_guardrail_budget_windows
  SET local_reserved_amount = local_reserved_amount - OLD.reserved_amount,
      local_consumed_amount = local_consumed_amount + COALESCE(NEW.settled_amount, OLD.planned_amount),
      updated_at = NEW.updated_at,
      version = version + 1
  WHERE resource_key = OLD.resource_key
    AND period_key = OLD.period_key;

  INSERT INTO cost_guardrail_ledger_events
    (id, reservation_id, operation_id, resource_key, period_key, event_kind, amount, quality, evidence_json, occurred_at)
  VALUES
    (lower(hex(randomblob(16))), NEW.id, NEW.operation_id, NEW.resource_key, NEW.period_key,
     'COMMIT', COALESCE(NEW.settled_amount, OLD.planned_amount), 'LOCAL_CONSERVATIVE',
     json_object('reservedAmount', OLD.reserved_amount, 'succeeded', COALESCE(NEW.succeeded, 0)), NEW.updated_at);
END;

CREATE TRIGGER cost_guardrail_reservation_release
AFTER UPDATE OF status ON cost_guardrail_reservations
WHEN OLD.status = 'RESERVED' AND NEW.status IN ('RELEASED','EXPIRED')
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM cost_guardrail_budget_windows budget
    WHERE budget.resource_key = OLD.resource_key
      AND budget.period_key = OLD.period_key
      AND budget.local_reserved_amount >= OLD.reserved_amount
  ) THEN RAISE(ABORT, 'COST_GUARDRAIL_RELEASE_CONFLICT') END;

  UPDATE cost_guardrail_budget_windows
  SET local_reserved_amount = local_reserved_amount - OLD.reserved_amount,
      updated_at = NEW.updated_at,
      version = version + 1
  WHERE resource_key = OLD.resource_key
    AND period_key = OLD.period_key;

  INSERT INTO cost_guardrail_ledger_events
    (id, reservation_id, operation_id, resource_key, period_key, event_kind, amount, quality, evidence_json, occurred_at)
  VALUES
    (lower(hex(randomblob(16))), NEW.id, NEW.operation_id, NEW.resource_key, NEW.period_key,
     CASE WHEN NEW.status = 'EXPIRED' THEN 'EXPIRE' ELSE 'RELEASE' END,
     OLD.reserved_amount, 'LOCAL_CONSERVATIVE', json_object('reason', 'reservation-transition'), NEW.updated_at);
END;

UPDATE schema_metadata
SET value = '12', updated_at = CURRENT_TIMESTAMP
WHERE key = 'application_schema_version';
