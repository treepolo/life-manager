import { decryptSecret, encryptSecret, randomUrlSafe, sha256 } from "@/core/crypto/secrets";
import { newId, nowIso } from "@/core/database/d1";
import { ApiError } from "@/core/errors/api-error";
import { InstagramProvider, INSTAGRAM_SCOPES } from "@/integrations/instagram/provider";
import type { IntegrationProvider, ProviderRawPayload } from "@/integrations/providers/contract";
import { YouTubeProvider, YOUTUBE_SCOPES } from "@/integrations/youtube/provider";
import type { Env } from "@/worker/env";

function providerFor(key: string, env: Env): IntegrationProvider {
  if (key === "youtube") return new YouTubeProvider(env.GOOGLE_CLIENT_ID ?? "", env.GOOGLE_CLIENT_SECRET ?? "");
  if (key === "instagram") return new InstagramProvider(env.META_CLIENT_ID ?? "", env.META_CLIENT_SECRET ?? "", env.INSTAGRAM_API_VERSION);
  throw new ApiError(404, "NOT_FOUND", "不支援此外部平台。");
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

function callbackUri(request: Request, env: Env, providerKey: string): string {
  const base = env.OAUTH_CALLBACK_BASE_URL ?? new URL(request.url).origin;
  return `${base.replace(/\/$/, "")}/oauth/${providerKey}/callback`;
}

export async function startOAuth(input: {
  request: Request;
  env: Env;
  providerKey: string;
  operationId: string;
  requestId: string;
}): Promise<Response> {
  const existing = await input.env.LIFE_DB.prepare(
    "SELECT request_hash, response_json FROM api_idempotency WHERE operation_id = ?",
  ).bind(input.operationId).first<{ request_hash: string; response_json: string }>();
  const requestHash = await sha256(`oauth-start:${input.providerKey}`);
  if (existing) {
    if (existing.request_hash !== requestHash) throw new ApiError(409, "IDEMPOTENCY_CONFLICT", "operationId已用於其他操作。");
    const stored = JSON.parse(existing.response_json) as { encryptedAuthorizeUrl: string };
    const authorizeUrl = await decryptSecret(stored.encryptedAuthorizeUrl, input.env.TOKEN_ENCRYPTION_KEY);
    return Response.json({ data: { authorizeUrl }, meta: { requestId: input.requestId, idempotentReplay: true } });
  }
  const provider = providerFor(input.providerKey, input.env);
  if (!provider.authorize) throw new ApiError(405, "OAUTH_CONFIGURATION_MISSING", "此provider不支援OAuth。");
  const state = randomUrlSafe(32);
  const verifier = randomUrlSafe(64);
  const redirectUri = callbackUri(input.request, input.env, input.providerKey);
  const authorizeUrl = provider.authorize(state, await pkceChallenge(verifier), redirectUri).toString();
  const now = nowIso();
  const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const encryptedVerifier = await encryptSecret(verifier, input.env.TOKEN_ENCRYPTION_KEY);
  const encryptedAuthorizeUrl = await encryptSecret(authorizeUrl, input.env.TOKEN_ENCRYPTION_KEY);
  await input.env.LIFE_DB.batch([
    input.env.LIFE_DB.prepare(
      "INSERT INTO oauth_states (id, provider_key, state_hash, code_verifier_encrypted, redirect_uri, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).bind(newId(), input.providerKey, await sha256(state), encryptedVerifier, redirectUri, expires, now),
    input.env.LIFE_DB.prepare(
      "INSERT INTO api_idempotency (operation_id, request_hash, resource_type, resource_id, response_status, response_json, created_at) VALUES (?, ?, 'oauth-start', ?, 200, ?, ?)",
    ).bind(input.operationId, requestHash, input.providerKey, JSON.stringify({ encryptedAuthorizeUrl }), now),
  ]);
  return Response.json({ data: { authorizeUrl }, meta: { requestId: input.requestId } });
}

function accountIdentity(providerKey: string, credentials: Record<string, unknown>, raw: ProviderRawPayload[]): { id: string; name: string } {
  if (providerKey === "instagram") {
    const profile = raw.find((entry) => entry.kind === "profile")?.payload as { id?: string; username?: string; name?: string } | undefined;
    return {
      id: profile?.id ?? String(credentials.userId),
      name: profile?.username ?? profile?.name ?? String(credentials.userId),
    };
  }
  const channels = raw.find((entry) => entry.kind === "channels")?.payload as { items?: Array<{ id?: string; snippet?: { title?: string } }> } | undefined;
  const channel = channels?.items?.[0];
  if (!channel?.id) throw new ApiError(422, "PROVIDER_ERROR", "授權成功但找不到可讀取的YouTube頻道。");
  return { id: channel.id, name: channel.snippet?.title ?? channel.id };
}

export async function finishOAuth(input: {
  request: Request;
  env: Env;
  providerKey: string;
}): Promise<Response> {
  const url = new URL(input.request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cleanRedirect = new URL(`/integrations?provider=${encodeURIComponent(input.providerKey)}`, url.origin);
  if (!code || !state) {
    cleanRedirect.searchParams.set("error", "OAUTH_RESPONSE_MISSING");
    return Response.redirect(cleanRedirect.toString(), 303);
  }
  const stateRow = await input.env.LIFE_DB.prepare(
    "SELECT * FROM oauth_states WHERE provider_key = ? AND state_hash = ?",
  ).bind(input.providerKey, await sha256(state)).first<{
    id: string; code_verifier_encrypted: string; redirect_uri: string; expires_at: string; consumed_at: string | null;
  }>();
  if (!stateRow || stateRow.consumed_at || stateRow.expires_at <= nowIso()) {
    cleanRedirect.searchParams.set("error", "OAUTH_STATE_INVALID");
    return Response.redirect(cleanRedirect.toString(), 303);
  }
  const expectedRedirect = callbackUri(input.request, input.env, input.providerKey);
  if (stateRow.redirect_uri !== expectedRedirect) throw new ApiError(400, "OAUTH_STATE_INVALID", "OAuth redirect URI與起始請求不一致。");
  const verifier = await decryptSecret(stateRow.code_verifier_encrypted, input.env.TOKEN_ENCRYPTION_KEY);
  const provider = providerFor(input.providerKey, input.env);
  if (!provider.connect) throw new ApiError(405, "OAUTH_CONFIGURATION_MISSING", "此provider不支援OAuth。");
  const credentials = await provider.connect(code, verifier, expectedRedirect) as Record<string, unknown>;
  const rawAccounts = await provider.fetchAccounts(credentials);
  const identity = accountIdentity(input.providerKey, credentials, rawAccounts);
  const accessToken = String(credentials.accessToken ?? "");
  const refreshToken = typeof credentials.refreshToken === "string" ? credentials.refreshToken : null;
  if (!accessToken) throw new ApiError(502, "PROVIDER_ERROR", "provider未回傳access token。");
  const encryptedAccessToken = await encryptSecret(accessToken, input.env.TOKEN_ENCRYPTION_KEY);
  const encryptedRefreshToken = refreshToken ? await encryptSecret(refreshToken, input.env.TOKEN_ENCRYPTION_KEY) : null;
  const existing = await input.env.LIFE_DB.prepare(
    "SELECT id FROM provider_connections WHERE provider_key = ? AND external_account_id = ?",
  ).bind(input.providerKey, identity.id).first<{ id: string }>();
  const connectionId = existing?.id ?? newId();
  const runId = newId();
  const now = nowIso();
  const scopes = input.providerKey === "youtube" ? YOUTUBE_SCOPES : INSTAGRAM_SCOPES;
  const statements: D1PreparedStatement[] = [];
  if (existing) {
    statements.push(input.env.LIFE_DB.prepare(
      `UPDATE provider_connections SET display_name = ?, status = 'CONNECTED', encrypted_access_token = ?,
       encrypted_refresh_token = COALESCE(?, encrypted_refresh_token), token_algorithm = 'AES-GCM-256',
       granted_scopes_json = ?, token_expires_at = ?, last_attempt_at = ?, last_success_at = ?,
       last_error_code = NULL, last_error_message_redacted = NULL, disconnected_at = NULL,
       updated_at = ?, version = version + 1 WHERE id = ?`,
    ).bind(identity.name, encryptedAccessToken, encryptedRefreshToken, JSON.stringify(scopes),
      typeof credentials.expiresAt === "string" ? credentials.expiresAt : null, now, now, now, connectionId));
  } else {
    statements.push(input.env.LIFE_DB.prepare(
      `INSERT INTO provider_connections
       (id, provider_key, external_account_id, display_name, status, encrypted_access_token, encrypted_refresh_token,
        token_algorithm, granted_scopes_json, token_expires_at, last_attempt_at, last_success_at,
        provider_definition_version, created_at, updated_at, version)
       VALUES (?, ?, ?, ?, 'CONNECTED', ?, ?, 'AES-GCM-256', ?, ?, ?, ?, ?, ?, ?, 1)`,
    ).bind(connectionId, input.providerKey, identity.id, identity.name, encryptedAccessToken, encryptedRefreshToken,
      JSON.stringify(scopes), typeof credentials.expiresAt === "string" ? credentials.expiresAt : null,
      now, now, provider.definitionVersion, now, now));
  }
  const jobId = newId();
  statements.push(
    input.env.LIFE_DB.prepare("UPDATE oauth_states SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL").bind(now, stateRow.id),
    input.env.LIFE_DB.prepare(
      `INSERT INTO provider_sync_runs
       (id, provider_key, connection_id, trigger_kind, status, started_at, completed_at, fetched_count,
        created_count, updated_count, ignored_count, error_count, request_id, created_at)
       VALUES (?, ?, ?, 'MANUAL', 'SUCCEEDED', ?, ?, ?, 0, 0, 0, 0, ?, ?)`,
    ).bind(runId, input.providerKey, connectionId, now, now, rawAccounts.length, newId(), now),
    input.env.LIFE_DB.prepare(
      `INSERT INTO provider_sync_jobs
       (id, provider_key, connection_id, next_run_at, status, attempt, max_attempts, backoff_seconds, dedupe_key, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'READY', 0, 5, 60, ?, ?, ?)
       ON CONFLICT(dedupe_key) DO UPDATE SET status = 'READY', attempt = 0, next_run_at = excluded.next_run_at,
       last_error_code = NULL, updated_at = excluded.updated_at`,
    ).bind(jobId, input.providerKey, connectionId, now, `provider-sync:${connectionId}`, now, now),
  );
  for (const raw of rawAccounts) {
    const serialized = JSON.stringify(raw.payload);
    statements.push(input.env.LIFE_DB.prepare(
      `INSERT OR IGNORE INTO provider_raw_payloads
       (id, provider_key, sync_run_id, payload_kind, external_id, observed_at, sha256, payload_json, api_version, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(newId(), input.providerKey, runId, raw.kind, raw.externalId, raw.observedAt,
      await sha256(serialized), serialized, raw.apiVersion, now));
  }
  await input.env.LIFE_DB.batch(statements);
  cleanRedirect.searchParams.set("connected", "1");
  return Response.redirect(cleanRedirect.toString(), 303);
}

export async function connectionCredentials(env: Env, connectionId: string): Promise<{ provider: IntegrationProvider; credentials: Record<string, unknown>; row: Record<string, unknown> }> {
  const row = await env.LIFE_DB.prepare(
    `SELECT id, provider_key, external_account_id, display_name, status, encrypted_access_token,
            encrypted_refresh_token, token_expires_at, provider_definition_version
     FROM provider_connections WHERE id = ? AND disconnected_at IS NULL`,
  ).bind(connectionId).first<Record<string, unknown>>();
  if (!row) throw new ApiError(404, "NOT_FOUND", "找不到provider連線。");
  const provider = providerFor(String(row.provider_key), env);
  const credentials: Record<string, unknown> = {
    accessToken: await decryptSecret(String(row.encrypted_access_token), env.TOKEN_ENCRYPTION_KEY),
    externalAccountId: row.external_account_id,
    userId: row.external_account_id,
    expiresAt: row.token_expires_at,
  };
  if (row.encrypted_refresh_token) credentials.refreshToken = await decryptSecret(String(row.encrypted_refresh_token), env.TOKEN_ENCRYPTION_KEY);
  return { provider, credentials, row };
}
