import { newId, nowIso } from "@/core/database/d1";
import { ApiError } from "@/core/errors/api-error";
import {
  admissionAmount,
  COST_GUARDRAIL_CONTRACT_VERSION,
  defaultAdmissionOverhead,
  getCostContract,
  listCostContracts,
  pacificDayPeriod,
  policyFor,
  utcDayPeriod,
  type AdmissionOverhead,
  type CostAdmissionMode,
  type CostBehavior,
  type CostContract,
  type CostQuality,
  type CostRiskClass,
  type CostWindowInput,
  type CostResourceKey,
} from "@/modules/cost-guardrail/contracts";
import type { Env } from "@/worker/env";

const RESERVATION_TTL_MS = 15 * 60 * 1000;
const MAX_OVERRIDE_MS = 24 * 60 * 60 * 1000;
const ALERT_THRESHOLDS = [50, 70, 75, 80, 85, 100] as const;

interface ContractObservationRow {
  id: string;
  resource_key: string;
  contract_version: string;
  included_amount: number | null;
  unit: string;
  measurement_window: string;
  period_key: string;
  reset_at: string | null;
  reset_timezone: string | null;
  billing_period_start: string | null;
  billing_period_end: string | null;
  invoice_cutoff: string | null;
  source_url: string | null;
  source_version: string | null;
  quality: CostQuality;
  behavior: CostBehavior;
  risk_class: CostRiskClass;
  admission_mode: CostAdmissionMode;
  evidence_json: string;
  observed_at: string;
  stale_after: string | null;
}

interface BudgetWindowRow {
  resource_key: CostResourceKey;
  period_key: string;
  contract_observation_id: string;
  included_amount: number;
  internal_limit: number;
  degrade_threshold: number;
  hard_stop_threshold: number;
  unit: string;
  measurement_window: string;
  reset_at: string | null;
  reset_timezone: string | null;
  billing_period_start: string | null;
  billing_period_end: string | null;
  invoice_cutoff: string | null;
  quality: CostQuality;
  behavior: CostBehavior;
  risk_class: CostRiskClass;
  breaker_state: "CLOSED" | "DEGRADED" | "OPEN" | "OVERRIDDEN";
  local_reserved_amount: number;
  local_consumed_amount: number;
  breaker_reason: string | null;
  opened_at: string | null;
  updated_at: string;
  version: number;
}

interface ReservationRow {
  id: string;
  operation_id: string;
  resource_key: CostResourceKey;
  period_key: string;
  planned_amount: number;
  reserved_amount: number;
  status: "RESERVED" | "COMMITTED" | "RELEASED" | "EXPIRED";
  expires_at: string;
  settled_amount?: number | null;
  succeeded?: number | null;
}

interface OverrideRow {
  id: string;
  resource_key: CostResourceKey;
  period_key: string;
  approved_internal_limit: number;
  actor_id: string;
  expires_at: string;
  status: "ACTIVE" | "EXPIRED" | "REVOKED";
}

export interface ContractObservationInput {
  resourceKey: CostResourceKey;
  includedAmount: number | null;
  period: CostWindowInput;
  quality: CostQuality;
  behavior?: CostBehavior;
  evidence: Record<string, unknown>;
  sourceUrl?: string | null;
  sourceVersion?: string | null;
  observedAt?: string;
  staleAfter?: string | null;
}

export interface AdmissionReservation {
  id: string;
  operationId: string;
  resourceKey: CostResourceKey;
  periodKey: string;
  plannedAmount: number;
  reservedAmount: number;
  unit: string;
}

export interface D1AdmissionReservations {
  rowsRead: AdmissionReservation;
  rowsWritten: AdmissionReservation;
  storageBytes: AdmissionReservation;
}

export interface ProviderRequestGuard {
  beforeRequest(input: { resourceKey: CostResourceKey; plannedAmount: number; operationKind: string }): Promise<AdmissionReservation>;
  afterRequest(reservation: AdmissionReservation, succeeded: boolean): Promise<void>;
}

function resourceOrThrow(resourceKey: string): CostContract {
  if (!listCostContracts().some((item) => item.resourceKey === resourceKey)) {
    throw new ApiError(400, "VALIDATION_FAILED", "成本資源不在 allowlist。", { resourceKey });
  }
  return getCostContract(resourceKey as CostResourceKey);
}

function safeInteger(value: number | null, label: string): number {
  if (value === null || !Number.isSafeInteger(value) || value < 0) throw new ApiError(400, "VALIDATION_FAILED", `${label} 必須是非負整數。`);
  return value;
}

function parseDate(value: string | null, label: string): number {
  if (!value) throw new ApiError(503, "COST_GUARDRAIL_UNKNOWN", `${label} 尚未取得 exact evidence。`);
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new ApiError(503, "COST_GUARDRAIL_UNKNOWN", `${label} 不是有效時間。`);
  return parsed;
}

function observationIsSafe(row: ContractObservationRow, contractValue: CostContract, now: string): boolean {
  if (row.quality !== "EXACT" || row.contract_version !== COST_GUARDRAIL_CONTRACT_VERSION) return false;
  if (row.included_amount === null || row.included_amount <= 0) return false;
  if (!row.reset_timezone || !row.period_key || !row.reset_at || parseDate(row.reset_at, "reset_at") <= Date.parse(now)) return false;
  if (row.risk_class === "AUTO_OVERAGE_OR_UNKNOWN" && (!row.billing_period_start || !row.billing_period_end || !row.invoice_cutoff)) return false;
  if (row.stale_after && Date.parse(row.stale_after) <= Date.parse(now)) return false;
  return row.resource_key === contractValue.resourceKey && row.unit === contractValue.unit;
}

function observationEvidence(row: ContractObservationRow): Record<string, unknown> {
  try {
    const parsed = JSON.parse(row.evidence_json) as unknown;
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function localBaselinePeriod(contractValue: CostContract, now: Date): CostWindowInput | null {
  if (!contractValue.localBaselineAllowed || contractValue.officialIncludedAmount === null) return null;
  if (contractValue.measurementWindow === "UTC_DAY") return utcDayPeriod(now);
  if (contractValue.measurementWindow === "PACIFIC_DAY") return pacificDayPeriod(now);
  if (contractValue.resourceKey === "d1.storage_bytes") {
    return {
      periodKey: "PLAN_STORAGE:CURRENT",
      resetAt: null,
      resetTimezone: null,
      billingPeriodStart: null,
      billingPeriodEnd: null,
      invoiceCutoff: null,
    };
  }
  return null;
}

function observationIsAdmissible(row: ContractObservationRow, contractValue: CostContract, now: string): boolean {
  if (observationIsSafe(row, contractValue, now)) return true;
  if (row.quality !== "LOCAL_CONSERVATIVE" || row.contract_version !== COST_GUARDRAIL_CONTRACT_VERSION) return false;
  if (!contractValue.localBaselineAllowed || contractValue.officialIncludedAmount === null) return false;
  if (row.resource_key !== contractValue.resourceKey || row.unit !== contractValue.unit || row.included_amount !== contractValue.officialIncludedAmount) return false;
  const evidence = observationEvidence(row);
  if (evidence.baselineKind !== "OFFICIAL_INCLUDED_ALLOWANCE" || evidence.providerInvoiceTruth !== false) return false;
  if (row.stale_after && Date.parse(row.stale_after) <= Date.parse(now)) return false;
  if (contractValue.measurementWindow === "PROVIDER_PLAN") return row.period_key === "PLAN_STORAGE:CURRENT";
  if (!row.reset_at || !row.reset_timezone || parseDate(row.reset_at, "local baseline reset_at") <= Date.parse(now)) return false;
  return Boolean(row.period_key);
}

async function latestObservation(env: Pick<Env, "LIFE_DB">, resourceKey: CostResourceKey): Promise<ContractObservationRow | null> {
  return env.LIFE_DB.prepare(
    `SELECT * FROM cost_guardrail_contract_observations
     WHERE resource_key = ? ORDER BY observed_at DESC LIMIT 1`,
  ).bind(resourceKey).first<ContractObservationRow>();
}

async function activeOverride(env: Pick<Env, "LIFE_DB">, resourceKey: CostResourceKey, periodKey: string, now: string): Promise<number | null> {
  const expired = await env.LIFE_DB.prepare(
    "SELECT id, resource_key, period_key, approved_internal_limit, actor_id, expires_at, status FROM cost_guardrail_overrides WHERE status = 'ACTIVE' AND expires_at <= ?",
  ).bind(now).all<OverrideRow>();
  for (const override of expired.results) {
    const window = await env.LIFE_DB.prepare(
      "SELECT resource_key, period_key, breaker_state, local_consumed_amount, local_reserved_amount, degrade_threshold, hard_stop_threshold FROM cost_guardrail_budget_windows WHERE resource_key = ? AND period_key = ?",
    ).bind(override.resource_key, override.period_key).first<Pick<BudgetWindowRow, "resource_key" | "period_key" | "breaker_state" | "local_consumed_amount" | "local_reserved_amount" | "degrade_threshold" | "hard_stop_threshold">>();
    const used = (window?.local_consumed_amount ?? 0) + (window?.local_reserved_amount ?? 0);
    const nextState = !window ? null : used >= window.hard_stop_threshold ? "OPEN" : used >= window.degrade_threshold ? "DEGRADED" : "CLOSED";
    await env.LIFE_DB.batch([
      env.LIFE_DB.prepare("UPDATE cost_guardrail_overrides SET status = 'EXPIRED' WHERE id = ? AND status = 'ACTIVE'").bind(override.id),
      ...(window && nextState ? [
        env.LIFE_DB.prepare(
          "UPDATE cost_guardrail_budget_windows SET breaker_state = ?, breaker_reason = 'COST_GUARDRAIL_OVERRIDE_EXPIRED', updated_at = ?, version = version + 1 WHERE resource_key = ? AND period_key = ?",
        ).bind(nextState, now, override.resource_key, override.period_key),
        env.LIFE_DB.prepare(
          "INSERT INTO cost_guardrail_breaker_events (id, resource_key, period_key, from_state, to_state, reason_code, actor_id, occurred_at, evidence_json) VALUES (?, ?, ?, ?, ?, 'COST_GUARDRAIL_OVERRIDE_EXPIRED', ?, ?, ?)",
        ).bind(newId(), override.resource_key, override.period_key, window.breaker_state, nextState, override.actor_id, now, JSON.stringify({ overrideId: override.id, expiresAt: override.expires_at })),
      ] : []),
    ]);
  }
  const row = await env.LIFE_DB.prepare(
    `SELECT approved_internal_limit FROM cost_guardrail_overrides
     WHERE resource_key = ? AND period_key = ? AND status = 'ACTIVE' AND expires_at > ?
     ORDER BY expires_at DESC LIMIT 1`,
  ).bind(resourceKey, periodKey, now).first<{ approved_internal_limit: number }>();
  return row?.approved_internal_limit ?? null;
}

async function expireStaleReservations(env: Pick<Env, "LIFE_DB">, now: string): Promise<void> {
  await env.LIFE_DB.prepare(
    "UPDATE cost_guardrail_reservations SET status = 'EXPIRED', updated_at = ? WHERE status = 'RESERVED' AND expires_at <= ?",
  ).bind(now, now).run();
}

function budgetThresholds(input: { included: number; contractValue: CostContract }): { internalLimit: number; degradeThreshold: number; hardStopThreshold: number } {
  const policy = policyFor(input.contractValue);
  if (policy.maximumFraction === null || policy.degradeFraction === null || policy.hardStopFraction === null) {
    throw new ApiError(503, "COST_GUARDRAIL_ACCOUNT_CONTROL_REQUIRED", "此資源只能由帳戶控制，App 不可建立 hard-stop。", { resourceKey: input.contractValue.resourceKey });
  }
  const internalLimit = Math.floor(input.included * policy.maximumFraction);
  const degradeThreshold = Math.floor(input.included * policy.degradeFraction);
  const hardStopThreshold = Math.floor(input.included * policy.hardStopFraction);
  if (internalLimit <= 0 || degradeThreshold <= 0 || hardStopThreshold <= 0 || internalLimit >= input.included || degradeThreshold > internalLimit || hardStopThreshold > internalLimit) {
    throw new ApiError(503, "COST_GUARDRAIL_UNKNOWN", "included allowance 太小，無法保留安全 reserve。", { resourceKey: input.contractValue.resourceKey, includedAmount: input.included });
  }
  return { internalLimit, degradeThreshold, hardStopThreshold };
}

async function ensureWindow(input: {
  env: Pick<Env, "LIFE_DB">;
  contractValue: CostContract;
  observation: ContractObservationRow;
  now: string;
}): Promise<BudgetWindowRow> {
  const included = safeInteger(input.observation.included_amount, "included_amount");
  const { internalLimit, degradeThreshold, hardStopThreshold } = budgetThresholds({ included, contractValue: input.contractValue });
  await input.env.LIFE_DB.prepare(
    `INSERT OR IGNORE INTO cost_guardrail_budget_windows
       (resource_key, period_key, contract_observation_id, included_amount, internal_limit, degrade_threshold,
        hard_stop_threshold, unit, measurement_window, reset_at, reset_timezone, billing_period_start,
        billing_period_end, invoice_cutoff, quality, behavior, risk_class, breaker_state,
        local_reserved_amount, local_consumed_amount, updated_at, version)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'CLOSED', 0, 0, ?, 1)`,
  ).bind(
    input.contractValue.resourceKey, input.observation.period_key, input.observation.id, included,
    internalLimit, degradeThreshold, hardStopThreshold, input.observation.unit, input.observation.measurement_window,
    input.observation.reset_at, input.observation.reset_timezone, input.observation.billing_period_start,
    input.observation.billing_period_end, input.observation.invoice_cutoff, input.observation.quality,
    input.observation.behavior, input.observation.risk_class, input.now,
  ).run();
  const row = await input.env.LIFE_DB.prepare(
    "SELECT * FROM cost_guardrail_budget_windows WHERE resource_key = ? AND period_key = ?",
  ).bind(input.contractValue.resourceKey, input.observation.period_key).first<BudgetWindowRow>();
  if (!row || row.contract_observation_id !== input.observation.id || row.included_amount !== included) {
    throw new ApiError(503, "COST_GUARDRAIL_UNKNOWN", "同一 quota window 的 contract evidence 不一致。", { resourceKey: input.contractValue.resourceKey, periodKey: input.observation.period_key });
  }
  return row;
}

async function insertAlert(env: Pick<Env, "LIFE_DB">, resourceKey: CostResourceKey, periodKey: string, threshold: number, now: string): Promise<void> {
  try {
    await env.LIFE_DB.prepare(
      `INSERT OR IGNORE INTO cost_guardrail_alerts
       (id, resource_key, period_key, threshold_percent, status, attempt, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'PENDING', 0, ?, ?)`,
    ).bind(newId(), resourceKey, periodKey, threshold, now, now).run();
  } catch {
    // Alert persistence is deliberately best effort. A failed alert must not
    // make a breaker look closed or release a reservation.
  }
}

async function transitionBreaker(input: {
  env: Pick<Env, "LIFE_DB">;
  window: BudgetWindowRow;
  state: "CLOSED" | "DEGRADED" | "OPEN" | "OVERRIDDEN";
  reason: string;
  actorId?: string;
  now: string;
}): Promise<void> {
  if (input.window.breaker_state === input.state && input.state !== "OPEN") return;
  await input.env.LIFE_DB.batch([
    input.env.LIFE_DB.prepare(
      `UPDATE cost_guardrail_budget_windows
       SET breaker_state = ?, breaker_reason = ?, opened_at = CASE WHEN ? = 'OPEN' THEN COALESCE(opened_at, ?) ELSE opened_at END,
           updated_at = ?, version = version + 1 WHERE resource_key = ? AND period_key = ?`,
    ).bind(input.state, input.reason, input.state, input.now, input.now, input.window.resource_key, input.window.period_key),
    input.env.LIFE_DB.prepare(
      `INSERT INTO cost_guardrail_breaker_events
       (id, resource_key, period_key, from_state, to_state, reason_code, actor_id, occurred_at, evidence_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(newId(), input.window.resource_key, input.window.period_key, input.window.breaker_state, input.state, input.reason, input.actorId ?? null, input.now, JSON.stringify({ source: "cost-guardrail" })),
  ]);
}

async function ensureThresholdAlerts(input: {
  env: Pick<Env, "LIFE_DB">;
  contractValue: CostContract;
  periodKey: string;
  included: number;
  current: number;
  now: string;
}): Promise<void> {
  const percentage = input.included > 0 ? (input.current / input.included) * 100 : 100;
  const policy = policyFor(input.contractValue);
  const thresholds = [50, policy.degradeFraction ? Math.round(policy.degradeFraction * 100) : null, policy.hardStopFraction ? Math.round(policy.hardStopFraction * 100) : null]
    .filter((value): value is number => value !== null);
  for (const threshold of thresholds) {
    if (percentage >= threshold && ALERT_THRESHOLDS.includes(threshold as typeof ALERT_THRESHOLDS[number])) {
      await insertAlert(input.env, input.contractValue.resourceKey, input.periodKey, threshold, input.now);
    }
  }
}

export async function recordContractObservation(input: { env: Pick<Env, "LIFE_DB">; observation: ContractObservationInput }): Promise<{ id: string }> {
  const contractValue = resourceOrThrow(input.observation.resourceKey);
  if (!Number.isSafeInteger(input.observation.includedAmount) && input.observation.includedAmount !== null) {
    throw new ApiError(400, "VALIDATION_FAILED", "includedAmount 必須是整數或 null。", { resourceKey: contractValue.resourceKey });
  }
  if (input.observation.quality === "EXACT" && (input.observation.includedAmount === null || !input.observation.period.resetAt || !input.observation.period.resetTimezone)) {
    throw new ApiError(400, "VALIDATION_FAILED", "EXACT contract 必須包含 allowance、reset_at 與 reset timezone。", { resourceKey: contractValue.resourceKey });
  }
  const now = input.observation.observedAt ?? nowIso();
  const id = newId();
  await input.env.LIFE_DB.prepare(
    `INSERT INTO cost_guardrail_contract_observations
     (id, resource_key, contract_version, included_amount, unit, measurement_window, period_key,
      reset_at, reset_timezone, billing_period_start, billing_period_end, invoice_cutoff,
      source_url, source_version, quality, behavior, risk_class, admission_mode, evidence_json,
      observed_at, stale_after, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, contractValue.resourceKey, COST_GUARDRAIL_CONTRACT_VERSION, input.observation.includedAmount,
    contractValue.unit, contractValue.measurementWindow, input.observation.period.periodKey,
    input.observation.period.resetAt, input.observation.period.resetTimezone,
    input.observation.period.billingPeriodStart, input.observation.period.billingPeriodEnd,
    input.observation.period.invoiceCutoff, input.observation.sourceUrl ?? contractValue.sourceUrl,
    input.observation.sourceVersion ?? contractValue.sourceVersion, input.observation.quality,
    input.observation.behavior ?? contractValue.behavior, contractValue.riskClass, contractValue.admissionMode,
    JSON.stringify(input.observation.evidence), now, input.observation.staleAfter ?? null, now,
  ).run();
  return { id };
}

export async function recordUsageObservation(input: {
  env: Pick<Env, "LIFE_DB">;
  resourceKey: CostResourceKey;
  metricKey: string;
  amount: number;
  unit: string;
  quality: CostQuality;
  window: CostWindowInput;
  sourceUrl: string | null;
  sourceVersion: string;
  evidence: Record<string, unknown>;
  observedAt?: string;
}): Promise<void> {
  safeInteger(input.amount, "usage amount");
  const now = input.observedAt ?? nowIso();
  await input.env.LIFE_DB.prepare(
    `INSERT INTO cost_guardrail_usage_observations
     (id, resource_key, metric_key, amount, unit, quality, measurement_window, period_key,
      reset_at, reset_timezone, billing_period_start, billing_period_end, invoice_cutoff,
      source_url, source_version, evidence_json, observed_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` ,
  ).bind(
    newId(), input.resourceKey, input.metricKey, input.amount, input.unit, input.quality,
    getCostContract(input.resourceKey).measurementWindow, input.window.periodKey, input.window.resetAt,
    input.window.resetTimezone, input.window.billingPeriodStart, input.window.billingPeriodEnd,
    input.window.invoiceCutoff, input.sourceUrl, input.sourceVersion, JSON.stringify(input.evidence), now, now,
  ).run();
}

async function assertRuntimeDrift(input: { env: Env; now: string }): Promise<void> {
  const keys = Object.keys(input.env).sort();
  const blockedBindings = keys.filter((key) => /^(KV|R2|QUEUE|EMAIL|SEND_EMAIL|CLOUDFLARE_EMAIL)/i.test(key));
  const status = blockedBindings.length ? "DRIFT" : "PASS";
  await input.env.LIFE_DB.prepare(
    `INSERT INTO cost_guardrail_drift_audits
     (id, environment, allowlist_version, status, observed_json, error_code, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(newId(), input.env.ENVIRONMENT, COST_GUARDRAIL_CONTRACT_VERSION, status, JSON.stringify({ blockedBindings, observedKeys: keys.filter((key) => !/TOKEN|SECRET|KEY|PASSWORD|PRIVATE/i.test(key)) }), blockedBindings.length ? "COST_GUARDRAIL_DRIFT" : null, input.now).run();
  if (blockedBindings.length) throw new ApiError(503, "COST_GUARDRAIL_DRIFT", "發現未審核的付費／資源 binding drift。", { blockedBindings });
}

async function ensureOfficialBaselineObservation(input: {
  env: Env;
  contractValue: CostContract;
  now: string;
}): Promise<ContractObservationRow | null> {
  const period = localBaselinePeriod(input.contractValue, new Date(input.now));
  if (!period || input.contractValue.officialIncludedAmount === null) return null;
  const existing = await latestObservation(input.env, input.contractValue.resourceKey);
  if (existing && existing.quality !== "LOCAL_CONSERVATIVE") return null;
  if (existing && existing.period_key === period.periodKey && observationIsAdmissible(existing, input.contractValue, input.now)) return existing;
  const result = await recordContractObservation({
    env: input.env,
    observation: {
      resourceKey: input.contractValue.resourceKey,
      includedAmount: input.contractValue.officialIncludedAmount,
      period,
      quality: "LOCAL_CONSERVATIVE",
      behavior: input.contractValue.behavior,
      evidence: {
        baselineKind: "OFFICIAL_INCLUDED_ALLOWANCE",
        accountObserved: false,
        providerInvoiceTruth: false,
        sourceUrl: input.contractValue.sourceUrl,
      },
      sourceUrl: input.contractValue.sourceUrl,
      sourceVersion: `official-baseline@${COST_GUARDRAIL_CONTRACT_VERSION}`,
      observedAt: input.now,
    },
  });
  return input.env.LIFE_DB.prepare("SELECT * FROM cost_guardrail_contract_observations WHERE id = ?").bind(result.id).first<ContractObservationRow>();
}

async function activeExactObservationOrThrow(input: { env: Env; contractValue: CostContract; now: string }): Promise<ContractObservationRow> {
  const observation = await latestObservation(input.env, input.contractValue.resourceKey);
  if (!observation || !observationIsSafe(observation, input.contractValue, input.now)) {
    throw new ApiError(503, "COST_GUARDRAIL_UNKNOWN", "provider contract、allowance、reset 或 billing evidence 未達 exact；非必要操作已阻擋。", {
      resourceKey: input.contractValue.resourceKey,
      quality: observation?.quality ?? "UNKNOWN",
      periodKey: observation?.period_key ?? null,
    });
  }
  return observation;
}

async function activeAdmissionObservationOrThrow(input: { env: Env; contractValue: CostContract; now: string }): Promise<ContractObservationRow> {
  const observation = await latestObservation(input.env, input.contractValue.resourceKey);
  if (observation && observationIsAdmissible(observation, input.contractValue, input.now)) return observation;
  const baseline = await ensureOfficialBaselineObservation(input);
  if (baseline && observationIsAdmissible(baseline, input.contractValue, input.now)) return baseline;
  throw new ApiError(503, "COST_GUARDRAIL_UNKNOWN", "provider contract、allowance、reset 或 billing evidence 未達可用門檻；非必要操作已阻擋。", {
    resourceKey: input.contractValue.resourceKey,
    quality: observation?.quality ?? "UNKNOWN",
    periodKey: observation?.period_key ?? null,
  });
}

export async function reserveAdmissionBudget(input: {
  env: Env;
  operationId: string;
  resourceKey: CostResourceKey;
  plannedAmount: number;
  overhead?: AdmissionOverhead;
  now?: string;
  requestId?: string;
}): Promise<AdmissionReservation> {
  const now = input.now ?? nowIso();
  await assertRuntimeDrift({ env: input.env, now });
  await expireStaleReservations(input.env, now);
  const contractValue = resourceOrThrow(input.resourceKey);
  if (contractValue.admissionMode !== "GATE") {
    throw new ApiError(503, contractValue.admissionMode === "ACCOUNT_CONTROL" ? "COST_GUARDRAIL_ACCOUNT_CONTROL_REQUIRED" : "COST_GUARDRAIL_UNKNOWN", "此計量只能觀測或由帳戶控制，App 不可安全 gate。", { resourceKey: input.resourceKey });
  }
  const observation = await activeAdmissionObservationOrThrow({ env: input.env, contractValue, now });
  const window = await ensureWindow({ env: input.env, contractValue, observation, now });
  const amount = admissionAmount(input.plannedAmount, input.overhead ?? defaultAdmissionOverhead(input.plannedAmount));
  const existing = await input.env.LIFE_DB.prepare(
    "SELECT id, operation_id, resource_key, period_key, planned_amount, reserved_amount, status, expires_at FROM cost_guardrail_reservations WHERE operation_id = ? AND resource_key = ? AND period_key = ?",
  ).bind(input.operationId, input.resourceKey, observation.period_key).first<ReservationRow>();
  if (existing?.status === "RESERVED") {
    return { id: existing.id, operationId: existing.operation_id, resourceKey: existing.resource_key, periodKey: existing.period_key, plannedAmount: existing.planned_amount, reservedAmount: existing.reserved_amount, unit: contractValue.unit };
  }
  const overrideLimit = await activeOverride(input.env, input.resourceKey, observation.period_key, now);
  const baseLimit = window.internal_limit;
  const baseDegrade = window.degrade_threshold;
  const effectiveLimit = overrideLimit ?? baseLimit;
  const effectiveDegrade = overrideLimit ?? baseDegrade;
  const current = window.local_consumed_amount + window.local_reserved_amount;
  if (window.breaker_state === "OPEN" && overrideLimit === null) {
    await insertAlert(input.env, input.resourceKey, observation.period_key, Math.round((window.hard_stop_threshold / window.included_amount) * 100), now);
    throw new ApiError(429, "COST_GUARDRAIL_HARD_STOP", "成本防線已 hard-stop，等待 reset 或具 expiry 的人工核准。", { resourceKey: input.resourceKey, periodKey: observation.period_key });
  }
  if (current >= effectiveDegrade) {
    await transitionBreaker({ env: input.env, window, state: overrideLimit === null ? "DEGRADED" : "OVERRIDDEN", reason: overrideLimit === null ? "COST_GUARDRAIL_DEGRADED" : "COST_GUARDRAIL_OVERRIDE", now });
    await ensureThresholdAlerts({ env: input.env, contractValue, periodKey: observation.period_key, included: observation.included_amount!, current, now });
    throw new ApiError(429, "COST_GUARDRAIL_DEGRADED", "成本防線已降載，非必要操作暫停。", { resourceKey: input.resourceKey, periodKey: observation.period_key });
  }
  const reservationId = newId();
  const expiresAt = new Date(Date.parse(now) + RESERVATION_TTL_MS).toISOString();
  try {
    await input.env.LIFE_DB.batch([
    input.env.LIFE_DB.prepare(
      `INSERT INTO cost_guardrail_reservations
       (id, operation_id, resource_key, period_key, planned_amount, reserved_amount, status, expires_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'RESERVED', ?, ?, ?)`,
    ).bind(reservationId, input.operationId, input.resourceKey, observation.period_key, amount.plannedAmount, amount.reservedAmount, expiresAt, now, now),
    input.env.LIFE_DB.prepare(
      `INSERT INTO cost_guardrail_ledger_events
       (id, reservation_id, operation_id, resource_key, period_key, event_kind, amount, quality, evidence_json, occurred_at)
       VALUES (?, ?, ?, ?, ?, 'RESERVE', ?, 'LOCAL_CONSERVATIVE', ?, ?)`,
    ).bind(newId(), reservationId, input.operationId, input.resourceKey, observation.period_key, amount.reservedAmount, JSON.stringify({ requestId: input.requestId ?? null, formula: amount }), now),
    ]);
  } catch (error) {
    if (!String(error).includes("COST_GUARDRAIL_RESERVATION_LIMIT")) throw error;
    const latest = await input.env.LIFE_DB.prepare("SELECT local_consumed_amount, local_reserved_amount, breaker_state FROM cost_guardrail_budget_windows WHERE resource_key = ? AND period_key = ?").bind(input.resourceKey, observation.period_key).first<{ local_consumed_amount: number; local_reserved_amount: number; breaker_state: string }>();
    const used = (latest?.local_consumed_amount ?? 0) + (latest?.local_reserved_amount ?? 0);
    if (used + amount.reservedAmount >= effectiveLimit) {
      await transitionBreaker({ env: input.env, window, state: "OPEN", reason: "COST_GUARDRAIL_HARD_STOP", now });
      throw new ApiError(429, "COST_GUARDRAIL_HARD_STOP", "成本防線已達 internal hard-stop。", { resourceKey: input.resourceKey, periodKey: observation.period_key });
    }
    await transitionBreaker({ env: input.env, window, state: "DEGRADED", reason: "COST_GUARDRAIL_DEGRADED", now });
    throw new ApiError(429, "COST_GUARDRAIL_DEGRADED", "成本防線已降載，非必要操作暫停。", { resourceKey: input.resourceKey, periodKey: observation.period_key });
  }
  const updatedCurrent = current + amount.reservedAmount;
  await ensureThresholdAlerts({ env: input.env, contractValue, periodKey: observation.period_key, included: observation.included_amount!, current: updatedCurrent, now });
  return { id: reservationId, operationId: input.operationId, resourceKey: input.resourceKey, periodKey: observation.period_key, plannedAmount: amount.plannedAmount, reservedAmount: amount.reservedAmount, unit: contractValue.unit };
}

export async function commitAdmissionReservation(input: {
  env: Env;
  reservation: AdmissionReservation;
  succeeded: boolean;
  actualAmount?: number;
  now?: string;
}): Promise<void> {
  const now = input.now ?? nowIso();
  const row = await input.env.LIFE_DB.prepare(
    "SELECT id, operation_id, resource_key, period_key, planned_amount, reserved_amount, status, expires_at, settled_amount, succeeded FROM cost_guardrail_reservations WHERE id = ?",
  ).bind(input.reservation.id).first<ReservationRow>();
  if (!row || row.status !== "RESERVED") return;
  const actualAmount = input.succeeded ? safeInteger(input.actualAmount ?? row.planned_amount, "actual amount") : row.reserved_amount;
  const window = await input.env.LIFE_DB.prepare("SELECT * FROM cost_guardrail_budget_windows WHERE resource_key = ? AND period_key = ?").bind(row.resource_key, row.period_key).first<BudgetWindowRow>();
  if (!window) throw new ApiError(500, "INTERNAL_ERROR", "成本 reservation window 遺失。", { resourceKey: row.resource_key, periodKey: row.period_key });
  const contractValue = getCostContract(row.resource_key);
  const nextConsumed = window.local_consumed_amount + actualAmount;
  const policy = policyFor(contractValue);
  const hardStop = policy.hardStopFraction === null ? Number.MAX_SAFE_INTEGER : Math.floor(window.included_amount * policy.hardStopFraction);
  const degrade = policy.degradeFraction === null ? Number.MAX_SAFE_INTEGER : Math.floor(window.included_amount * policy.degradeFraction);
  const nextState = nextConsumed >= hardStop ? "OPEN" : nextConsumed >= degrade ? "DEGRADED" : window.breaker_state === "OVERRIDDEN" ? "OVERRIDDEN" : "CLOSED";
  try {
    const result = await input.env.LIFE_DB.prepare(
      "UPDATE cost_guardrail_reservations SET status = 'COMMITTED', settled_amount = ?, succeeded = ?, updated_at = ? WHERE id = ? AND status = 'RESERVED'",
    ).bind(actualAmount, input.succeeded ? 1 : 0, now, row.id).run();
    if (Number(result.meta.changes ?? 0) !== 1) return;
  } catch (error) {
    if (String(error).includes("COST_GUARDRAIL_COMMIT_CONFLICT")) {
      throw new ApiError(409, "COST_GUARDRAIL_HARD_STOP", "reservation 已被其他工作消耗或無法安全 commit。", { resourceKey: row.resource_key, periodKey: row.period_key });
    }
    throw error;
  }
  await recordUsageObservation({
    env: input.env, resourceKey: row.resource_key, metricKey: contractValue.metricKey, amount: actualAmount,
    unit: contractValue.unit, quality: "LOCAL_CONSERVATIVE", window: {
      periodKey: row.period_key, resetAt: window.reset_at, resetTimezone: window.reset_timezone,
      billingPeriodStart: window.billing_period_start, billingPeriodEnd: window.billing_period_end, invoiceCutoff: window.invoice_cutoff,
    }, sourceUrl: "local://cost-guardrail-ledger", sourceVersion: COST_GUARDRAIL_CONTRACT_VERSION,
    evidence: { providerInvoiceTruth: false, reservationId: row.id, succeeded: input.succeeded }, observedAt: now,
  });
  if (nextState !== window.breaker_state) await transitionBreaker({ env: input.env, window, state: nextState, reason: nextState === "OPEN" ? "COST_GUARDRAIL_HARD_STOP" : nextState === "DEGRADED" ? "COST_GUARDRAIL_DEGRADED" : "COST_GUARDRAIL_RECOVERED", now });
  await ensureThresholdAlerts({ env: input.env, contractValue, periodKey: row.period_key, included: window.included_amount, current: nextConsumed, now });
}

export async function releaseAdmissionReservation(input: { env: Env; reservation: AdmissionReservation; now?: string }): Promise<void> {
  const now = input.now ?? nowIso();
  const row = await input.env.LIFE_DB.prepare("SELECT id, operation_id, resource_key, period_key, reserved_amount, status FROM cost_guardrail_reservations WHERE id = ?").bind(input.reservation.id).first<ReservationRow>();
  if (!row || row.status !== "RESERVED") return;
  try {
    await input.env.LIFE_DB.prepare("UPDATE cost_guardrail_reservations SET status = 'RELEASED', updated_at = ? WHERE id = ? AND status = 'RESERVED'").bind(now, row.id).run();
  } catch (error) {
    if (String(error).includes("COST_GUARDRAIL_RELEASE_CONFLICT")) {
      throw new ApiError(409, "COST_GUARDRAIL_HARD_STOP", "reservation 無法安全 release。", { resourceKey: row.resource_key, periodKey: row.period_key });
    }
    throw error;
  }
}

export async function reserveD1AdmissionBudget(input: {
  env: Env;
  operationId: string;
  rowsRead: number;
  rowsWritten: number;
  storageBytes: number;
  requestId?: string;
  now?: string;
}): Promise<D1AdmissionReservations> {
  const reserved: AdmissionReservation[] = [];
  try {
    const rowsRead = await reserveAdmissionBudget({
      env: input.env, operationId: `${input.operationId}:d1.rows_read`, resourceKey: "d1.rows_read",
      plannedAmount: input.rowsRead, requestId: input.requestId, now: input.now,
    });
    reserved.push(rowsRead);
    const rowsWritten = await reserveAdmissionBudget({
      env: input.env, operationId: `${input.operationId}:d1.rows_written`, resourceKey: "d1.rows_written",
      plannedAmount: input.rowsWritten, requestId: input.requestId, now: input.now,
    });
    reserved.push(rowsWritten);
    const storageBytes = await reserveAdmissionBudget({
      env: input.env, operationId: `${input.operationId}:d1.storage_bytes`, resourceKey: "d1.storage_bytes",
      plannedAmount: input.storageBytes, requestId: input.requestId, now: input.now,
    });
    reserved.push(storageBytes);
    return { rowsRead, rowsWritten, storageBytes };
  } catch (error) {
    await Promise.all(reserved.map((reservation) => releaseAdmissionReservation({ env: input.env, reservation, now: input.now })));
    throw error;
  }
}

export async function commitD1AdmissionBudget(input: {
  env: Env;
  reservations: D1AdmissionReservations;
  succeeded: boolean;
  now?: string;
}): Promise<void> {
  await Promise.all(Object.values(input.reservations).map((reservation) => commitAdmissionReservation({
    env: input.env, reservation, succeeded: input.succeeded, now: input.now,
  })));
}

export function createProviderRequestGuard(input: { env: Env; operationId: string; requestId?: string }): ProviderRequestGuard {
  let sequence = 0;
  return {
    beforeRequest: async ({ resourceKey, plannedAmount, operationKind }) => reserveAdmissionBudget({
      env: input.env, operationId: `${input.operationId}:${resourceKey}:${operationKind}:${sequence++}`,
      resourceKey, plannedAmount, requestId: input.requestId,
    }),
    afterRequest: async (reservation, succeeded) => commitAdmissionReservation({ env: input.env, reservation, succeeded }),
  };
}

export async function getCostGuardrailStatus(input: { env: Env; now?: string }): Promise<Record<string, unknown>> {
  const now = input.now ?? nowIso();
  const [observations, windows, alerts, drift] = await Promise.all([
    input.env.LIFE_DB.prepare("SELECT * FROM cost_guardrail_contract_observations ORDER BY observed_at DESC").all<ContractObservationRow>(),
    input.env.LIFE_DB.prepare("SELECT * FROM cost_guardrail_budget_windows ORDER BY resource_key, period_key").all<BudgetWindowRow>(),
    input.env.LIFE_DB.prepare("SELECT resource_key, period_key, threshold_percent, status, attempt, last_error_code, created_at, updated_at FROM cost_guardrail_alerts ORDER BY created_at DESC LIMIT 200").all(),
    input.env.LIFE_DB.prepare("SELECT environment, allowlist_version, status, observed_json, error_code, created_at FROM cost_guardrail_drift_audits ORDER BY created_at DESC LIMIT 1").first(),
  ]);
  const latest = new Map<string, ContractObservationRow>();
  for (const observation of observations.results) if (!latest.has(observation.resource_key)) latest.set(observation.resource_key, observation);
  const windowMap = new Map(windows.results.map((window) => [`${window.resource_key}:${window.period_key}`, window]));
  const data = listCostContracts().map((contractValue) => {
    const observation = latest.get(contractValue.resourceKey) ?? null;
    const safe = observation ? observationIsAdmissible(observation, contractValue, now) : false;
    const resourceWindows = windows.results.filter((window) => window.resource_key === contractValue.resourceKey);
    const current = resourceWindows.at(-1) ?? null;
    const decision = contractValue.admissionMode === "ACCOUNT_CONTROL" || contractValue.admissionMode === "OBSERVE_ONLY"
      ? "ACCOUNT_CONTROL_REQUIRED"
      : !safe ? "UNKNOWN"
        : current?.breaker_state === "OPEN" ? "HARD_STOP"
          : current?.breaker_state === "DEGRADED" ? "DEGRADED"
            : observation?.quality === "LOCAL_CONSERVATIVE" ? "ESTIMATED" : "READY";
    return {
      resourceKey: contractValue.resourceKey,
      metricKey: contractValue.metricKey,
      unit: contractValue.unit,
      owner: contractValue.owner,
      admissionMode: contractValue.admissionMode,
      officialIncludedAmount: contractValue.officialIncludedAmount,
      riskClass: contractValue.riskClass,
      behavior: observation?.behavior ?? contractValue.behavior,
      quality: observation?.quality ?? "UNKNOWN",
      observation: observation ? {
        includedAmount: observation.included_amount, periodKey: observation.period_key, resetAt: observation.reset_at,
        resetTimezone: observation.reset_timezone, billingPeriodStart: observation.billing_period_start,
        billingPeriodEnd: observation.billing_period_end, invoiceCutoff: observation.invoice_cutoff,
        sourceVersion: observation.source_version, observedAt: observation.observed_at,
      } : null,
      window: current ? {
        periodKey: current.period_key, localConsumedAmount: current.local_consumed_amount,
        localReservedAmount: current.local_reserved_amount, internalLimit: current.internal_limit,
        degradeThreshold: current.degrade_threshold, hardStopThreshold: current.hard_stop_threshold,
        breakerState: current.breaker_state, breakerReason: current.breaker_reason,
      } : null,
      decision,
      alerts: alerts.results.filter((alert) => alert.resource_key === contractValue.resourceKey),
      knownWindowCount: resourceWindows.length,
      windowMapSize: windowMap.size,
    };
  });
  return {
    contractVersion: COST_GUARDRAIL_CONTRACT_VERSION,
    observedAt: now,
    providerInvoiceTruth: false,
    drift: drift ? { ...drift, observed_json: JSON.parse(String(drift.observed_json)) } : { status: "UNKNOWN" },
    resources: data,
  };
}

export async function createCostOverride(input: {
  env: Env;
  resourceKey: CostResourceKey;
  periodKey: string;
  approvedInternalLimit: number;
  reason: string;
  actorId: string;
  expiresAt: string;
  now?: string;
}): Promise<{ id: string; expiresAt: string }> {
  const now = input.now ?? nowIso();
  const contractValue = resourceOrThrow(input.resourceKey);
  if (contractValue.admissionMode !== "GATE") throw new ApiError(400, "COST_GUARDRAIL_OVERRIDE_INVALID", "此資源不是 App gate 對象。", { resourceKey: input.resourceKey });
  if (!Number.isSafeInteger(input.approvedInternalLimit) || input.approvedInternalLimit <= 0 || input.reason.trim().length < 10) throw new ApiError(400, "COST_GUARDRAIL_OVERRIDE_INVALID", "override 必須包含正整數 limit 與至少 10 字 reason。", {});
  const expiry = Date.parse(input.expiresAt);
  const nowMs = Date.parse(now);
  if (!Number.isFinite(expiry) || expiry <= nowMs || expiry > nowMs + MAX_OVERRIDE_MS) throw new ApiError(400, "COST_GUARDRAIL_OVERRIDE_INVALID", "override expiry 必須在現在之後 24 小時內。", {});
  const observation = await activeExactObservationOrThrow({ env: input.env, contractValue, now });
  if (observation.period_key !== input.periodKey || observation.included_amount === null || input.approvedInternalLimit >= observation.included_amount) throw new ApiError(400, "COST_GUARDRAIL_OVERRIDE_INVALID", "override 必須小於同一 exact period 的 included allowance。", { resourceKey: input.resourceKey, periodKey: input.periodKey });
  await ensureWindow({ env: input.env, contractValue, observation, now });
  const id = newId();
  await input.env.LIFE_DB.batch([
    input.env.LIFE_DB.prepare("INSERT INTO cost_guardrail_overrides (id, resource_key, period_key, approved_internal_limit, reason, actor_id, expires_at, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?)").bind(id, input.resourceKey, input.periodKey, input.approvedInternalLimit, input.reason.trim(), input.actorId, input.expiresAt, now),
    input.env.LIFE_DB.prepare("UPDATE cost_guardrail_budget_windows SET breaker_state = 'OVERRIDDEN', breaker_reason = 'COST_GUARDRAIL_OVERRIDE', updated_at = ?, version = version + 1 WHERE resource_key = ? AND period_key = ?").bind(now, input.resourceKey, input.periodKey),
    input.env.LIFE_DB.prepare("INSERT INTO cost_guardrail_breaker_events (id, resource_key, period_key, from_state, to_state, reason_code, actor_id, occurred_at, evidence_json) VALUES (?, ?, ?, NULL, 'OVERRIDDEN', 'COST_GUARDRAIL_OVERRIDE', ?, ?, ?)").bind(newId(), input.resourceKey, input.periodKey, input.actorId, now, JSON.stringify({ overrideId: id, expiresAt: input.expiresAt })),
  ]);
  return { id, expiresAt: input.expiresAt };
}

export async function revokeCostOverride(input: { env: Env; overrideId: string; actorId: string; now?: string }): Promise<void> {
  const now = input.now ?? nowIso();
  const override = await input.env.LIFE_DB.prepare(
    "SELECT id, resource_key, period_key, approved_internal_limit, actor_id, expires_at, status FROM cost_guardrail_overrides WHERE id = ?",
  ).bind(input.overrideId).first<OverrideRow>();
  if (!override) throw new ApiError(404, "NOT_FOUND", "成本 override 不存在。", { overrideId: input.overrideId });
  if (override.status !== "ACTIVE") return;
  const window = await input.env.LIFE_DB.prepare(
    "SELECT resource_key, period_key, breaker_state, local_consumed_amount, local_reserved_amount, degrade_threshold, hard_stop_threshold FROM cost_guardrail_budget_windows WHERE resource_key = ? AND period_key = ?",
  ).bind(override.resource_key, override.period_key).first<Pick<BudgetWindowRow, "resource_key" | "period_key" | "breaker_state" | "local_consumed_amount" | "local_reserved_amount" | "degrade_threshold" | "hard_stop_threshold">>();
  const used = (window?.local_consumed_amount ?? 0) + (window?.local_reserved_amount ?? 0);
  const nextState = !window ? null : used >= window.hard_stop_threshold ? "OPEN" : used >= window.degrade_threshold ? "DEGRADED" : "CLOSED";
  await input.env.LIFE_DB.batch([
    input.env.LIFE_DB.prepare("UPDATE cost_guardrail_overrides SET status = 'REVOKED', revoked_at = ? WHERE id = ? AND status = 'ACTIVE'").bind(now, input.overrideId),
    ...(window && nextState ? [
      input.env.LIFE_DB.prepare(
        "UPDATE cost_guardrail_budget_windows SET breaker_state = ?, breaker_reason = 'COST_GUARDRAIL_OVERRIDE_REVOKED', updated_at = ?, version = version + 1 WHERE resource_key = ? AND period_key = ?",
      ).bind(nextState, now, override.resource_key, override.period_key),
      input.env.LIFE_DB.prepare(
        "INSERT INTO cost_guardrail_breaker_events (id, resource_key, period_key, from_state, to_state, reason_code, actor_id, occurred_at, evidence_json) VALUES (?, ?, ?, ?, ?, 'COST_GUARDRAIL_OVERRIDE_REVOKED', ?, ?, ?)",
      ).bind(newId(), override.resource_key, override.period_key, window.breaker_state, nextState, input.actorId, now, JSON.stringify({ overrideId: override.id, originalActorId: override.actor_id, expiresAt: override.expires_at })),
    ] : []),
  ]);
}

export async function currentProviderPeriod(resourceKey: CostResourceKey, now = new Date()): Promise<CostWindowInput> {
  const contractValue = getCostContract(resourceKey);
  if (contractValue.measurementWindow === "PACIFIC_DAY") return pacificDayPeriod(now);
  return { periodKey: `UNRESOLVED:${resourceKey}:${now.toISOString().slice(0, 10)}`, resetAt: null, resetTimezone: contractValue.defaultResetTimezone, billingPeriodStart: null, billingPeriodEnd: null, invoiceCutoff: null };
}
