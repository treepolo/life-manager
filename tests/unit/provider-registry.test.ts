import { describe, expect, it } from "vitest";

import { ProviderRegistry, type IntegrationProvider } from "@/integrations/providers/contract";

describe("provider adapter邊界", () => {
  it("future provider可註冊而不修改分析公式", async () => {
    const provider: IntegrationProvider = {
      key: "future-official", definitionVersion: "1",
      fetchAccounts: async () => [], fetchContent: async () => [], fetchMetrics: async () => [],
      normalize: async (payloads) => ({ accounts: [], content: [], metrics: [], rawPayloads: payloads }),
      healthCheck: async () => ({ status: "CONNECTED", lastAttemptAt: null, lastSuccessAt: null, lastErrorCode: null, nextScheduledAt: null, definitionVersion: "1" }),
      disconnect: async () => undefined,
    };
    const registry = new ProviderRegistry(); registry.register(provider);
    expect(registry.keys()).toEqual(["future-official"]);
    expect((await registry.get("future-official").normalize([])).metrics).toEqual([]);
  });
});
