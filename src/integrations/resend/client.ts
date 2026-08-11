import { ApiError } from "@/core/errors/api-error";

export interface ResendResult {
  providerMessageId: string;
}

interface ResendErrorBody {
  id?: string;
  message?: string;
  name?: string;
}

function providerErrorCode(body: ResendErrorBody, status: number): string {
  const code = typeof body.name === "string" ? body.name.trim() : "";
  return code ? code.slice(0, 80) : `HTTP_${status}`;
}

function providerErrorMessage(code: string): string {
  // Keep the error that reaches delivery logs deterministic and secret-free.
  return `Resend寄信失敗（${code}）。`;
}

function isUserTriggeredTest(idempotencyKey: string): boolean {
  return idempotencyKey.startsWith("test:");
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
  const userTest = isUserTriggeredTest(input.idempotencyKey);
  const subjectPrefix = userTest ? "【使用者測試】" : "";
  const testNotice = userTest ? "\n\n這是使用者觸發的測試。" : "";
  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
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
        subject: `${subjectPrefix}【${input.importanceLabel}】${input.deadlineName}`,
        text: `${input.deadlineName}已進入處理期間，會持續提醒直到你明確標記完成。${testNotice}\n\n開啟人生管理器：${input.applicationUrl}`,
      }),
    });
  } catch {
    throw new ApiError(502, "PROVIDER_ERROR", providerErrorMessage("NETWORK_ERROR"), { providerCode: "NETWORK_ERROR" });
  }

  let body: ResendErrorBody;
  try {
    body = (await response.json()) as ResendErrorBody;
  } catch {
    body = {};
  }
  if (!response.ok || !body.id) {
    const code = providerErrorCode(body, response.status);
    throw new ApiError(502, "PROVIDER_ERROR", providerErrorMessage(code), {
      providerCode: code,
      providerMessage: body.message?.slice(0, 240),
    });
  }
  return { providerMessageId: body.id };
}
