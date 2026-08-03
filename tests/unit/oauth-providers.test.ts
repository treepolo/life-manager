import { describe, expect, it } from "vitest";

import { InstagramProvider, INSTAGRAM_SCOPES } from "@/integrations/instagram/provider";
import { YouTubeProvider, YOUTUBE_SCOPES } from "@/integrations/youtube/provider";

describe("OAuth provider最小權限與PKCE", () => {
  it("YouTube只要求資料與Analytics唯讀權限並帶state及S256", () => {
    const url = new YouTubeProvider("client-id", "client-secret").authorize("state-value", "challenge-value", "https://app.example/oauth/youtube/callback");
    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.searchParams.get("scope")?.split(" ").sort()).toEqual([...YOUTUBE_SCOPES].sort());
    expect(url.searchParams.get("scope")).not.toMatch(/monetary|revenue|partner/);
    expect(url.searchParams.get("state")).toBe("state-value");
    expect(url.searchParams.get("code_challenge")).toBe("challenge-value");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  });

  it("Instagram只要求專業帳號基本資料與insights唯讀範圍", () => {
    const url = new InstagramProvider("client-id", "client-secret", "v23.0").authorize("state-value", "unused-challenge", "https://app.example/oauth/instagram/callback");
    expect(url.origin).toBe("https://www.instagram.com");
    expect(url.searchParams.get("scope")?.split(",").sort()).toEqual([...INSTAGRAM_SCOPES].sort());
    expect(url.searchParams.get("state")).toBe("state-value");
    expect(url.searchParams.get("redirect_uri")).toBe("https://app.example/oauth/instagram/callback");
  });
});
