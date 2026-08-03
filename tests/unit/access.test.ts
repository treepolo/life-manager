import { describe, expect, it } from "vitest";

import { requireAccess } from "@/core/auth/cloudflare-access";
import type { Env } from "@/worker/env";

describe("Cloudflare Access入口保護", () => {
  it("只有local/test允許明確本機身分捷徑", async () => {
    const actor = await requireAccess(new Request("https://app.test", { headers: { "x-local-access-user": "local-test-user" } }), { ENVIRONMENT: "test" } as Env);
    expect(actor.actorId).toBe("local-test-user");
  });

  it("production缺設定、缺token及畸形token都拒絕", async () => {
    await expect(requireAccess(new Request("https://app.test"), { ENVIRONMENT: "production" } as Env)).rejects.toMatchObject({ status: 503, code: "ACCESS_CONFIGURATION_MISSING" });
    const configured = { ENVIRONMENT: "production", ACCESS_TEAM_DOMAIN: "team.cloudflareaccess.com", ACCESS_AUD: "audience" } as Env;
    await expect(requireAccess(new Request("https://app.test"), configured)).rejects.toMatchObject({ status: 401, code: "ACCESS_UNAUTHORIZED" });
    await expect(requireAccess(new Request("https://app.test", { headers: { "Cf-Access-Jwt-Assertion": "invalid" } }), configured)).rejects.toMatchObject({ status: 401, code: "ACCESS_UNAUTHORIZED" });
  });
});
