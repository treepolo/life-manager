import { describe, expect, it } from "vitest";

import {
  admissionAmount,
  d1SyncAdmissionEstimate,
  getCostContract,
  pacificDayPeriod,
  policyFor,
  utcDayPeriod,
} from "@/modules/cost-guardrail/contracts";

describe("cost guardrail contracts", () => {
  it("uses the 80/70 policy for auto-overage or unknown resources", () => {
    expect(policyFor(getCostContract("d1.rows_read"))).toEqual({ maximumFraction: 0.8, degradeFraction: 0.7, hardStopFraction: 0.8 });
  });

  it("uses the 85/75 policy only for provider hard-reject resources", () => {
    expect(policyFor(getCostContract("youtube.data_api_units"))).toEqual({ maximumFraction: 0.85, degradeFraction: 0.75, hardStopFraction: 0.85 });
  });

  it("reserves planned work plus retry, in-flight, scheduler race and reset skew", () => {
    expect(admissionAmount(10, { retry: 10, inFlight: 1, schedulerRace: 1, resetClockSkew: 1 })).toEqual({
      plannedAmount: 10,
      overhead: { retry: 10, inFlight: 1, schedulerRace: 1, resetClockSkew: 1 },
      reservedAmount: 23,
    });
  });

  it("calculates a deterministic local D1 estimate without calling it invoice truth", () => {
    expect(d1SyncAdmissionEstimate({ payloadCount: 2, payloadBytes: 100, derivedMetricCount: 3 })).toEqual({
      rowsRead: 152,
      rowsWritten: 88,
      storageBytes: 4296,
      formulaVersion: "d1-sync-local-conservative@1",
    });
  });

  it("sets the UTC reset window independently of billing metadata", () => {
    expect(utcDayPeriod(new Date("2026-08-14T12:34:56.000Z"))).toEqual({
      periodKey: "UTC_DAY:2026-08-14",
      resetAt: "2026-08-15T00:00:00.000Z",
      resetTimezone: "UTC",
      billingPeriodStart: null,
      billingPeriodEnd: null,
      invoiceCutoff: null,
    });
  });

  it("derives the YouTube Pacific reset without treating it as billing metadata", () => {
    expect(pacificDayPeriod(new Date("2026-08-14T12:34:56.000Z"))).toEqual({
      periodKey: "PACIFIC_DAY:2026-08-14",
      resetAt: "2026-08-15T07:00:00.000Z",
      resetTimezone: "America/Los_Angeles",
      billingPeriodStart: null,
      billingPeriodEnd: null,
      invoiceCutoff: null,
    });
  });

  it("marks only explicitly approved official baselines as locally admissible", () => {
    expect(getCostContract("d1.rows_read").localBaselineAllowed).toBe(true);
    expect(getCostContract("youtube.data_api_units").localBaselineAllowed).toBe(true);
    expect(getCostContract("youtube.analytics_api_requests").localBaselineAllowed).toBe(false);
    expect(getCostContract("instagram.graph_api_window").localBaselineAllowed).toBe(false);
    expect(getCostContract("resend.emails").localBaselineAllowed).toBe(false);
    expect(getCostContract("resend.requests").officialIncludedAmount).toBe(10);
  });
});
