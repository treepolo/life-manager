import { ApiError } from "@/core/errors/api-error";
import type {
  IntegrationProvider,
  NormalizedProviderBatch,
  ProviderHealth,
  ProviderMetricFetchInput,
  ProviderRawPayload,
} from "@/integrations/providers/contract";

export const INSTAGRAM_SCOPES = ["instagram_business_basic", "instagram_business_manage_insights"] as const;
export const INSTAGRAM_MEDIA_INSIGHTS_PER_RUN = 40;
export const INSTAGRAM_INVALID_TOKEN_CODE = 190;
export const INSTAGRAM_DEFINITION_VERSION = "2026-08-11-budgeted";

export function instagramProviderDefinitionVersion(apiVersion: string): string {
  return `instagram-login-${apiVersion}@${INSTAGRAM_DEFINITION_VERSION}`;
}

export function instagramMetricDefinitionVersion(apiVersion: string): string {
  return `instagram-${apiVersion}@${INSTAGRAM_DEFINITION_VERSION}`;
}

interface InstagramCredentials {
  accessToken: string;
  userId: string;
  expiresAt?: string;
}

export class InstagramProvider implements IntegrationProvider {
  readonly key = "instagram";
  readonly definitionVersion: string;

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly apiVersion: string,
  ) {
    this.definitionVersion = instagramProviderDefinitionVersion(apiVersion);
  }

  authorize(state: string, codeChallenge: string, redirectUri: string): URL {
    if (!this.clientId) throw new ApiError(503, "OAUTH_CONFIGURATION_MISSING", "Meta App client尚未設定。");
    const url = new URL("https://www.instagram.com/oauth/authorize");
    url.searchParams.set("client_id", this.clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", INSTAGRAM_SCOPES.join(","));
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge", codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
    return url;
  }

  async connect(code: string, codeVerifier: string, redirectUri: string): Promise<InstagramCredentials> {
    const body = new FormData();
    body.set("client_id", this.clientId);
    body.set("client_secret", this.clientSecret);
    body.set("grant_type", "authorization_code");
    body.set("redirect_uri", redirectUri);
    body.set("code", code.replace(/#_$/, ""));
    body.set("code_verifier", codeVerifier);
    const response = await fetch("https://api.instagram.com/oauth/access_token", { method: "POST", body });
    const payload = (await response.json()) as Record<string, unknown>;
    if (!response.ok || typeof payload.access_token !== "string") {
      throw new ApiError(502, "PROVIDER_ERROR", "Instagram授權碼交換失敗。", {
        providerCode: typeof payload.error_type === "string" ? payload.error_type : response.status,
      });
    }
    return {
      accessToken: payload.access_token,
      userId: String(payload.user_id),
    };
  }

  private async api(path: string, accessToken: string, kind: string): Promise<ProviderRawPayload> {
    const url = new URL(`https://graph.instagram.com/${this.apiVersion}/${path}`);
    url.searchParams.set("access_token", accessToken);
    const response = await fetch(url);
    const payload = await response.json();
    if (!response.ok) {
      const error = payload as { error?: { code?: number; type?: string } };
      const providerCode = error.error?.type ?? error.error?.code ?? response.status;
      if (error.error?.code === INSTAGRAM_INVALID_TOKEN_CODE) {
        throw new ApiError(401, "PROVIDER_ERROR", "Instagram access token requires reauthorization.", { providerCode });
      }
      throw new ApiError(response.status === 401 ? 401 : 502, "PROVIDER_ERROR", `Instagram ${kind}同步失敗。`, {
        providerCode: error.error?.type ?? error.error?.code ?? response.status,
      });
    }
    return { kind, externalId: null, observedAt: new Date().toISOString(), apiVersion: this.apiVersion, payload };
  }

  async fetchAccounts(connection: InstagramCredentials): Promise<ProviderRawPayload[]> {
    return [
      await this.api(
        "me?fields=user_id,username,name,account_type,profile_picture_url,followers_count,media_count",
        connection.accessToken,
        "profile",
      ),
    ];
  }

  async fetchContent(connection: InstagramCredentials): Promise<ProviderRawPayload[]> {
    return [
      await this.api(
        `${encodeURIComponent(connection.userId)}/media?fields=id,caption,media_type,media_product_type,permalink,timestamp,username&limit=50`,
        connection.accessToken,
        "media",
      ),
    ];
  }

  async fetchMetrics(connection: InstagramCredentials, input: ProviderMetricFetchInput): Promise<ProviderRawPayload[]> {
    const path = `${encodeURIComponent(connection.userId)}/insights?metric=reach,profile_views,views,total_interactions&period=day&since=${encodeURIComponent(input.from)}&until=${encodeURIComponent(input.to)}`;
    const result = [await this.api(path, connection.accessToken, "account_insights")];
    const content = input.content ?? await this.fetchContent(connection);
    const mediaPayload = content[0]?.payload as { data?: Array<{ id?: string }> } | undefined;
    const selectedIds = input.selectedContentExternalIds
      ? new Set(input.selectedContentExternalIds.slice(0, INSTAGRAM_MEDIA_INSIGHTS_PER_RUN))
      : null;
    const selectedMedia = (mediaPayload?.data ?? [])
      .filter((media) => media.id && (!selectedIds || selectedIds.has(media.id)))
      .slice(0, INSTAGRAM_MEDIA_INSIGHTS_PER_RUN);
    for (const media of selectedMedia) {
      if (!media.id) continue;
      result.push(
        await this.api(
          `${encodeURIComponent(media.id)}/insights?metric=views,reach,likes,comments,shares,saved,total_interactions`,
          connection.accessToken,
          "media_insights",
        ),
      );
      result.at(-1)!.externalId = media.id;
    }
    return result;
  }

  async normalize(payloads: ProviderRawPayload[]): Promise<NormalizedProviderBatch> {
    const accounts: unknown[] = [];
    const content: unknown[] = [];
    const metrics: unknown[] = [];
    for (const raw of payloads) {
      const payload = raw.payload as Record<string, unknown>;
      if (raw.kind === "profile") accounts.push(payload);
      if (raw.kind === "media" && Array.isArray(payload.data)) content.push(...payload.data);
      if (raw.kind.endsWith("insights") && Array.isArray(payload.data)) metrics.push(...payload.data);
    }
    return { accounts, content, metrics, rawPayloads: payloads };
  }

  async healthCheck(connection: InstagramCredentials): Promise<ProviderHealth> {
    try {
      await this.fetchAccounts(connection);
      const now = new Date().toISOString();
      return {
        status: "CONNECTED",
        lastAttemptAt: now,
        lastSuccessAt: now,
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

  async disconnect(connection: InstagramCredentials): Promise<void> {
    const response = await fetch(`https://graph.instagram.com/${this.apiVersion}/me/permissions`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${connection.accessToken}` },
    });
    if (!response.ok) {
      throw new ApiError(502, "PROVIDER_ERROR", "Instagram授權撤銷失敗。", { providerCode: response.status });
    }
  }
}
