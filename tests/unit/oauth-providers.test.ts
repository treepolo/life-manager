import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/core/errors/api-error";
import { InstagramProvider, INSTAGRAM_INVALID_TOKEN_CODE, INSTAGRAM_MEDIA_INSIGHTS_PER_RUN, INSTAGRAM_SCOPES, instagramMetricDefinitionVersion } from "@/integrations/instagram/provider";
import { YouTubeProvider, YOUTUBE_SCOPES } from "@/integrations/youtube/provider";

describe("OAuth provider最小權限與PKCE", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("YouTube只要求資料與Analytics唯讀權限並帶state及S256", () => {
    const url = new YouTubeProvider("client-id", "client-secret").authorize("state-value", "challenge-value", "https://app.example/oauth/youtube/callback");
    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.searchParams.get("scope")?.split(" ").sort()).toEqual([...YOUTUBE_SCOPES].sort());
    expect(url.searchParams.get("scope")).not.toMatch(/monetary|revenue|partner/);
    expect(url.searchParams.get("state")).toBe("state-value");
    expect(url.searchParams.get("code_challenge")).toBe("challenge-value");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  });

  it("YouTube以既有refresh token換發access token並保留refresh token", async () => {
    let tokenRequestBody = "";
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      tokenRequestBody = String(init?.body);
      return Response.json({ access_token: "new-access-token", expires_in: 3600 });
    }));
    const refreshed = await new YouTubeProvider("client-id", "client-secret").refreshCredentials({
      accessToken: "old-access-token",
      refreshToken: "existing-refresh-token",
      expiresAt: "2026-08-09T00:00:00.000Z",
    });
    const tokenRequest = new URLSearchParams(tokenRequestBody);
    expect(tokenRequest.get("grant_type")).toBe("refresh_token");
    expect(tokenRequest.get("refresh_token")).toBe("existing-refresh-token");
    expect(tokenRequest.get("client_id")).toBe("client-id");
    expect(refreshed.accessToken).toBe("new-access-token");
    expect(refreshed.refreshToken).toBe("existing-refresh-token");
    expect(Date.parse(String(refreshed.expiresAt))).toBeGreaterThan(Date.now());
  });

  it("YouTube撤銷連線優先以refresh token呼叫官方撤銷端點", async () => {
    let revokeUrl = "";
    let revokeMethod = "";
    let revokeBody = "";
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      revokeUrl = String(input);
      revokeMethod = String(init?.method);
      revokeBody = String(init?.body);
      return new Response(null, { status: 200 });
    }));

    await new YouTubeProvider("client-id", "client-secret").disconnect({
      accessToken: "short-lived-access-token",
      refreshToken: "long-lived-refresh-token",
    });

    expect(revokeUrl).toBe("https://oauth2.googleapis.com/revoke");
    expect(revokeMethod).toBe("POST");
    expect(new URLSearchParams(revokeBody).get("token")).toBe("long-lived-refresh-token");
    expect(revokeBody).not.toContain("short-lived-access-token");
  });

  it("Instagram只要求專業帳號基本資料與insights唯讀範圍", () => {
    const provider = new InstagramProvider("client-id", "client-secret", "v23.0");
    const url = provider.authorize("state-value", "unused-challenge", "https://app.example/oauth/instagram/callback");
    expect(url.origin).toBe("https://www.instagram.com");
    expect(url.searchParams.get("scope")?.split(",").sort()).toEqual([...INSTAGRAM_SCOPES].sort());
    expect(url.searchParams.get("state")).toBe("state-value");
    expect(url.searchParams.get("redirect_uri")).toBe("https://app.example/oauth/instagram/callback");
    expect(provider.definitionVersion).toBe("instagram-login-v23.0@2026-08-11-budgeted");
    expect(instagramMetricDefinitionVersion("v23.0")).toBe("instagram-v23.0@2026-08-11-budgeted");
  });

  it("Instagram profile使用/me與user_id新契約", async () => {
    const requests: URL[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      requests.push(new URL(String(input)));
      return Response.json({ user_id: "instagram-user", username: "instagram-account" });
    }));

    const payloads = await new InstagramProvider("client-id", "client-secret", "v23.0").fetchAccounts({
      accessToken: "test-access-token",
      userId: "token-response-user",
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].origin).toBe("https://graph.instagram.com");
    expect(requests[0].pathname).toBe("/v23.0/me");
    expect(requests[0].searchParams.get("fields")?.split(",")).toEqual([
      "user_id", "username", "name", "account_type", "profile_picture_url", "followers_count", "media_count",
    ]);
    expect(requests[0].searchParams.get("access_token")).toBe("test-access-token");
    expect(payloads).toEqual([
      expect.objectContaining({ kind: "profile", payload: { user_id: "instagram-user", username: "instagram-account" } }),
    ]);
  });

  it("Instagram invalid token code 190 requires reauthorization", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: { code: INSTAGRAM_INVALID_TOKEN_CODE, type: "OAuthException" } }, { status: 400 })));

    await expect(new InstagramProvider("client-id", "client-secret", "v23.0").fetchAccounts({
      accessToken: "expired-access-token",
      userId: "instagram-user",
    })).rejects.toMatchObject({ status: 401, code: "PROVIDER_ERROR" });
  });

  it("Instagram完整內容只抓一次並把media insights限制在Worker安全預算", async () => {
    const media = Array.from({ length: 50 }, (_, index) => ({ id: `media-${index + 1}` }));
    const requests: URL[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      requests.push(url);
      return Response.json({ data: [] });
    }));
    const content = [{
      kind: "media",
      externalId: null,
      observedAt: "2026-08-11T00:00:00.000Z",
      apiVersion: "v23.0",
      payload: { data: media },
    }];

    const payloads = await new InstagramProvider("client-id", "client-secret", "v23.0").fetchMetrics(
      { accessToken: "test-access-token", userId: "instagram-user" },
      {
        from: "2026-05-01",
        to: "2026-08-11",
        content,
        selectedContentExternalIds: media.map((item) => item.id),
      },
    );

    expect(requests).toHaveLength(1 + INSTAGRAM_MEDIA_INSIGHTS_PER_RUN);
    expect(requests.filter((url) => url.pathname.endsWith("/media"))).toHaveLength(0);
    expect(requests[0].pathname).toBe("/v23.0/instagram-user/insights");
    expect(requests.slice(1).map((url) => url.pathname)).toEqual(
      Array.from({ length: INSTAGRAM_MEDIA_INSIGHTS_PER_RUN }, (_, index) => `/v23.0/media-${index + 1}/insights`),
    );
    expect(payloads).toHaveLength(1 + INSTAGRAM_MEDIA_INSIGHTS_PER_RUN);
  });

  it("YouTube Analytics使用官方允許的頻道日報表組合", async () => {
    const requests: URL[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      requests.push(new URL(String(input)));
      return new Response(JSON.stringify({
        columnHeaders: [{ name: "day" }, { name: "views" }, { name: "likes" }, { name: "comments" }],
        rows: [["2026-08-01", 10, 2, 1]],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }));
    const payloads = await new YouTubeProvider("client-id", "client-secret").fetchMetrics(
      { accessToken: "test-access-token" },
      { from: "2026-08-01", to: "2026-08-02" },
    );
    expect(payloads).toHaveLength(1);
    expect(payloads[0].kind).toBe("analytics");
    expect(requests[0].searchParams.get("ids")).toBe("channel==MINE");
    expect(requests[0].searchParams.get("dimensions")).toBe("day");
    expect(requests[0].searchParams.get("metrics")).toBe("views,likes,comments");
    expect(requests[0].searchParams.get("sort")).toBe("day");
    expect(requests[0].searchParams.get("dimensions")).not.toContain("video");
  });

  it("YouTube Analytics成本證據未知時只跳過該metric並回報原因", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const skipped: Array<Record<string, string>> = [];
    const payloads = await new YouTubeProvider("client-id", "client-secret").fetchMetrics(
      { accessToken: "test-access-token" },
      {
        from: "2026-08-01",
        to: "2026-08-02",
        requestGuard: {
          beforeRequest: async () => { throw new ApiError(503, "COST_GUARDRAIL_UNKNOWN", "unknown analytics"); },
          afterRequest: async () => undefined,
        },
        onCostGuardrailSkip: (warning) => skipped.push(warning),
      },
    );
    expect(payloads).toEqual([]);
    expect(skipped).toEqual([expect.objectContaining({ resourceKey: "youtube.analytics_api_requests", operationKind: "youtube.analytics" })]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("Instagram成本證據未知時不發起外部request", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const guard = {
      beforeRequest: async () => { throw new ApiError(503, "COST_GUARDRAIL_UNKNOWN", "unknown instagram"); },
      afterRequest: async () => undefined,
    };
    await expect(new InstagramProvider("client-id", "client-secret", "v23.0").fetchAccounts({
      accessToken: "test-access-token", userId: "instagram-user",
    }, guard)).rejects.toMatchObject({ code: "COST_GUARDRAIL_UNKNOWN" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("YouTube上傳播放清單與影片明細完整分頁且每批最多50支", async () => {
    const playlistIds = Array.from({ length: 52 }, (_, index) => `video-${index + 1}`);
    const videoBatchSizes: number[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/channels")) {
        return Response.json({ items: [{ contentDetails: { relatedPlaylists: { uploads: "uploads-list" } } }] });
      }
      if (url.pathname.endsWith("/playlistItems")) {
        const secondPage = url.searchParams.get("pageToken") === "page-2";
        const ids = secondPage ? playlistIds.slice(50) : playlistIds.slice(0, 50);
        return Response.json({
          items: ids.map((id) => ({ contentDetails: { videoId: id } })),
          ...(secondPage ? {} : { nextPageToken: "page-2" }),
        });
      }
      if (url.pathname.endsWith("/videos")) {
        const ids = String(url.searchParams.get("id")).split(",");
        videoBatchSizes.push(ids.length);
        return Response.json({ items: ids.map((id) => ({ id })) });
      }
      throw new Error(`Unexpected YouTube URL: ${url.pathname}`);
    }));
    const payloads = await new YouTubeProvider("client-id", "client-secret").fetchContent({ accessToken: "test-access-token" });
    expect(payloads.filter((payload) => payload.kind === "playlist_items")).toHaveLength(2);
    expect(payloads.filter((payload) => payload.kind === "videos")).toHaveLength(2);
    expect(videoBatchSizes).toEqual([50, 2]);
  });

  it("YouTube分頁token重複時安全失敗而不形成無限請求", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/channels")) {
        return Response.json({ items: [{ contentDetails: { relatedPlaylists: { uploads: "uploads-list" } } }] });
      }
      return Response.json({ items: [], nextPageToken: "repeated-token" });
    }));
    await expect(new YouTubeProvider("client-id", "client-secret").fetchContent({ accessToken: "test-access-token" }))
      .rejects.toThrow("YouTube playlist_items分頁token重複。");
  });
});
