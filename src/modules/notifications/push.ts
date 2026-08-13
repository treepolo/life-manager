import { buildPushPayload, type PushSubscription } from "@block65/webcrypto-web-push";

import { ApiError } from "@/core/errors/api-error";

export async function sendDeadlinePush(input: {
  subscription: PushSubscription;
  publicKey: string | undefined;
  privateKey: string | undefined;
  subject: string | undefined;
  deadlineName: string;
  importance: "SUPER_CRITICAL" | "CRITICAL";
  url: string;
}): Promise<{ providerAccepted: true; providerMessageId: string | null }> {
  if (!input.publicKey || !input.privateKey || !input.subject) {
    throw new ApiError(503, "NOTIFICATION_CONFIGURATION_MISSING", "Web Push VAPID設定尚未完成。");
  }
  const payload = await buildPushPayload(
    {
      data: JSON.stringify({
        title: input.importance === "SUPER_CRITICAL" ? "超級無敵重要期限" : "超級重要期限",
        body: input.deadlineName,
        url: input.url,
      }),
      options: { ttl: 60 * 60 },
    },
    input.subscription,
    { publicKey: input.publicKey, privateKey: input.privateKey, subject: input.subject },
  );
  const body = payload.body.buffer.slice(payload.body.byteOffset, payload.body.byteOffset + payload.body.byteLength) as ArrayBuffer;
  const response = await fetch(input.subscription.endpoint, { ...payload, body });
  if (!response.ok) {
    throw new ApiError(response.status === 404 || response.status === 410 ? 410 : 502, "PROVIDER_ERROR", "Web Push傳送失敗。", {
      providerCode: response.status,
    });
  }
  // Web Push 2xx means the push service accepted the encrypted message for
  // transport. It does not prove that a browser displayed or a person saw it.
  return { providerAccepted: true, providerMessageId: null };
}
