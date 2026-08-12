import { env } from "cloudflare:workers";
import { applyD1Migrations } from "cloudflare:test";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { v7 as uuidv7 } from "uuid";

import type { Env } from "@/worker/env";
import { sendDeadlineNotificationTest } from "@/worker/scheduled";

describe("Resend delivery D1 contract", () => {
  beforeAll(async () => {
    await applyD1Migrations(env.LIFE_DB, env.TEST_MIGRATIONS);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("成功保存provider message ID、同operation去重，429保存RETRY與去敏錯誤", async () => {
    const deadlineId = uuidv7();
    const now = "2026-08-11T00:00:00.000Z";
    await env.LIFE_DB.prepare(
      `INSERT INTO deadline_items
       (id, name, actionable_from_local_date, completion_condition, importance, status, source_type, created_at, updated_at)
       VALUES (?, ?, '2026-08-01', '完成Resend D1 contract', 'SUPER_CRITICAL', 'OPEN', 'MANUAL', ?, ?)`,
    ).bind(deadlineId, "Resend D1 contract", now, now).run();

    const emailEnv = {
      ...env,
      RESEND_API_KEY: "test-resend-key",
      RESEND_FROM: "onboarding@resend.dev",
      RESEND_TO: "owner@example.test",
    } as Env;
    const successFetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(payload.subject).toContain("使用者測試");
      expect(String(payload.text)).toContain("這是使用者觸發的測試");
      expect((init?.headers as Record<string, string>)["idempotency-key"]).toContain("test:success-operation:EMAIL:default");
      return new Response(JSON.stringify({ id: "provider-message-d1-123" }), { status: 200 });
    });
    vi.stubGlobal("fetch", successFetch);

    const first = await sendDeadlineNotificationTest({ env: emailEnv, deadlineId, channel: "EMAIL", operationId: "success-operation" });
    expect(first).toEqual({ sent: 1, failed: 0 });
    const second = await sendDeadlineNotificationTest({ env: emailEnv, deadlineId, channel: "EMAIL", operationId: "success-operation" });
    expect(second).toEqual({ sent: 0, failed: 0 });
    expect(successFetch).toHaveBeenCalledTimes(1);

    const sentRow = await env.LIFE_DB.prepare(
      `SELECT channel_kind, notification_period, status, provider_message_id, attempt, error_code, error_message_redacted
       FROM notification_deliveries WHERE dedupe_key = 'test:success-operation:EMAIL:default'`,
    ).first();
    expect(sentRow).toEqual({
      channel_kind: "EMAIL",
      notification_period: "USER_TEST",
      status: "SENT",
      provider_message_id: "provider-message-d1-123",
      attempt: 1,
      error_code: null,
      error_message_redacted: null,
    });

    const failureFetch = vi.fn(async () => new Response(JSON.stringify({ name: "rate_limit_exceeded", message: "quota reached" }), { status: 429 }));
    vi.stubGlobal("fetch", failureFetch);
    const failed = await sendDeadlineNotificationTest({ env: emailEnv, deadlineId, channel: "EMAIL", operationId: "failure-operation" });
    expect(failed).toEqual({ sent: 0, failed: 1 });
    const retryRow = await env.LIFE_DB.prepare(
      `SELECT status, provider_message_id, attempt, error_code, error_message_redacted
       FROM notification_deliveries WHERE dedupe_key = 'test:failure-operation:EMAIL:default'`,
    ).first<{ status: string; provider_message_id: string | null; attempt: number; error_code: string | null; error_message_redacted: string | null }>();
    expect(retryRow).toEqual({
      status: "RETRY",
      provider_message_id: null,
      attempt: 1,
      error_code: "DELIVERY_FAILED",
      error_message_redacted: "Resend寄信失敗（rate_limit_exceeded）。",
    });
    expect(JSON.stringify(retryRow)).not.toContain("test-resend-key");
    expect(JSON.stringify(retryRow)).not.toContain("owner@example.test");

    await env.LIFE_DB.batch([
      env.LIFE_DB.prepare("DELETE FROM notification_deliveries WHERE deadline_item_id = ?").bind(deadlineId),
      env.LIFE_DB.prepare("DELETE FROM deadline_items WHERE id = ?").bind(deadlineId),
    ]);
  });
});
