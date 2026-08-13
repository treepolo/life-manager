import { ApiError } from "@/core/errors/api-error";
import type { NotificationChannelKind } from "@/modules/notifications/schema";

type DeliveryStatus = "SENT" | "RETRY";

interface DeliveryFailure {
  channelErrorCode: string;
  channelErrorMessage: string;
  pushStatus: "ERROR" | "EXPIRED";
}

function providerCode(error: ApiError): string | null {
  const value = error.details.providerCode;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string" && value.trim()) return value.trim().slice(0, 80);
  return null;
}

function failureFor(channel: NotificationChannelKind, error: unknown): DeliveryFailure {
  const code = error instanceof ApiError ? providerCode(error) : null;
  if (channel === "WEB_PUSH" && code !== null && ["404", "410"].includes(code)) {
    return {
      channelErrorCode: "PUSH_SUBSCRIPTION_EXPIRED",
      channelErrorMessage: "Web Push 訂閱已失效。",
      pushStatus: "EXPIRED",
    };
  }
  if (error instanceof ApiError) {
    return {
      channelErrorCode: error.code,
      channelErrorMessage: error.message.slice(0, 240),
      pushStatus: "ERROR",
    };
  }
  return {
    channelErrorCode: "DELIVERY_FAILED",
    channelErrorMessage: "通知傳送失敗。",
    pushStatus: "ERROR",
  };
}

const latestPushSubscriptionSummary = `
  WITH latest AS (
    SELECT id, device_id, status, disabled_at, last_success_at, last_error_code,
           updated_at, created_at,
           ROW_NUMBER() OVER (
             PARTITION BY device_id
             ORDER BY updated_at DESC, created_at DESC, id DESC
           ) AS row_number
    FROM push_subscriptions
  ),
  summary AS (
    SELECT
      COALESCE(MAX(CASE WHEN row_number = 1 AND status = 'ACTIVE' AND disabled_at IS NULL THEN 1 ELSE 0 END), 0) AS has_active,
      COALESCE(MAX(CASE WHEN row_number = 1 AND status IN ('ERROR', 'EXPIRED') THEN 1 ELSE 0 END), 0) AS has_failure,
      (
        SELECT last_error_code
        FROM latest
        WHERE row_number = 1 AND status IN ('ERROR', 'EXPIRED')
        ORDER BY updated_at DESC, created_at DESC, id DESC
        LIMIT 1
      ) AS error_code
    FROM latest
  )
  UPDATE notification_channels
  SET status = CASE
        WHEN enabled = 0 THEN status
        WHEN status = 'UNCONFIGURED' THEN status
        WHEN (SELECT has_active FROM summary) = 1 THEN 'READY'
        WHEN (SELECT has_failure FROM summary) = 1 THEN 'ERROR'
        ELSE 'DISABLED'
      END,
      last_success_at = CASE WHEN ? = 'SENT' THEN ? ELSE last_success_at END,
      last_error_code = CASE
        WHEN (SELECT has_failure FROM summary) = 1 THEN (SELECT error_code FROM summary)
        ELSE NULL
      END,
      last_error_message_redacted = CASE
        WHEN (SELECT has_failure FROM summary) = 1
          THEN CASE (SELECT error_code FROM summary)
            WHEN 'PUSH_SUBSCRIPTION_EXPIRED' THEN 'Web Push 訂閱已失效。'
            ELSE 'Web Push provider 回應失敗。'
          END
        ELSE NULL
      END,
      updated_at = ?, version = version + 1
  WHERE channel_kind = 'WEB_PUSH'
`;

export async function recordNotificationDeliveryOutcome(input: {
  db: D1Database;
  deliveryId: string;
  channel: NotificationChannelKind;
  subscriptionId: string | null;
  status: DeliveryStatus;
  providerMessageId: string | null;
  error: unknown;
  now: string;
}): Promise<void> {
  const failed = input.status === "RETRY";
  const failure = failed ? failureFor(input.channel, input.error) : null;
  const deliveryErrorCode = failed
    ? input.channel === "WEB_PUSH" ? failure!.channelErrorCode : "DELIVERY_FAILED"
    : null;
  const deliveryErrorMessage = failed
    ? input.channel === "WEB_PUSH"
      ? failure!.channelErrorMessage
      : input.error instanceof ApiError ? input.error.message.slice(0, 240) : failure!.channelErrorMessage
    : null;
  const statements = [
    input.db.prepare(
      `UPDATE notification_deliveries SET status = ?, provider_message_id = ?, attempt = attempt + 1,
       error_code = ?, error_message_redacted = ?, sent_at = CASE WHEN ? = 'SENT' THEN ? ELSE sent_at END,
       updated_at = ? WHERE id = ?`,
    ).bind(
      input.status,
      input.providerMessageId,
      deliveryErrorCode,
      deliveryErrorMessage,
      input.status,
      input.status === "SENT" ? input.now : null,
      input.now,
      input.deliveryId,
    ),
  ];

  if (input.channel === "WEB_PUSH" && input.subscriptionId) {
    if (failed) {
      statements.push(input.db.prepare(
        `UPDATE push_subscriptions SET status = ?, last_error_code = ?, updated_at = ?, version = version + 1
         WHERE id = ? AND status IN ('ACTIVE', 'ERROR') AND disabled_at IS NULL`,
      ).bind(failure!.pushStatus, failure!.channelErrorCode, input.now, input.subscriptionId));
    } else {
      statements.push(input.db.prepare(
        `UPDATE push_subscriptions SET status = 'ACTIVE', last_success_at = ?, last_error_code = NULL,
         updated_at = ?, version = version + 1 WHERE id = ? AND status = 'ACTIVE' AND disabled_at IS NULL`,
      ).bind(input.now, input.now, input.subscriptionId));
    }
  }

  if (input.channel === "WEB_PUSH") {
    statements.push(input.db.prepare(latestPushSubscriptionSummary).bind(input.status, input.now, input.now));
  } else if (failed) {
    const error = failure!;
    statements.push(input.db.prepare(
      `UPDATE notification_channels SET
       status = CASE WHEN enabled = 0 THEN status ELSE 'ERROR' END,
       last_error_code = ?, last_error_message_redacted = ?, updated_at = ?, version = version + 1
       WHERE channel_kind = ?`,
    ).bind(error.channelErrorCode, error.channelErrorMessage, input.now, input.channel));
  } else {
    statements.push(input.db.prepare(
      `UPDATE notification_channels SET
       status = CASE WHEN enabled = 1 AND status = 'ERROR' THEN 'READY' ELSE status END,
       last_success_at = ?, last_error_code = NULL, last_error_message_redacted = NULL,
       updated_at = ?, version = version + 1 WHERE channel_kind = ?`,
    ).bind(input.now, input.now, input.channel));
  }

  await input.db.batch(statements);
}
