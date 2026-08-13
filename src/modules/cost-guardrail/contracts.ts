export const COST_GUARDRAIL_CONTRACT_VERSION = "cost-guardrail@2026-08-14";

export type CostQuality = "EXACT" | "LOCAL_CONSERVATIVE" | "UNKNOWN" | "STALE" | "MISMATCH";
export type CostBehavior = "HARD_REJECT" | "SOFT_LIMIT" | "AUTO_BILL" | "ALERT_ONLY" | "UNKNOWN";
export type CostRiskClass = "AUTO_OVERAGE_OR_UNKNOWN" | "HARD_REJECT_ONLY" | "ACCOUNT_CONTROL";
export type CostAdmissionMode = "GATE" | "OBSERVE_ONLY" | "ACCOUNT_CONTROL";
export type CostBreakerState = "CLOSED" | "DEGRADED" | "OPEN" | "OVERRIDDEN";

export const COST_RESOURCE_KEYS = [
  "cloudflare.access",
  "workers.requests",
  "workers.cpu_ms",
  "workers.external_subrequests",
  "workers.cron_triggers",
  "d1.rows_read",
  "d1.rows_written",
  "d1.storage_bytes",
  "resend.emails",
  "resend.requests",
  "youtube.data_api_units",
  "youtube.analytics_api_requests",
  "instagram.graph_api_window",
  "cloudflare.kv",
  "cloudflare.r2",
  "cloudflare.queues",
  "cloudflare.email",
] as const;

export type CostResourceKey = typeof COST_RESOURCE_KEYS[number];

export type CostMeasurementWindow =
  | "UTC_DAY"
  | "PACIFIC_DAY"
  | "ROLLING_PROVIDER"
  | "PROVIDER_PLAN"
  | "MONTHLY_AUTHORIZATION"
  | "INVOCATION"
  | "ACCOUNT_CONFIGURATION";

export interface CostContract {
  resourceKey: CostResourceKey;
  metricKey: string;
  unit: string;
  officialIncludedAmount: number | null;
  measurementWindow: CostMeasurementWindow;
  defaultResetTimezone: string | null;
  riskClass: CostRiskClass;
  behavior: CostBehavior;
  admissionMode: CostAdmissionMode;
  owner: string;
  sourceUrl: string | null;
  sourceVersion: string;
}

export interface CostPolicy {
  maximumFraction: number | null;
  degradeFraction: number | null;
  hardStopFraction: number | null;
}

export interface CostWindowInput {
  periodKey: string;
  resetAt: string | null;
  resetTimezone: string | null;
  billingPeriodStart: string | null;
  billingPeriodEnd: string | null;
  invoiceCutoff: string | null;
}

export interface AdmissionOverhead {
  retry: number;
  inFlight: number;
  schedulerRace: number;
  resetClockSkew: number;
}

export interface AdmissionAmount {
  plannedAmount: number;
  overhead: AdmissionOverhead;
  reservedAmount: number;
}

export interface D1SyncAdmissionEstimate {
  rowsRead: number;
  rowsWritten: number;
  storageBytes: number;
  formulaVersion: string;
}

function contract(input: Omit<CostContract, "sourceVersion"> & { sourceVersion?: string }): CostContract {
  return { ...input, sourceVersion: input.sourceVersion ?? COST_GUARDRAIL_CONTRACT_VERSION };
}

const CONTRACTS: Readonly<Record<CostResourceKey, CostContract>> = {
  "cloudflare.access": contract({
    resourceKey: "cloudflare.access", metricKey: "active_seats", unit: "seat", officialIncludedAmount: null,
    measurementWindow: "MONTHLY_AUTHORIZATION", defaultResetTimezone: "UTC", riskClass: "ACCOUNT_CONTROL",
    behavior: "UNKNOWN", admissionMode: "ACCOUNT_CONTROL", owner: "Cloudflare account administrator", sourceUrl: null,
  }),
  "workers.requests": contract({
    resourceKey: "workers.requests", metricKey: "inbound_requests", unit: "request", officialIncludedAmount: 100000,
    measurementWindow: "UTC_DAY", defaultResetTimezone: "UTC", riskClass: "AUTO_OVERAGE_OR_UNKNOWN",
    behavior: "UNKNOWN", admissionMode: "OBSERVE_ONLY", owner: "Worker / Cloudflare account administrator",
    sourceUrl: "https://developers.cloudflare.com/workers/platform/limits/",
  }),
  "workers.cpu_ms": contract({
    resourceKey: "workers.cpu_ms", metricKey: "cpu_time", unit: "ms_per_invocation", officialIncludedAmount: 10,
    measurementWindow: "INVOCATION", defaultResetTimezone: "UTC", riskClass: "HARD_REJECT_ONLY",
    behavior: "HARD_REJECT", admissionMode: "OBSERVE_ONLY", owner: "Worker / Cloudflare account administrator",
    sourceUrl: "https://developers.cloudflare.com/workers/platform/limits/",
  }),
  "workers.external_subrequests": contract({
    resourceKey: "workers.external_subrequests", metricKey: "external_subrequests", unit: "subrequest_per_invocation", officialIncludedAmount: 50,
    measurementWindow: "INVOCATION", defaultResetTimezone: "UTC", riskClass: "HARD_REJECT_ONLY",
    behavior: "HARD_REJECT", admissionMode: "OBSERVE_ONLY", owner: "Worker / Cloudflare account administrator",
    sourceUrl: "https://developers.cloudflare.com/workers/platform/limits/",
  }),
  "workers.cron_triggers": contract({
    resourceKey: "workers.cron_triggers", metricKey: "cron_triggers_per_account", unit: "trigger", officialIncludedAmount: 5,
    measurementWindow: "ACCOUNT_CONFIGURATION", defaultResetTimezone: "UTC", riskClass: "HARD_REJECT_ONLY",
    behavior: "HARD_REJECT", admissionMode: "OBSERVE_ONLY", owner: "Cloudflare account administrator",
    sourceUrl: "https://developers.cloudflare.com/workers/platform/limits/",
  }),
  "d1.rows_read": contract({
    resourceKey: "d1.rows_read", metricKey: "rows_read", unit: "row", officialIncludedAmount: 5000000,
    measurementWindow: "UTC_DAY", defaultResetTimezone: "UTC", riskClass: "AUTO_OVERAGE_OR_UNKNOWN",
    behavior: "UNKNOWN", admissionMode: "GATE", owner: "D1 / sync owner",
    sourceUrl: "https://developers.cloudflare.com/d1/platform/pricing/",
  }),
  "d1.rows_written": contract({
    resourceKey: "d1.rows_written", metricKey: "rows_written", unit: "row", officialIncludedAmount: 100000,
    measurementWindow: "UTC_DAY", defaultResetTimezone: "UTC", riskClass: "AUTO_OVERAGE_OR_UNKNOWN",
    behavior: "UNKNOWN", admissionMode: "GATE", owner: "D1 / sync owner",
    sourceUrl: "https://developers.cloudflare.com/d1/platform/pricing/",
  }),
  "d1.storage_bytes": contract({
    resourceKey: "d1.storage_bytes", metricKey: "storage", unit: "byte", officialIncludedAmount: 5_000_000_000,
    measurementWindow: "PROVIDER_PLAN", defaultResetTimezone: "UTC", riskClass: "AUTO_OVERAGE_OR_UNKNOWN",
    behavior: "UNKNOWN", admissionMode: "GATE", owner: "D1 / Cloudflare account administrator",
    sourceUrl: "https://developers.cloudflare.com/d1/platform/pricing/",
  }),
  "resend.emails": contract({
    resourceKey: "resend.emails", metricKey: "transactional_emails", unit: "email", officialIncludedAmount: 100,
    measurementWindow: "PROVIDER_PLAN", defaultResetTimezone: "UTC", riskClass: "AUTO_OVERAGE_OR_UNKNOWN",
    behavior: "UNKNOWN", admissionMode: "GATE", owner: "Notifications / Resend account administrator",
    sourceUrl: "https://resend.com/docs/knowledge-base/account-quotas-and-limits",
  }),
  "resend.requests": contract({
    resourceKey: "resend.requests", metricKey: "api_requests", unit: "request_per_second", officialIncludedAmount: 5,
    measurementWindow: "ROLLING_PROVIDER", defaultResetTimezone: "UTC", riskClass: "HARD_REJECT_ONLY",
    behavior: "HARD_REJECT", admissionMode: "GATE", owner: "Notifications / Resend account administrator",
    sourceUrl: "https://resend.com/docs/api-reference/rate-limit",
  }),
  "youtube.data_api_units": contract({
    resourceKey: "youtube.data_api_units", metricKey: "quota_units", unit: "unit", officialIncludedAmount: 10000,
    measurementWindow: "PACIFIC_DAY", defaultResetTimezone: "America/Los_Angeles", riskClass: "HARD_REJECT_ONLY",
    behavior: "HARD_REJECT", admissionMode: "GATE", owner: "YouTube provider owner / Google project administrator",
    sourceUrl: "https://developers.google.com/youtube/v3/determine_quota_cost",
  }),
  "youtube.analytics_api_requests": contract({
    resourceKey: "youtube.analytics_api_requests", metricKey: "reports_query", unit: "request", officialIncludedAmount: null,
    measurementWindow: "PROVIDER_PLAN", defaultResetTimezone: "America/Los_Angeles", riskClass: "AUTO_OVERAGE_OR_UNKNOWN",
    behavior: "UNKNOWN", admissionMode: "GATE", owner: "YouTube provider owner / Google project administrator",
    sourceUrl: "https://developers.google.com/youtube/analytics/reference/reports/query",
  }),
  "instagram.graph_api_window": contract({
    resourceKey: "instagram.graph_api_window", metricKey: "provider_usage_window", unit: "provider_request", officialIncludedAmount: null,
    measurementWindow: "ROLLING_PROVIDER", defaultResetTimezone: "UTC", riskClass: "AUTO_OVERAGE_OR_UNKNOWN",
    behavior: "UNKNOWN", admissionMode: "GATE", owner: "Instagram provider owner / Meta account administrator",
    sourceUrl: "https://developers.facebook.com/docs/graph-api/overview/rate-limiting/",
  }),
  "cloudflare.kv": contract({
    resourceKey: "cloudflare.kv", metricKey: "unapproved_binding", unit: "binding", officialIncludedAmount: null,
    measurementWindow: "ACCOUNT_CONFIGURATION", defaultResetTimezone: "UTC", riskClass: "ACCOUNT_CONTROL",
    behavior: "UNKNOWN", admissionMode: "ACCOUNT_CONTROL", owner: "Cloudflare account administrator", sourceUrl: null,
  }),
  "cloudflare.r2": contract({
    resourceKey: "cloudflare.r2", metricKey: "unapproved_binding", unit: "binding", officialIncludedAmount: null,
    measurementWindow: "ACCOUNT_CONFIGURATION", defaultResetTimezone: "UTC", riskClass: "ACCOUNT_CONTROL",
    behavior: "UNKNOWN", admissionMode: "ACCOUNT_CONTROL", owner: "Cloudflare account administrator", sourceUrl: null,
  }),
  "cloudflare.queues": contract({
    resourceKey: "cloudflare.queues", metricKey: "unapproved_binding", unit: "binding", officialIncludedAmount: null,
    measurementWindow: "ACCOUNT_CONFIGURATION", defaultResetTimezone: "UTC", riskClass: "ACCOUNT_CONTROL",
    behavior: "UNKNOWN", admissionMode: "ACCOUNT_CONTROL", owner: "Cloudflare account administrator", sourceUrl: null,
  }),
  "cloudflare.email": contract({
    resourceKey: "cloudflare.email", metricKey: "unapproved_binding", unit: "binding", officialIncludedAmount: null,
    measurementWindow: "ACCOUNT_CONFIGURATION", defaultResetTimezone: "UTC", riskClass: "ACCOUNT_CONTROL",
    behavior: "UNKNOWN", admissionMode: "ACCOUNT_CONTROL", owner: "Cloudflare account administrator", sourceUrl: null,
  }),
};

export function getCostContract(resourceKey: CostResourceKey): CostContract {
  return CONTRACTS[resourceKey];
}

export function listCostContracts(): CostContract[] {
  return COST_RESOURCE_KEYS.map((resourceKey) => CONTRACTS[resourceKey]);
}

export function policyFor(contractValue: CostContract): CostPolicy {
  if (contractValue.riskClass === "AUTO_OVERAGE_OR_UNKNOWN") {
    return { maximumFraction: 0.8, degradeFraction: 0.7, hardStopFraction: 0.8 };
  }
  if (contractValue.riskClass === "HARD_REJECT_ONLY") {
    return { maximumFraction: 0.85, degradeFraction: 0.75, hardStopFraction: 0.85 };
  }
  return { maximumFraction: null, degradeFraction: null, hardStopFraction: null };
}

export function admissionAmount(plannedAmount: number, overhead: AdmissionOverhead): AdmissionAmount {
  const values = [plannedAmount, overhead.retry, overhead.inFlight, overhead.schedulerRace, overhead.resetClockSkew];
  if (values.some((value) => !Number.isSafeInteger(value) || value < 0)) {
    throw new Error("COST_GUARDRAIL_INVALID_ADMISSION_AMOUNT");
  }
  const reservedAmount = plannedAmount + overhead.retry + overhead.inFlight + overhead.schedulerRace + overhead.resetClockSkew;
  if (!Number.isSafeInteger(reservedAmount)) throw new Error("COST_GUARDRAIL_INVALID_ADMISSION_AMOUNT");
  return {
    plannedAmount,
    overhead,
    reservedAmount,
  };
}

export function defaultAdmissionOverhead(plannedAmount: number): AdmissionOverhead {
  return { retry: plannedAmount, inFlight: 1, schedulerRace: 1, resetClockSkew: 1 };
}

// This is deliberately a local conservative ledger formula, not a D1 billing
// measurement. It charges every raw payload for the bounded app-side lookup
// and write fan-out, then adds fixed monitoring/transaction overhead. A real
// provider usage observation must still be reconciled separately.
export function d1SyncAdmissionEstimate(input: {
  payloadCount: number;
  payloadBytes: number;
  derivedMetricCount: number;
}): D1SyncAdmissionEstimate {
  const values = [input.payloadCount, input.payloadBytes, input.derivedMetricCount];
  if (values.some((value) => !Number.isSafeInteger(value) || value < 0)) throw new Error("COST_GUARDRAIL_INVALID_D1_ESTIMATE");
  const rowsRead = 64 + input.payloadCount * 32 + input.derivedMetricCount * 8;
  const rowsWritten = 32 + input.payloadCount * 16 + input.derivedMetricCount * 8;
  const storageBytes = 4096 + input.payloadBytes * 2;
  if (![rowsRead, rowsWritten, storageBytes].every(Number.isSafeInteger)) throw new Error("COST_GUARDRAIL_INVALID_D1_ESTIMATE");
  return {
    rowsRead,
    rowsWritten,
    storageBytes,
    formulaVersion: "d1-sync-local-conservative@1",
  };
}

export function utcDayPeriod(now: Date): CostWindowInput {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return {
    periodKey: `UTC_DAY:${start.toISOString().slice(0, 10)}`,
    resetAt: end.toISOString(), resetTimezone: "UTC",
    billingPeriodStart: null, billingPeriodEnd: null, invoiceCutoff: null,
  };
}

export function pacificDayPeriod(now: Date): CostWindowInput {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return {
    periodKey: `PACIFIC_DAY:${day}`,
    resetAt: null, resetTimezone: "America/Los_Angeles",
    billingPeriodStart: null, billingPeriodEnd: null, invoiceCutoff: null,
  };
}

export function monthlyPeriod(now: Date): CostWindowInput {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return {
    periodKey: `MONTH:${start.toISOString().slice(0, 7)}`,
    resetAt: end.toISOString(), resetTimezone: "UTC",
    billingPeriodStart: start.toISOString(), billingPeriodEnd: end.toISOString(), invoiceCutoff: end.toISOString(),
  };
}
