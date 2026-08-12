import { env } from "cloudflare:workers";
import { applyD1Migrations, SELF } from "cloudflare:test";
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
    await env.LIFE_DB.prepare(
      "UPDATE notification_channels SET enabled = 1, status = 'READY', last_success_at = NULL, last_error_code = NULL, last_error_message_redacted = NULL WHERE channel_kind = 'EMAIL'",
    ).run();
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
    const successfulChannel = await env.LIFE_DB.prepare(
      "SELECT status, last_success_at, last_error_code, last_error_message_redacted FROM notification_channels WHERE channel_kind = 'EMAIL'",
    ).first();
    expect(successfulChannel).toEqual(expect.objectContaining({
      status: "READY",
      last_success_at: expect.any(String),
      last_error_code: null,
      last_error_message_redacted: null,
    }));
    const channelResponse = await SELF.fetch("https://life-manager.test/api/v1/notifications/channels");
    expect(channelResponse.status).toBe(200);
    const channelBody = await channelResponse.json() as { data: Array<Record<string, unknown>> };
    expect(channelBody.data).toEqual(expect.arrayContaining([
      expect.objectContaining({ channel_kind: "EMAIL", status: "READY", last_success_at: expect.any(String) }),
    ]));

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
    const failedChannel = await env.LIFE_DB.prepare(
      "SELECT status, last_error_code, last_error_message_redacted FROM notification_channels WHERE channel_kind = 'EMAIL'",
    ).first();
    expect(failedChannel).toEqual({
      status: "ERROR",
      last_error_code: "PROVIDER_ERROR",
      last_error_message_redacted: "Resend寄信失敗（rate_limit_exceeded）。",
    });

    const recoveryFetch = vi.fn(async () => new Response(JSON.stringify({ id: "provider-message-d1-recovery" }), { status: 200 }));
    vi.stubGlobal("fetch", recoveryFetch);
    const recovered = await sendDeadlineNotificationTest({ env: emailEnv, deadlineId, channel: "EMAIL", operationId: "recovery-operation" });
    expect(recovered).toEqual({ sent: 1, failed: 0 });
    const recoveredChannel = await env.LIFE_DB.prepare(
      "SELECT status, last_success_at, last_error_code, last_error_message_redacted FROM notification_channels WHERE channel_kind = 'EMAIL'",
    ).first();
    expect(recoveredChannel).toEqual(expect.objectContaining({
      status: "READY",
      last_success_at: expect.any(String),
      last_error_code: null,
      last_error_message_redacted: null,
    }));

    await env.LIFE_DB.batch([
      env.LIFE_DB.prepare("DELETE FROM notification_deliveries WHERE deadline_item_id = ?").bind(deadlineId),
      env.LIFE_DB.prepare("DELETE FROM deadline_items WHERE id = ?").bind(deadlineId),
    ]);
  });
});
