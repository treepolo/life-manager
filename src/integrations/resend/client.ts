import { ApiError } from "@/core/errors/api-error";

export interface ResendResult {
  providerMessageId: string;
}

export async function sendDeadlineEmail(input: {
  apiKey: string | undefined;
  from: string | undefined;
  to: string | undefined;
  deadlineName: string;
  importanceLabel: string;
  applicationUrl: string;
  idempotencyKey: string;
}): Promise<ResendResult> {
  if (!input.apiKey || !input.from || !input.to) {
    throw new ApiError(503, "NOTIFICATION_CONFIGURATION_MISSING", "Resend寄件設定尚未完成。");
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${input.apiKey}`,
      "content-type": "application/json",
      "idempotency-key": input.idempotencyKey,
      "user-agent": "life-manager-worker/1.0",
    },
    body: JSON.stringify({
      from: input.from,
      to: [input.to],
      subject: `【${input.importanceLabel}】${input.deadlineName}`,
      text: `${input.deadlineName}已進入處理期間，會持續提醒直到你明確標記完成。\n\n開啟人生管理器：${input.applicationUrl}`,
    }),
  });
  const body = (await response.json()) as { id?: string; message?: string; name?: string };
  if (!response.ok || !body.id) {
    throw new ApiError(502, "PROVIDER_ERROR", "Resend寄信失敗。", {
      providerCode: body.name ?? response.status,
      providerMessage: body.message?.slice(0, 240),
    });
  }
  return { providerMessageId: body.id };
}
