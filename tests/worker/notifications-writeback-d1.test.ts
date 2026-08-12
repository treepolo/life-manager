import { env } from "cloudflare:workers";
import { applyD1Migrations, SELF } from "cloudflare:test";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { v7 as uuidv7 } from "uuid";

import { encryptSecret } from "@/core/crypto/secrets";
import { ApiError } from "@/core/errors/api-error";
import { sendDeadlinePush } from "@/modules/notifications/push";
import type { Env } from "@/worker/env";
import { sendDeadlineNotificationTest } from "@/worker/scheduled";

vi.mock("@/modules/notifications/push", () => ({ sendDeadlinePush: vi.fn() }));

describe("shared notification writeback D1/API contract", () => {
  beforeAll(async () => {
    await applyD1Migrations(env.LIFE_DB, env.TEST_MIGRATIONS);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("每台Push裝置分別保存成功與失效錯誤、同operation只送一次且API可讀回", async () => {
    const deadlineId = uuidv7();
    const deviceA = uuidv7();
    const deviceB = uuidv7();
    const subscriptionA = uuidv7();
    const subscriptionB = uuidv7();
    const now = "2026-08-11T00:00:00.000Z";
    const [endpointA, endpointB, p256dh, auth] = await Promise.all([
      encryptSecret(`https://push.example.test/${deviceA}`, env.TOKEN_ENCRYPTION_KEY),
      encryptSecret(`https://push.example.test/${deviceB}`, env.TOKEN_ENCRYPTION_KEY),
      encryptSecret("p256dh-test-value-with-sufficient-length", env.TOKEN_ENCRYPTION_KEY),
      encryptSecret("auth-test-value", env.TOKEN_ENCRYPTION_KEY),
    ]);
    await env.LIFE_DB.prepare(
      `INSERT INTO deadline_items
       (id, name, actionable_from_local_date, completion_condition, importance, status, source_type, created_at, updated_at)
       VALUES (?, ?, '2026-08-01', '完成Push writeback contract', 'SUPER_CRITICAL', 'OPEN', 'MANUAL', ?, ?)`,
    ).bind(deadlineId, "Push writeback contract", now, now).run();
    await env.LIFE_DB.batch([
      env.LIFE_DB.prepare(
        `INSERT INTO push_subscriptions
         (id, device_id, endpoint_encrypted, p256dh_encrypted, auth_encrypted, content_encoding, user_agent_summary, status, created_at, updated_at, version)
         VALUES (?, ?, ?, ?, ?, 'aes128gcm', ?, 'ACTIVE', ?, ?, 1)`,
      ).bind(subscriptionA, deviceA, endpointA, p256dh, auth, "worker-device-A", now, now),
      env.LIFE_DB.prepare(
        `INSERT INTO push_subscriptions
         (id, device_id, endpoint_encrypted, p256dh_encrypted, auth_encrypted, content_encoding, user_agent_summary, status, created_at, updated_at, version)
         VALUES (?, ?, ?, ?, ?, 'aes128gcm', ?, 'ACTIVE', ?, ?, 1)`,
      ).bind(subscriptionB, deviceB, endpointB, p256dh, auth, "worker-device-B", now, now),
      env.LIFE_DB.prepare(
        `UPDATE notification_channels SET enabled = 1, status = 'READY', last_success_at = NULL,
         last_error_code = NULL, last_error_message_redacted = NULL, updated_at = ?, version = version + 1
         WHERE channel_kind = 'WEB_PUSH'`,
      ).bind(now),
    ]);

    const pushSender = vi.mocked(sendDeadlinePush);
    pushSender.mockImplementation(async (input) => {
      if (input.subscription.endpoint.endsWith(deviceA)) {
        throw new ApiError(410, "PROVIDER_ERROR", "Web Push傳送失敗。", { providerCode: 410 });
      }
    });
    const notificationEnv = { ...env, WEB_PUSH_VAPID_PUBLIC_KEY: "public", WEB_PUSH_VAPID_PRIVATE_KEY: "private", WEB_PUSH_VAPID_SUBJECT: "mailto:test@example.test" } as Env;

    const first = await sendDeadlineNotificationTest({ env: notificationEnv, deadlineId, channel: "WEB_PUSH", operationId: "push-writeback-operation" });
    expect(first).toEqual({ sent: 1, failed: 1 });
    const second = await sendDeadlineNotificationTest({ env: notificationEnv, deadlineId, channel: "WEB_PUSH", operationId: "push-writeback-operation" });
    expect(second).toEqual({ sent: 0, failed: 0 });
    expect(pushSender).toHaveBeenCalledTimes(2);

    const statuses = await env.LIFE_DB.prepare(
      "SELECT device_id, status, last_success_at, last_error_code FROM push_subscriptions WHERE id IN (?, ?) ORDER BY device_id",
    ).bind(subscriptionA, subscriptionB).all<{ device_id: string; status: string; last_success_at: string | null; last_error_code: string | null }>();
    expect(statuses.results).toEqual(expect.arrayContaining([
      { device_id: deviceA, status: "EXPIRED", last_success_at: null, last_error_code: "PUSH_SUBSCRIPTION_EXPIRED" },
      { device_id: deviceB, status: "ACTIVE", last_success_at: expect.any(String), last_error_code: null },
    ]));

    const channel = await env.LIFE_DB.prepare(
      "SELECT status, last_success_at, last_error_code, last_error_message_redacted FROM notification_channels WHERE channel_kind = 'WEB_PUSH'",
    ).first();
    expect(channel).toEqual(expect.objectContaining({
      status: "READY",
      last_success_at: expect.any(String),
      last_error_code: null,
      last_error_message_redacted: null,
    }));

    const apiResponse = await SELF.fetch("https://life-manager.test/api/v1/push-subscriptions");
    expect(apiResponse.status).toBe(200);
    const apiBody = await apiResponse.json() as { data: Array<Record<string, unknown>> };
    expect(apiBody.data).toEqual(expect.arrayContaining([
      expect.objectContaining({ device_id: deviceA, status: "EXPIRED", last_error_code: "PUSH_SUBSCRIPTION_EXPIRED" }),
      expect.objectContaining({ device_id: deviceB, status: "ACTIVE", last_success_at: expect.any(String) }),
    ]));

    await env.LIFE_DB.batch([
      env.LIFE_DB.prepare("DELETE FROM notification_deliveries WHERE deadline_item_id = ?").bind(deadlineId),
      env.LIFE_DB.prepare("DELETE FROM deadline_items WHERE id = ?").bind(deadlineId),
      env.LIFE_DB.prepare("DELETE FROM push_subscriptions WHERE id IN (?, ?)").bind(subscriptionA, subscriptionB),
      env.LIFE_DB.prepare("UPDATE notification_channels SET enabled = 0, status = 'DISABLED', last_success_at = NULL, last_error_code = NULL, last_error_message_redacted = NULL, version = version + 1 WHERE channel_kind = 'WEB_PUSH'"),
    ]);
  });

  it("沒有Push訂閱時不產生假資料且明確回報缺少訂閱", async () => {
    const deadlineId = uuidv7();
    const now = "2026-08-11T00:00:00.000Z";
    await env.LIFE_DB.prepare(
      `INSERT INTO deadline_items
       (id, name, actionable_from_local_date, completion_condition, importance, status, source_type, created_at, updated_at)
       VALUES (?, ?, '2026-08-01', '驗證空Push狀態', 'CRITICAL', 'OPEN', 'MANUAL', ?, ?)`,
    ).bind(deadlineId, "空Push狀態", now, now).run();
    await expect(sendDeadlineNotificationTest({ env: env as Env, deadlineId, channel: "WEB_PUSH", operationId: "empty-push-operation" })).rejects.toThrow("PUSH_SUBSCRIPTION_MISSING");
    const response = await SELF.fetch("https://life-manager.test/api/v1/push-subscriptions");
    const body = await response.json() as { data: unknown[] };
    expect(body.data).toEqual([]);
    await env.LIFE_DB.prepare("DELETE FROM deadline_items WHERE id = ?").bind(deadlineId).run();
  });
});
