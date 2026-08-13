import { ApiError } from "@/core/errors/api-error";
import type {
  IntegrationProvider,
  NormalizedProviderBatch,
  ProviderHealth,
  ProviderMetricFetchInput,
  ProviderRequestGuard,
  ProviderRawPayload,
} from "@/integrations/providers/contract";

export const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
] as const;

const YOUTUBE_PAGE_SIZE = 50;

interface OAuthCredentials {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  channelId?: string;
}

export class YouTubeProvider implements IntegrationProvider {
  readonly key = "youtube";
  readonly definitionVersion = "youtube-data-v3+analytics-v2@2026-08-09";

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
  ) {}

  authorize(state: string, codeChallenge: string, redirectUri: string): URL {
    if (!this.clientId) throw new ApiError(503, "OAUTH_CONFIGURATION_MISSING", "Google OAuth client尚未設定。");
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", this.clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", YOUTUBE_SCOPES.join(" "));
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("include_granted_scopes", "true");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge", codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
    return url;
  }

  async connect(code: string, codeVerifier: string, redirectUri: string): Promise<OAuthCredentials> {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
        code_verifier: codeVerifier,
      }),
    });
    const body = (await response.json()) as Record<string, unknown>;
    if (!response.ok || typeof body.access_token !== "string") {
      throw new ApiError(502, "PROVIDER_ERROR", "YouTube授權碼交換失敗。", {
        providerCode: typeof body.error === "string" ? body.error : "TOKEN_EXCHANGE_FAILED",
      });
    }
    const granted = typeof body.scope === "string" ? body.scope.split(" ") : [];
    const missing = YOUTUBE_SCOPES.filter((scope) => !granted.includes(scope));
    if (missing.length) {
      throw new ApiError(422, "PROVIDER_ERROR", "YouTube未授予所有必要唯讀權限。", { missingScopes: missing });
    }
    return {
      accessToken: body.access_token,
      refreshToken: typeof body.refresh_token === "string" ? body.refresh_token : undefined,
      expiresAt:
        typeof body.expires_in === "number" ? new Date(Date.now() + body.expires_in * 1000).toISOString() : undefined,
    };
  }

  async refreshCredentials(connection: OAuthCredentials): Promise<OAuthCredentials> {
    if (!connection.refreshToken) throw new ApiError(401, "PROVIDER_ERROR", "YouTube連線沒有可用的refresh token。");
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: connection.refreshToken,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: "refresh_token",
      }),
    });
    const body = (await response.json()) as Record<string, unknown>;
    if (!response.ok || typeof body.access_token !== "string") {
      throw new ApiError(401, "PROVIDER_ERROR", "YouTube token已失效，需要重新連接。", {
        providerCode: typeof body.error === "string" ? body.error : "REFRESH_FAILED",
      });
    }
    return {
      ...connection,
      accessToken: body.access_token,
      expiresAt:
        typeof body.expires_in === "number" ? new Date(Date.now() + body.expires_in * 1000).toISOString() : undefined,
    };
  }

  private async api(url: URL | string, accessToken: string, kind: string, requestGuard?: ProviderRequestGuard): Promise<ProviderRawPayload> {
    const resourceKey = kind === "analytics" ? "youtube.analytics_api_requests" : "youtube.data_api_units";
    const reservation = requestGuard
      ? await requestGuard.beforeRequest({ resourceKey, plannedAmount: 1, operationKind: `youtube.${kind}` })
      : null;
    let settled = false;
    try {
      const response = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } });
      const payload = await response.json();
      if (reservation) {
        settled = true;
        await requestGuard!.afterRequest(reservation, response.ok);
      }
    if (!response.ok) {
      const error = payload as { error?: { code?: number; status?: string } };
      throw new ApiError(response.status === 401 ? 401 : 502, "PROVIDER_ERROR", `YouTube ${kind}同步失敗。`, {
        providerCode: error.error?.status ?? error.error?.code ?? response.status,
      });
    }
      return {
        kind,
        externalId: null,
        observedAt: new Date().toISOString(),
        apiVersion: this.definitionVersion,
        payload,
      };
    } catch (error) {
      if (reservation && !settled) {
        try { await requestGuard!.afterRequest(reservation, false); } catch { /* preserve provider error */ }
      }
      throw error;
    }
  }

  private async pagedApi(url: URL, accessToken: string, kind: string, requestGuard?: ProviderRequestGuard): Promise<ProviderRawPayload[]> {
    const pages: ProviderRawPayload[] = [];
    const seenPageTokens = new Set<string>();
    let pageToken: string | null = null;
    do {
      const pageUrl = new URL(url);
      if (pageToken) pageUrl.searchParams.set("pageToken", pageToken);
      const page = await this.api(pageUrl, accessToken, kind, requestGuard);
      pages.push(page);
      const nextPageToken = (page.payload as { nextPageToken?: unknown }).nextPageToken;
      if (typeof nextPageToken !== "string" || !nextPageToken) break;
      if (seenPageTokens.has(nextPageToken)) {
        throw new ApiError(502, "PROVIDER_ERROR", `YouTube ${kind}分頁token重複。`);
      }
      seenPageTokens.add(nextPageToken);
      pageToken = nextPageToken;
    } while (pageToken);
    return pages;
  }

  async fetchAccounts(connection: OAuthCredentials, requestGuard?: ProviderRequestGuard): Promise<ProviderRawPayload[]> {
    const url = new URL("https://www.googleapis.com/youtube/v3/channels");
    url.searchParams.set("part", "id,snippet,contentDetails,statistics");
    url.searchParams.set("mine", "true");
    return [await this.api(url, connection.accessToken, "channels", requestGuard)];
  }

  async fetchContent(connection: OAuthCredentials, requestGuard?: ProviderRequestGuard): Promise<ProviderRawPayload[]> {
    const channels = await this.fetchAccounts(connection, requestGuard);
    const channelBody = channels[0].payload as { items?: Array<{ contentDetails?: { relatedPlaylists?: { uploads?: string } } }> };
    const uploads = channelBody.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    if (!uploads) throw new ApiError(422, "PROVIDER_ERROR", "YouTube頻道沒有可讀取的上傳播放清單。");
    const url = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
    url.searchParams.set("part", "id,snippet,contentDetails");
    url.searchParams.set("playlistId", uploads);
    url.searchParams.set("maxResults", String(YOUTUBE_PAGE_SIZE));
    const playlistPages = await this.pagedApi(url, connection.accessToken, "playlist_items", requestGuard);
    const videoIds = [...new Set(playlistPages.flatMap((page) => {
      const body = page.payload as { items?: Array<{ contentDetails?: { videoId?: string } }> };
      return (body.items ?? []).map((item) => item.contentDetails?.videoId).filter((id): id is string => Boolean(id));
    }))];
    if (!videoIds.length) return playlistPages;
    const videoPages: ProviderRawPayload[] = [];
    for (let index = 0; index < videoIds.length; index += YOUTUBE_PAGE_SIZE) {
      const detailsUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
      detailsUrl.searchParams.set("part", "id,snippet,statistics,contentDetails");
      detailsUrl.searchParams.set("id", videoIds.slice(index, index + YOUTUBE_PAGE_SIZE).join(","));
      videoPages.push(await this.api(detailsUrl, connection.accessToken, "videos", requestGuard));
    }
    return [...playlistPages, ...videoPages];
  }

  async fetchMetrics(connection: OAuthCredentials, input: ProviderMetricFetchInput): Promise<ProviderRawPayload[]> {
    const url = new URL("https://youtubeanalytics.googleapis.com/v2/reports");
    url.searchParams.set("ids", "channel==MINE");
    url.searchParams.set("startDate", input.from);
    url.searchParams.set("endDate", input.to);
    url.searchParams.set("dimensions", "day");
    url.searchParams.set("metrics", "views,likes,comments");
    url.searchParams.set("sort", "day");
    return [await this.api(url, connection.accessToken, "analytics", input.requestGuard)];
  }

  async normalize(payloads: ProviderRawPayload[]): Promise<NormalizedProviderBatch> {
    const accounts: unknown[] = [];
    const content: unknown[] = [];
    const metrics: unknown[] = [];
    for (const raw of payloads) {
      const payload = raw.payload as Record<string, unknown>;
      if (raw.kind === "channels" && Array.isArray(payload.items)) accounts.push(...payload.items);
      if (raw.kind === "videos" && Array.isArray(payload.items)) content.push(...payload.items);
      if (raw.kind === "analytics" && Array.isArray(payload.rows)) {
        const headers = Array.isArray(payload.columnHeaders) ? payload.columnHeaders : [];
        metrics.push({ headers, rows: payload.rows, observedAt: raw.observedAt });
      }
    }
    return { accounts, content, metrics, rawPayloads: payloads };
  }

  async healthCheck(connection: OAuthCredentials): Promise<ProviderHealth> {
    try {
      await this.fetchAccounts(connection);
      return {
        status: "CONNECTED",
        lastAttemptAt: new Date().toISOString(),
        lastSuccessAt: new Date().toISOString(),
        lastErrorCode: null,
        nextScheduledAt: null,
        definitionVersion: this.definitionVersion,
      };
    } catch (error) {
      return {
        status: error instanceof ApiError && error.status === 401 ? "NEEDS_REAUTH" : "ERROR",
        lastAttemptAt: new Date().toISOString(),
        lastSuccessAt: null,
        lastErrorCode: error instanceof ApiError ? error.code : "UNKNOWN",
        nextScheduledAt: null,
        definitionVersion: this.definitionVersion,
      };
    }
  }

  async disconnect(connection: OAuthCredentials): Promise<void> {
    const token = connection.refreshToken ?? connection.accessToken;
    const response = await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
    });
    if (!response.ok && response.status !== 400) {
      throw new ApiError(502, "PROVIDER_ERROR", "YouTube授權撤銷失敗。", { providerCode: response.status });
    }
  }
}
