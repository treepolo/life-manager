import { decryptSecret } from "@/core/crypto/secrets";
import { newId, nowIso } from "@/core/database/d1";
import { localDateAt } from "@/core/time/taipei";
import { sendDeadlineEmail } from "@/integrations/resend/client";
import { recordNotificationDeliveryOutcome } from "@/modules/notifications/persistence";
import { planDeadlineDeliveries } from "@/modules/notifications/scheduler";
import { sendDeadlinePush } from "@/modules/notifications/push";
import { recoverStaleProviderSyncs, syncProviderConnection } from "@/worker/api/provider-sync";
import type { Env } from "@/worker/env";

interface PreferenceRow {
  timezone: string;
  local_send_time: string;
  repeat_interval_hours: number;
  confirmed_at: string | null;
  email_recipient_encrypted: string | null;
}

interface DeadlineRow {
  id: string;
  name: string;
  importance: "SUPER_CRITICAL" | "CRITICAL";
  actionable_from_local_date: string;
  status: "OPEN" | "COMPLETED" | "ARCHIVED";
}

interface SubscriptionRow {
  id: string;
  device_id: string;
  endpoint_encrypted: string;
  p256dh_encrypted: string;
  auth_encrypted: string;
}

const latestActivePushSubscriptionsQuery = `
  WITH ranked AS (
    SELECT id, device_id, endpoint_encrypted, p256dh_encrypted, auth_encrypted,
           status, disabled_at, updated_at, created_at,
           ROW_NUMBER() OVER (
             PARTITION BY device_id
             ORDER BY updated_at DESC, created_at DESC, id DESC
           ) AS row_number
    FROM push_subscriptions
  )
  SELECT id, device_id, endpoint_encrypted, p256dh_encrypted, auth_encrypted
  FROM ranked
  WHERE row_number = 1 AND status = 'ACTIVE' AND disabled_at IS NULL
  ORDER BY device_id, updated_at DESC, created_at DESC, id DESC
`;

async function createDelivery(env: Env, input: {
  deadlineId: string;
  channel: "IN_APP" | "WEB_PUSH" | "EMAIL";
  targetRef: string | null;
  period: string;
  dedupeKey: string;
  now: string;
}): Promise<{ id: string; inserted: boolean }> {
  const id = newId();
  const result = await env.LIFE_DB.prepare(
    `INSERT OR IGNORE INTO notification_deliveries
     (id, deadline_item_id, channel_kind, target_ref, notification_period, dedupe_key, status,
      attempt, scheduled_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'PENDING', 0, ?, ?, ?)`,
  ).bind(id, input.deadlineId, input.channel, input.targetRef, input.period, input.dedupeKey, input.now, input.now, input.now).run();
  return { id, inserted: (result.meta.changes ?? 0) > 0 };
}

async function processDeadlineNotifications(env: Env, requestId: string, now: Date): Promise<{ sent: number; retries: number; deduped: number }> {
  const preference = await env.LIFE_DB.prepare(
    "SELECT timezone, local_send_time, repeat_interval_hours, confirmed_at, email_recipient_encrypted FROM notification_preferences ORDER BY updated_at DESC LIMIT 1",
  ).first<PreferenceRow>();
  if (!preference?.confirmed_at) return { sent: 0, retries: 0, deduped: 0 };
  const today = localDateAt(now, preference.timezone);
  const [deadlines, channels, existing] = await Promise.all([
    env.LIFE_DB.prepare(
      "SELECT id, name, importance, actionable_from_local_date, status FROM deadline_items WHERE deleted_at IS NULL AND archived_at IS NULL AND parent_deadline_id IS NULL AND status = 'OPEN' AND actionable_from_local_date <= ?",
    ).bind(today).all<DeadlineRow>(),
    env.LIFE_DB.prepare("SELECT channel_kind FROM notification_channels WHERE enabled = 1 AND status = 'READY'").all<{ channel_kind: "IN_APP" | "WEB_PUSH" | "EMAIL" }>(),
    env.LIFE_DB.prepare("SELECT dedupe_key FROM notification_deliveries WHERE scheduled_at >= ?").bind(new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000).toISOString()).all<{ dedupe_key: string }>(),
  ]);
  const basePlans = planDeadlineDeliveries({
    deadlines: deadlines.results.map((row) => ({
      id: row.id, name: row.name, importance: row.importance,
      actionableFromLocalDate: row.actionable_from_local_date, status: row.status,
    })),
    preference: { timezone: preference.timezone, localSendTime: preference.local_send_time, repeatIntervalHours: preference.repeat_interval_hours, confirmedAt: preference.confirmed_at },
    enabledChannels: channels.results.map((row) => row.channel_kind),
    existingDedupeKeys: new Set(existing.results.map((row) => row.dedupe_key)),
    now,
  });
  const subscriptionRows = await env.LIFE_DB.prepare(latestActivePushSubscriptionsQuery).all<SubscriptionRow>();
  let sent = 0;
  let retries = 0;
  let deduped = 0;
  const applicationUrl = env.OAUTH_CALLBACK_BASE_URL ?? "";
  for (const plan of basePlans) {
    const deadline = deadlines.results.find((entry) => entry.id === plan.deadlineId)!;
    const targets = plan.channel === "WEB_PUSH" ? subscriptionRows.results : [null];
    for (const target of targets) {
      const dedupeKey = target ? `${plan.dedupeKey}:${target.id}` : plan.dedupeKey;
      const delivery = await createDelivery(env, {
        deadlineId: plan.deadlineId, channel: plan.channel, targetRef: target?.id ?? null,
        period: plan.notificationPeriod, dedupeKey, now: now.toISOString(),
      });
      if (!delivery.inserted) { deduped++; continue; }
      try {
        if (plan.channel === "IN_APP") {
          await recordNotificationDeliveryOutcome({ db: env.LIFE_DB, deliveryId: delivery.id, channel: plan.channel, subscriptionId: null,
            status: "SENT", providerMessageId: null, error: null, now: now.toISOString() });
        } else if (plan.channel === "EMAIL") {
          const recipient = preference.email_recipient_encrypted
            ? await decryptSecret(preference.email_recipient_encrypted, env.TOKEN_ENCRYPTION_KEY)
            : env.RESEND_TO;
          const result = await sendDeadlineEmail({
            apiKey: env.RESEND_API_KEY, from: env.RESEND_FROM, to: recipient,
            deadlineName: deadline.name,
            importanceLabel: deadline.importance === "SUPER_CRITICAL" ? "超級無敵重要" : "超級重要",
            applicationUrl: `${applicationUrl.replace(/\/$/, "")}/deadlines`, idempotencyKey: dedupeKey,
          });
          await recordNotificationDeliveryOutcome({ db: env.LIFE_DB, deliveryId: delivery.id, channel: plan.channel, subscriptionId: null,
            status: "SENT", providerMessageId: result.providerMessageId, error: null, now: now.toISOString() });
        } else if (target) {
          const providerResult = await sendDeadlinePush({
            subscription: {
              endpoint: await decryptSecret(target.endpoint_encrypted, env.TOKEN_ENCRYPTION_KEY),
              expirationTime: null,
              keys: {
                p256dh: await decryptSecret(target.p256dh_encrypted, env.TOKEN_ENCRYPTION_KEY),
                auth: await decryptSecret(target.auth_encrypted, env.TOKEN_ENCRYPTION_KEY),
              },
            },
            publicKey: env.WEB_PUSH_VAPID_PUBLIC_KEY,
            privateKey: env.WEB_PUSH_VAPID_PRIVATE_KEY,
            subject: env.WEB_PUSH_VAPID_SUBJECT,
            deadlineName: deadline.name,
            importance: deadline.importance,
            url: `${applicationUrl.replace(/\/$/, "")}/deadlines`,
          });
          await recordNotificationDeliveryOutcome({ db: env.LIFE_DB, deliveryId: delivery.id, channel: plan.channel, subscriptionId: target.id,
            status: "SENT", providerMessageId: providerResult.providerMessageId, error: null, now: now.toISOString() });
        }
        sent++;
      } catch (error) {
        await recordNotificationDeliveryOutcome({ db: env.LIFE_DB, deliveryId: delivery.id, channel: plan.channel,
          subscriptionId: target?.id ?? null, status: "RETRY", providerMessageId: null, error, now: now.toISOString() });
        retries++;
      }
    }
  }
  void requestId;
  return { sent, retries, deduped };
}

export async function sendDeadlineNotificationTest(input: {
  env: Env;
  deadlineId: string;
  channel: "IN_APP" | "WEB_PUSH" | "EMAIL";
  operationId: string;
}): Promise<{ sent: number; failed: number }> {
  const deadline = await input.env.LIFE_DB.prepare(
    "SELECT id, name, importance FROM deadline_items WHERE id = ? AND deleted_at IS NULL",
  ).bind(input.deadlineId).first<{ id: string; name: string; importance: "SUPER_CRITICAL" | "CRITICAL" }>();
  if (!deadline) throw new Error("DEADLINE_NOT_FOUND");
  const now = nowIso();
  const applicationUrl = `${(input.env.OAUTH_CALLBACK_BASE_URL ?? "").replace(/\/$/, "")}/deadlines`;
  const targets = input.channel === "WEB_PUSH"
    ? (await input.env.LIFE_DB.prepare(latestActivePushSubscriptionsQuery).all<SubscriptionRow>()).results
    : [null];
  if (!targets.length) throw new Error("PUSH_SUBSCRIPTION_MISSING");
  const preference = input.channel === "EMAIL" ? await input.env.LIFE_DB.prepare(
    "SELECT email_recipient_encrypted FROM notification_preferences ORDER BY updated_at DESC LIMIT 1",
  ).first<{ email_recipient_encrypted: string | null }>() : null;
  let sent = 0;
  let failed = 0;
  for (const target of targets) {
    const dedupeKey = `test:${input.operationId}:${input.channel}:${target?.id ?? "default"}`;
    const delivery = await createDelivery(input.env, { deadlineId: deadline.id, channel: input.channel, targetRef: target?.id ?? null, period: "USER_TEST", dedupeKey, now });
    if (!delivery.inserted) continue;
    try {
      if (input.channel === "EMAIL") {
        const recipient = preference?.email_recipient_encrypted
          ? await decryptSecret(preference.email_recipient_encrypted, input.env.TOKEN_ENCRYPTION_KEY)
          : input.env.RESEND_TO;
        const result = await sendDeadlineEmail({ apiKey: input.env.RESEND_API_KEY, from: input.env.RESEND_FROM, to: recipient,
          deadlineName: deadline.name, importanceLabel: deadline.importance === "SUPER_CRITICAL" ? "超級無敵重要" : "超級重要",
          applicationUrl, idempotencyKey: dedupeKey });
        await recordNotificationDeliveryOutcome({ db: input.env.LIFE_DB, deliveryId: delivery.id, channel: input.channel, subscriptionId: null,
          status: "SENT", providerMessageId: result.providerMessageId, error: null, now });
      } else if (input.channel === "WEB_PUSH" && target) {
        const providerResult = await sendDeadlinePush({ subscription: { endpoint: await decryptSecret(target.endpoint_encrypted, input.env.TOKEN_ENCRYPTION_KEY), expirationTime: null,
          keys: { p256dh: await decryptSecret(target.p256dh_encrypted, input.env.TOKEN_ENCRYPTION_KEY), auth: await decryptSecret(target.auth_encrypted, input.env.TOKEN_ENCRYPTION_KEY) } },
          publicKey: input.env.WEB_PUSH_VAPID_PUBLIC_KEY, privateKey: input.env.WEB_PUSH_VAPID_PRIVATE_KEY, subject: input.env.WEB_PUSH_VAPID_SUBJECT,
          deadlineName: deadline.name, importance: deadline.importance, url: applicationUrl });
        await recordNotificationDeliveryOutcome({ db: input.env.LIFE_DB, deliveryId: delivery.id, channel: input.channel, subscriptionId: target.id,
          status: "SENT", providerMessageId: providerResult.providerMessageId, error: null, now });
      } else {
        await recordNotificationDeliveryOutcome({ db: input.env.LIFE_DB, deliveryId: delivery.id, channel: input.channel, subscriptionId: null,
          status: "SENT", providerMessageId: null, error: null, now });
      }
      sent++;
    } catch (error) {
      await recordNotificationDeliveryOutcome({ db: input.env.LIFE_DB, deliveryId: delivery.id, channel: input.channel,
        subscriptionId: target?.id ?? null, status: "RETRY", providerMessageId: null, error, now });
      failed++;
    }
  }
  return { sent, failed };
}

async function processProviderJobs(env: Env, requestId: string, now: Date): Promise<{ success: number; retries: number; deadLetter: number }> {
  await recoverStaleProviderSyncs(env, now);
  const jobs = await env.LIFE_DB.prepare(
    `SELECT id, provider_key, connection_id, attempt, max_attempts, backoff_seconds
     FROM provider_sync_jobs WHERE status IN ('READY','RETRY') AND next_run_at <= ? ORDER BY next_run_at LIMIT 5`,
  ).bind(now.toISOString()).all<{
    id: string; provider_key: string; connection_id: string; attempt: number; max_attempts: number; backoff_seconds: number;
  }>();
  let success = 0;
  let retries = 0;
  let deadLetter = 0;
  for (const job of jobs.results) {
    const claimed = await env.LIFE_DB.prepare(
      "UPDATE provider_sync_jobs SET status = 'RUNNING', updated_at = ? WHERE id = ? AND status IN ('READY','RETRY') AND next_run_at <= ?",
    ).bind(nowIso(), job.id, now.toISOString()).run();
    if (Number(claimed.meta.changes ?? 0) !== 1) continue;
    try {
      const to = localDateAt(now, "UTC");
      const fromDate = new Date(now);
      fromDate.setUTCDate(fromDate.getUTCDate() - 90);
      await syncProviderConnection({ env, connectionId: job.connection_id, triggerKind: job.attempt ? "RETRY" : "SCHEDULED", requestId, from: localDateAt(fromDate, "UTC"), to });
      const interval = Number(env.PROVIDER_SYNC_INTERVAL_HOURS ?? "6");
      const next = new Date(now.getTime() + interval * 60 * 60 * 1000).toISOString();
      await env.LIFE_DB.prepare("UPDATE provider_sync_jobs SET status = 'READY', attempt = 0, next_run_at = ?, last_error_code = NULL, updated_at = ? WHERE id = ?")
        .bind(next, nowIso(), job.id).run();
      success++;
    } catch {
      const attempt = job.attempt + 1;
      const terminal = attempt >= job.max_attempts;
      const next = new Date(now.getTime() + job.backoff_seconds * 2 ** Math.max(0, attempt - 1) * 1000).toISOString();
      await env.LIFE_DB.prepare("UPDATE provider_sync_jobs SET status = ?, attempt = ?, next_run_at = ?, last_error_code = 'PROVIDER_ERROR', updated_at = ? WHERE id = ?")
        .bind(terminal ? "DEAD_LETTER" : "RETRY", attempt, next, nowIso(), job.id).run();
      if (terminal) deadLetter++;
      else retries++;
    }
  }
  return { success, retries, deadLetter };
}

function retentionCutoff(now: Date, configuredDays: string | undefined, defaultDays: number): string {
  const parsed = Number(configuredDays ?? defaultDays);
  const days = Number.isFinite(parsed) ? Math.max(1, Math.min(3650, Math.trunc(parsed))) : defaultDays;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

export async function processRetention(env: Pick<Env, "LIFE_DB" | "OPERATION_LOG_RETENTION_DAYS" | "NOTIFICATION_LOG_RETENTION_DAYS" | "OAUTH_STATE_RETENTION_DAYS">, now: Date): Promise<Record<string, number>> {
  const operationCutoff = retentionCutoff(now, env.OPERATION_LOG_RETENTION_DAYS, 365);
  const notificationCutoff = retentionCutoff(now, env.NOTIFICATION_LOG_RETENTION_DAYS, 365);
  const oauthCutoff = retentionCutoff(now, env.OAUTH_STATE_RETENTION_DAYS, 30);
  const results = await env.LIFE_DB.batch([
    env.LIFE_DB.prepare("DELETE FROM audit_log WHERE occurred_at < ?").bind(operationCutoff),
    env.LIFE_DB.prepare("DELETE FROM api_idempotency WHERE created_at < ?").bind(operationCutoff),
    env.LIFE_DB.prepare("DELETE FROM notification_deliveries WHERE updated_at < ? AND status IN ('SENT','FAILED','SUPPRESSED')").bind(notificationCutoff),
    env.LIFE_DB.prepare("DELETE FROM cron_runs WHERE started_at < ?").bind(operationCutoff),
    env.LIFE_DB.prepare("DELETE FROM oauth_states WHERE created_at < ? AND (consumed_at IS NOT NULL OR expires_at < ?)").bind(oauthCutoff, now.toISOString()),
    env.LIFE_DB.prepare(`DELETE FROM sync_change_log
      WHERE changed_at < ?
        AND EXISTS (SELECT 1 FROM sync_cursors c JOIN sync_devices d ON d.id = c.device_id WHERE d.disabled_at IS NULL)
        AND cursor <= (SELECT MIN(c.last_pulled_cursor) FROM sync_cursors c JOIN sync_devices d ON d.id = c.device_id WHERE d.disabled_at IS NULL)`).bind(operationCutoff),
    env.LIFE_DB.prepare(`DELETE FROM sync_operations
      WHERE applied_at < ?
        AND NOT EXISTS (SELECT 1 FROM sync_change_log c WHERE c.operation_id = sync_operations.operation_id)
        AND NOT EXISTS (SELECT 1 FROM conflict_records c WHERE c.operation_id = sync_operations.operation_id)`).bind(operationCutoff),
  ]);
  const names = ["audit", "idempotency", "notification", "cron", "oauth", "syncChanges", "syncOperations"];
  return Object.fromEntries(results.map((result, index) => [names[index], Number(result.meta.changes ?? 0)]));
}

export async function runScheduled(env: Env, scheduledTime: number): Promise<void> {
  const now = new Date(scheduledTime);
  const requestId = crypto.randomUUID();
  const runId = newId();
  const startedAt = nowIso();
  await env.LIFE_DB.prepare("INSERT INTO cron_runs (id, started_at, request_id) VALUES (?, ?, ?)").bind(runId, startedAt, requestId).run();
  const [notifications, providers] = await Promise.all([
    processDeadlineNotifications(env, requestId, now),
    processProviderJobs(env, requestId, now),
  ]);
  await processRetention(env, now);
  await env.LIFE_DB.prepare(
    `UPDATE cron_runs SET completed_at = ?, job_count = ?, provider_request_count = ?, success_count = ?,
     retry_count = ?, dead_letter_count = ?, deduped_notification_count = ? WHERE id = ?`,
  ).bind(nowIso(), notifications.sent + notifications.retries + providers.success + providers.retries + providers.deadLetter,
    providers.success + providers.retries + providers.deadLetter, notifications.sent + providers.success,
    notifications.retries + providers.retries, providers.deadLetter, notifications.deduped, runId).run();
}
