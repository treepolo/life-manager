import { describe, expect, it } from "vitest";

import { integrationConnectionAction } from "@/app/pages/integration-connection-state";

describe("外部連線狀態操作", () => {
  it("非授權錯誤保留立即同步而只有失效授權要求重新授權", () => {
    expect(integrationConnectionAction("CONNECTED")).toBe("SYNC");
    expect(integrationConnectionAction("ERROR")).toBe("SYNC");
    expect(integrationConnectionAction(undefined)).toBe("AUTHORIZE");
    expect(integrationConnectionAction("DISCONNECTED")).toBe("AUTHORIZE");
    expect(integrationConnectionAction("EXPIRED")).toBe("AUTHORIZE");
    expect(integrationConnectionAction("NEEDS_REAUTH")).toBe("AUTHORIZE");
  });
});
