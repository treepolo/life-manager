import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/core/errors/api-error";
import { sendDeadlineEmail } from "@/integrations/resend/client";

const baseInput = {
  apiKey: "test-resend-key",
  from: "onboarding@resend.dev",
  to: "owner@example.test",
  deadlineName: "W-8BEN 更新",
  importanceLabel: "超級無敵重要",
  applicationUrl: "https://life-manager-staging.example/deadlines",
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Resend email adapter", () => {
  it("缺少設定時拒絕寄送且不呼叫外部API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendDeadlineEmail({ ...baseInput, apiKey: undefined, idempotencyKey: "test:missing" })).rejects.toMatchObject({
      status: 503,
      code: "NOTIFICATION_CONFIGURATION_MISSING",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("使用test idempotency key時在主旨與本文明確標示使用者測試", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(init?.method).toBe("POST");
      expect((init?.headers as Record<string, string>)["authorization"]).toBe("Bearer test-resend-key");
      expect((init?.headers as Record<string, string>)["idempotency-key"]).toBe("test:operation:EMAIL:default");
      expect(payload.from).toBe(baseInput.from);
      expect(payload.to).toEqual([baseInput.to]);
      expect(payload.subject).toBe("【使用者測試】【超級無敵重要】W-8BEN 更新");
      expect(String(payload.text)).toContain("這是使用者觸發的測試");
      expect(String(payload.text)).toContain(baseInput.applicationUrl);
      return new Response(JSON.stringify({ id: "provider-message-123" }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendDeadlineEmail({ ...baseInput, idempotencyKey: "test:operation:EMAIL:default" })).resolves.toEqual({
      providerMessageId: "provider-message-123",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("正式期限郵件不被誤標成使用者測試", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(payload.subject).toBe("【超級重要】年度報稅");
      expect(String(payload.text)).not.toContain("這是使用者觸發的測試");
      return new Response(JSON.stringify({ id: "provider-message-regular" }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendDeadlineEmail({ ...baseInput, deadlineName: "年度報稅", importanceLabel: "超級重要", idempotencyKey: "deadline:regular-period" })).resolves.toEqual({
      providerMessageId: "provider-message-regular",
    });
  });

  it("保留去敏provider錯誤代碼，不把API key放入錯誤", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ name: "rate_limit_exceeded", message: "quota reached" }), { status: 429 })));

    const error = await sendDeadlineEmail({ ...baseInput, idempotencyKey: "test:rate-limit" }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 502, code: "PROVIDER_ERROR", details: { providerCode: "rate_limit_exceeded", providerMessage: "quota reached" } });
    expect((error as Error).message).toBe("Resend寄信失敗（rate_limit_exceeded）。");
    expect((error as Error).message).not.toContain(baseInput.apiKey);
  });

  it("非JSON或網路錯誤仍轉成固定去敏provider錯誤", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("upstream unavailable", { status: 503 })));
    await expect(sendDeadlineEmail({ ...baseInput, idempotencyKey: "test:non-json" })).rejects.toMatchObject({
      status: 502,
      code: "PROVIDER_ERROR",
      details: { providerCode: "HTTP_503" },
    });

    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network failure"); }));
    await expect(sendDeadlineEmail({ ...baseInput, idempotencyKey: "test:network" })).rejects.toMatchObject({
      status: 502,
      code: "PROVIDER_ERROR",
      details: { providerCode: "NETWORK_ERROR" },
    });
  });
});
