import { env } from "cloudflare:workers";
import { applyD1Migrations } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import { getCostContract } from "@/modules/cost-guardrail/contracts";
import {
  commitAdmissionReservation,
  createCostOverride,
  recordContractObservation,
  releaseAdmissionReservation,
  reserveAdmissionBudget,
  revokeCostOverride,
} from "@/modules/cost-guardrail/service";

const RESET_AT = "2099-01-01T00:00:00.000Z";

async function observeExact(resourceKey: "d1.rows_read" | "youtube.data_api_units", includedAmount: number, periodKey: string): Promise<void> {
  const contract = getCostContract(resourceKey);
  await recordContractObservation({
    env,
    observation: {
      resourceKey,
      includedAmount,
      period: {
        periodKey,
        resetAt: RESET_AT,
        resetTimezone: contract.defaultResetTimezone,
        billingPeriodStart: "2098-12-01T00:00:00.000Z",
        billingPeriodEnd: RESET_AT,
        invoiceCutoff: RESET_AT,
      },
      quality: "EXACT",
      behavior: contract.behavior,
      evidence: { source: "synthetic-test-contract", providerInvoiceTruth: false },
      sourceUrl: contract.sourceUrl,
      sourceVersion: "synthetic-test@2026-08-14",
    },
  });
}

describe("cost guardrail D1 admission", () => {
  beforeAll(async () => {
    await applyD1Migrations(env.LIFE_DB, env.TEST_MIGRATIONS);
  });

  it("fails closed without exact allowance/reset/billing evidence", async () => {
    await expect(reserveAdmissionBudget({
      env,
      operationId: "unknown-d1-storage-operation",
      resourceKey: "d1.storage_bytes",
      plannedAmount: 1,
    })).rejects.toMatchObject({ code: "COST_GUARDRAIL_UNKNOWN" });
  });

  it("applies a 70% degrade threshold and leaves no orphan on rejected reserve", async () => {
    const periodKey = "UTC_DAY:TEST-D1-ADMISSION";
    await observeExact("d1.rows_read", 100, periodKey);
    const first = await reserveAdmissionBudget({ env, operationId: "d1-admission-first", resourceKey: "d1.rows_read", plannedAmount: 10 });
    const second = await reserveAdmissionBudget({ env, operationId: "d1-admission-second", resourceKey: "d1.rows_read", plannedAmount: 10 });
    expect(first.reservedAmount).toBe(23);
    expect(second.reservedAmount).toBe(23);
    await expect(reserveAdmissionBudget({ env, operationId: "d1-admission-third", resourceKey: "d1.rows_read", plannedAmount: 11 })).rejects.toMatchObject({ code: "COST_GUARDRAIL_DEGRADED" });
    const orphan = await env.LIFE_DB.prepare("SELECT COUNT(*) AS count FROM cost_guardrail_reservations WHERE operation_id = 'd1-admission-third'").first<{ count: number }>();
    expect(orphan?.count).toBe(0);
    await commitAdmissionReservation({ env, reservation: first, succeeded: true });
    await commitAdmissionReservation({ env, reservation: second, succeeded: true });
  });

  it("serializes concurrent reservations against the same internal budget", async () => {
    const periodKey = "PACIFIC_DAY:TEST-YOUTUBE-RACE";
    await observeExact("youtube.data_api_units", 50, periodKey);
    const results = await Promise.allSettled([
      reserveAdmissionBudget({ env, operationId: "youtube-race-a", resourceKey: "youtube.data_api_units", plannedAmount: 10 }),
      reserveAdmissionBudget({ env, operationId: "youtube-race-b", resourceKey: "youtube.data_api_units", plannedAmount: 10 }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
  });

  it("settles release exactly once and records no consumed amount", async () => {
    const periodKey = "UTC_DAY:TEST-D1-RELEASE";
    await observeExact("d1.rows_read", 100, periodKey);
    const reservation = await reserveAdmissionBudget({ env, operationId: "d1-release-once", resourceKey: "d1.rows_read", plannedAmount: 1 });
    await releaseAdmissionReservation({ env, reservation });
    await releaseAdmissionReservation({ env, reservation });
    const state = await env.LIFE_DB.prepare(
      "SELECT local_reserved_amount, local_consumed_amount FROM cost_guardrail_budget_windows WHERE resource_key = 'd1.rows_read' AND period_key = ?",
    ).bind(periodKey).first<{ local_reserved_amount: number; local_consumed_amount: number }>();
    const events = await env.LIFE_DB.prepare(
      "SELECT COUNT(*) AS count FROM cost_guardrail_ledger_events WHERE reservation_id = ? AND event_kind = 'RELEASE'",
    ).bind(reservation.id).first<{ count: number }>();
    expect(state).toEqual({ local_reserved_amount: 0, local_consumed_amount: 0 });
    expect(events?.count).toBe(1);
  });

  it("expires an override into the base breaker state and keeps an audit event", async () => {
    const periodKey = "UTC_DAY:TEST-D1-OVERRIDE";
    await observeExact("d1.rows_read", 100, periodKey);
    const override = await createCostOverride({
      env,
      resourceKey: "d1.rows_read",
      periodKey,
      approvedInternalLimit: 90,
      reason: "synthetic short lived budget review",
      actorId: "synthetic-admin",
      expiresAt: "2098-12-30T12:00:00.000Z",
      now: "2098-12-30T00:00:00.000Z",
    });
    expect(override.expiresAt).toBe("2098-12-30T12:00:00.000Z");
    const reservedWhileOverridden = await reserveAdmissionBudget({
      env,
      operationId: "d1-expired-override-seed",
      resourceKey: "d1.rows_read",
      plannedAmount: 1,
      now: "2098-12-30T01:00:00.000Z",
    });
    await commitAdmissionReservation({
      env,
      reservation: reservedWhileOverridden,
      succeeded: true,
      actualAmount: 70,
      now: "2098-12-30T02:00:00.000Z",
    });
    await expect(reserveAdmissionBudget({
      env,
      operationId: "d1-expired-override",
      resourceKey: "d1.rows_read",
      plannedAmount: 1,
      now: "2098-12-31T00:00:00.000Z",
    })).rejects.toMatchObject({ code: "COST_GUARDRAIL_DEGRADED" });
    const status = await env.LIFE_DB.prepare("SELECT status FROM cost_guardrail_overrides WHERE id = ?").bind(override.id).first<{ status: string }>();
    const event = await env.LIFE_DB.prepare(
      "SELECT reason_code, to_state FROM cost_guardrail_breaker_events WHERE resource_key = 'd1.rows_read' AND period_key = ? ORDER BY occurred_at DESC LIMIT 1",
    ).bind(periodKey).first<{ reason_code: string; to_state: string }>();
    expect(status?.status).toBe("EXPIRED");
    expect(event).toEqual({ reason_code: "COST_GUARDRAIL_OVERRIDE_EXPIRED", to_state: "DEGRADED" });
  });

  it("revokes an active override without changing account billing", async () => {
    const periodKey = "UTC_DAY:TEST-D1-REVOKE";
    await observeExact("d1.rows_read", 100, periodKey);
    const override = await createCostOverride({
      env,
      resourceKey: "d1.rows_read",
      periodKey,
      approvedInternalLimit: 90,
      reason: "synthetic revoke review reason",
      actorId: "synthetic-admin",
      expiresAt: "2098-12-31T12:00:00.000Z",
      now: "2098-12-31T00:00:00.000Z",
    });
    await revokeCostOverride({ env, overrideId: override.id, actorId: "synthetic-admin", now: "2098-12-31T01:00:00.000Z" });
    const status = await env.LIFE_DB.prepare("SELECT status, revoked_at FROM cost_guardrail_overrides WHERE id = ?").bind(override.id).first<{ status: string; revoked_at: string }>();
    expect(status?.status).toBe("REVOKED");
    expect(status?.revoked_at).toBe("2098-12-31T01:00:00.000Z");
  });
});
