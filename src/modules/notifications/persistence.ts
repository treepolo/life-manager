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
      channelErrorMessage: "Web Push訂閱已失效，請重新啟用此裝置。",
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
  const deliveryErrorMessage = failed
    ? input.error instanceof ApiError ? input.error.message.slice(0, 240) : "通知傳送失敗。"
    : null;
  const statements = [
    input.db.prepare(
      `UPDATE notification_deliveries SET status = ?, provider_message_id = ?, attempt = attempt + 1,
       error_code = ?, error_message_redacted = ?, sent_at = CASE WHEN ? = 'SENT' THEN ? ELSE sent_at END,
       updated_at = ? WHERE id = ?`,
    ).bind(
      input.status,
      input.providerMessageId,
      failed ? "DELIVERY_FAILED" : null,
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
         WHERE id = ? AND status IN ('ACTIVE', 'ERROR')`,
      ).bind(failure!.pushStatus, failure!.channelErrorCode, input.now, input.subscriptionId));
    } else {
      statements.push(input.db.prepare(
        `UPDATE push_subscriptions SET status = 'ACTIVE', last_success_at = ?, last_error_code = NULL,
         updated_at = ?, version = version + 1 WHERE id = ?`,
      ).bind(input.now, input.now, input.subscriptionId));
    }
  }

  if (failed) {
    const error = failure!;
    statements.push(input.db.prepare(
      `UPDATE notification_channels SET
       status = CASE
         WHEN enabled = 0 THEN status
         WHEN channel_kind = 'WEB_PUSH' AND EXISTS (SELECT 1 FROM push_subscriptions WHERE status = 'ACTIVE' AND disabled_at IS NULL) THEN 'READY'
         ELSE 'ERROR'
       END,
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
