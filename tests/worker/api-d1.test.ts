import { env } from "cloudflare:workers";
import { applyD1Migrations, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { v7 as uuidv7 } from "uuid";

import { decryptSecret, encryptSecret, sha256 } from "@/core/crypto/secrets";
import type { IntegrationProvider } from "@/integrations/providers/contract";
import { analyticResultSchema } from "@/core/provenance/analytic-result";
import { oauthStateTtlMilliseconds, refreshConnectionCredentialsIfNeeded, tokenRefreshRequired } from "@/worker/api/oauth";
import { claimManualProviderSyncJob, persistInstagram, persistYouTube, recoverStaleProviderSyncs, runD1WriteBatches, selectInstagramMediaInsightIds, storeRawPayloads, type RawWithId } from "@/worker/api/provider-sync";
import { processRetention } from "@/worker/scheduled";
import { SYSTEM_PLATFORM_IDS } from "@/modules/social/platforms";

async function jsonRequest(path: string, method = "GET", body?: unknown): Promise<Response> {
  return SELF.fetch(`https://life-manager.test${path}`, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function responseBody(response: Response): Promise<Record<string, unknown>> {
  const body = await response.json() as Record<string, unknown>;
  if (!response.ok) throw new Error(`${response.status}: ${JSON.stringify(body)}`);
  return body;
}

describe("正式D1 migration與API契約", () => {
  beforeAll(async () => { await applyD1Migrations(env.LIFE_DB, env.TEST_MIGRATIONS); });

  it("保留政策只清除到期操作紀錄且同步游標未確認前不刪change log", async () => {
    const old = "2024-01-01T00:00:00.000Z"; const recent = "2026-07-01T00:00:00.000Z";
    const oldAuditId = uuidv7(); const recentAuditId = uuidv7(); const deviceId = uuidv7();
    await env.LIFE_DB.batch([
      env.LIFE_DB.prepare("INSERT INTO audit_log (id, request_id, actor_id, entity_type, entity_id, action, occurred_at) VALUES (?, 'retention', 'test', 'test', 'old', 'TEST', ?)").bind(oldAuditId, old),
      env.LIFE_DB.prepare("INSERT INTO audit_log (id, request_id, actor_id, entity_type, entity_id, action, occurred_at) VALUES (?, 'retention', 'test', 'test', 'recent', 'TEST', ?)").bind(recentAuditId, recent),
      env.LIFE_DB.prepare("INSERT INTO api_idempotency (operation_id, request_hash, resource_type, resource_id, response_status, response_json, created_at) VALUES (?, 'hash', 'test', 'old', 200, '{}', ?)").bind(uuidv7(), old),
      env.LIFE_DB.prepare("INSERT INTO oauth_states (id, provider_key, state_hash, redirect_uri, expires_at, consumed_at, created_at) VALUES (?, 'youtube', ?, 'https://example.test/oauth/youtube/callback', ?, ?, ?)").bind(uuidv7(), `state-${uuidv7()}`, old, old, old),
      env.LIFE_DB.prepare("INSERT INTO sync_devices (id, display_name, user_agent_summary, last_seen_at, created_at, updated_at) VALUES (?, '保留測試裝置', 'test', ?, ?, ?)").bind(deviceId, recent, recent, recent),
      env.LIFE_DB.prepare("INSERT INTO sync_cursors (device_id, last_pulled_cursor, updated_at) VALUES (?, 0, ?)").bind(deviceId, recent),
      env.LIFE_DB.prepare("INSERT INTO sync_change_log (entity_type, entity_id, operation_kind, entity_version, snapshot_json, changed_at, operation_id) VALUES ('test', 'old', 'UPSERT', 1, '{}', ?, NULL)").bind(old),
    ]);
    const first = await processRetention(env, new Date("2026-08-02T00:00:00.000Z"));
    expect(first).toEqual(expect.objectContaining({ audit: 1, idempotency: 1, oauth: 1, syncChanges: 0 }));
    const cursor = Number((await env.LIFE_DB.prepare("SELECT MAX(cursor) AS cursor FROM sync_change_log WHERE entity_type = 'test' AND entity_id = 'old'").first<{ cursor: number }>())?.cursor);
    await env.LIFE_DB.prepare("UPDATE sync_cursors SET last_pulled_cursor = ? WHERE device_id = ?").bind(cursor, deviceId).run();
    const second = await processRetention(env, new Date("2026-08-02T00:00:00.000Z"));
    expect(second.syncChanges).toBe(1);
    expect(await env.LIFE_DB.prepare("SELECT id FROM audit_log WHERE id = ?").bind(recentAuditId).first()).not.toBeNull();
  });

  it("完整套用schema 10且新環境沒有使用者示範資料", async () => {
    const version = await env.LIFE_DB.prepare("SELECT value FROM schema_metadata WHERE key = 'application_schema_version'").first<{ value: string }>();
    const userCounts = await Promise.all(["areas", "task_definitions", "financial_transactions", "content_assets", "deadline_items"].map(async (table) => Number((await env.LIFE_DB.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first<{ count: number }>())?.count)));
    expect(version?.value).toBe("12");
    expect(userCounts).toEqual([0, 0, 0, 0, 0]);
    expect(Number((await env.LIFE_DB.prepare("SELECT COUNT(*) AS count FROM social_platforms").first<{ count: number }>())?.count)).toBe(2);
  });

  it("相同原始payload全域去重但每次provider run都保留有序證據關聯", async () => {
    const runA = uuidv7();
    const runB = uuidv7();
    const now = "2026-08-09T15:30:00.000Z";
    const payload = {
      kind: "channels",
      externalId: null,
      observedAt: now,
      apiVersion: "youtube-data-v3@evidence-link-test",
      payload: { items: [{ id: "same-channel", snippet: { title: "同一真實來源回應" } }] },
    };
    for (const runId of [runA, runB]) {
      await env.LIFE_DB.prepare(
        `INSERT INTO provider_sync_runs
         (id, provider_key, connection_id, trigger_kind, status, started_at, completed_at, fetched_count,
          created_count, updated_count, ignored_count, error_count, request_id, created_at)
         VALUES (?, 'youtube', NULL, 'MANUAL', 'SUCCEEDED', ?, ?, 1, 0, 0, 0, 0, ?, ?)`,
      ).bind(runId, now, now, `evidence-${runId}`, now).run();
      await storeRawPayloads(env, "youtube", runId, [payload]);
    }
    expect(Number((await env.LIFE_DB.prepare(
      "SELECT COUNT(*) AS count FROM provider_raw_payloads WHERE api_version = 'youtube-data-v3@evidence-link-test'",
    ).first<{ count: number }>())?.count)).toBe(1);
    const links = await env.LIFE_DB.prepare(
      `SELECT l.sync_run_id, l.payload_order, p.payload_kind
       FROM provider_sync_run_payloads l
       JOIN provider_raw_payloads p ON p.id = l.raw_payload_id
       WHERE l.sync_run_id IN (?, ?)
       ORDER BY l.sync_run_id`,
    ).bind(runA, runB).all<{ sync_run_id: string; payload_order: number; payload_kind: string }>();
    expect(links.results).toEqual([
      { sync_run_id: runA, payload_order: 0, payload_kind: "channels" },
      { sync_run_id: runB, payload_order: 0, payload_kind: "channels" },
    ].sort((left, right) => left.sync_run_id.localeCompare(right.sync_run_id)));
    await env.LIFE_DB.prepare("DELETE FROM provider_sync_run_payloads WHERE sync_run_id IN (?, ?)").bind(runA, runB).run();
    await env.LIFE_DB.prepare("DELETE FROM provider_raw_payloads WHERE api_version = 'youtube-data-v3@evidence-link-test'").run();
    await env.LIFE_DB.prepare("DELETE FROM provider_sync_runs WHERE id IN (?, ?)").bind(runA, runB).run();
  });

  it("OAuth state TTL使用受限公開設定且staging固定答案為60分鐘", async () => {
    expect(oauthStateTtlMilliseconds("60")).toBe(3_600_000);
    for (const invalid of [undefined, "", "9", "121", "10.5", "NaN"]) {
      expect(() => oauthStateTtlMilliseconds(invalid)).toThrowError(expect.objectContaining({
        status: 503,
        code: "OAUTH_CONFIGURATION_MISSING",
      }));
    }
    const response = await jsonRequest("/api/v1/integrations/youtube/authorize", "POST", { operationId: uuidv7() });
    expect(response.status).toBe(200);
    const row = await env.LIFE_DB.prepare(
      "SELECT created_at, expires_at FROM oauth_states WHERE provider_key = 'youtube' ORDER BY created_at DESC LIMIT 1",
    ).first<{ created_at: string; expires_at: string }>();
    expect(row).not.toBeNull();
    expect(Date.parse(String(row?.expires_at)) - Date.parse(String(row?.created_at))).toBe(3_600_000);
  });

  it("中斷的provider run會轉為可重試且同一連線只能取得一個手動同步鎖", async () => {
    const connectionId = uuidv7();
    const runId = uuidv7();
    const jobId = uuidv7();
    const old = "2026-08-09T00:00:00.000Z";
    const now = new Date("2026-08-09T01:00:00.000Z");
    await env.LIFE_DB.batch([
      env.LIFE_DB.prepare(
        `INSERT INTO provider_connections
         (id, provider_key, external_account_id, display_name, status, granted_scopes_json,
          provider_definition_version, created_at, updated_at, version)
         VALUES (?, 'youtube', ?, 'stale-test', 'CONNECTED', '[]', 'stale-test-v1', ?, ?, 1)`,
      ).bind(connectionId, `stale-${connectionId}`, old, old),
      env.LIFE_DB.prepare(
        `INSERT INTO provider_sync_runs
         (id, provider_key, connection_id, trigger_kind, status, started_at, fetched_count,
          created_count, updated_count, ignored_count, error_count, request_id, created_at)
         VALUES (?, 'youtube', ?, 'MANUAL', 'RUNNING', ?, 0, 0, 0, 0, 0, 'stale-test', ?)`,
      ).bind(runId, connectionId, old, old),
      env.LIFE_DB.prepare(
        `INSERT INTO provider_sync_jobs
         (id, provider_key, connection_id, next_run_at, status, attempt, max_attempts,
          backoff_seconds, dedupe_key, created_at, updated_at)
         VALUES (?, 'youtube', ?, ?, 'RUNNING', 0, 5, 60, ?, ?, ?)`,
      ).bind(jobId, connectionId, old, `stale-job-${connectionId}`, old, old),
    ]);
    await recoverStaleProviderSyncs(env, now, connectionId);
    expect(await env.LIFE_DB.prepare(
      "SELECT status, error_code, error_count FROM provider_sync_runs WHERE id = ?",
    ).bind(runId).first()).toEqual({ status: "FAILED", error_code: "SYNC_INTERRUPTED", error_count: 1 });
    expect(await env.LIFE_DB.prepare(
      "SELECT status, attempt, last_error_code FROM provider_sync_jobs WHERE id = ?",
    ).bind(jobId).first()).toEqual({ status: "RETRY", attempt: 1, last_error_code: "SYNC_INTERRUPTED" });
    expect(await claimManualProviderSyncJob(env, connectionId, now.toISOString())).toBe(true);
    expect(await claimManualProviderSyncJob(env, connectionId, now.toISOString())).toBe(false);
    await env.LIFE_DB.batch([
      env.LIFE_DB.prepare("DELETE FROM provider_sync_jobs WHERE id = ?").bind(jobId),
      env.LIFE_DB.prepare("DELETE FROM provider_sync_runs WHERE id = ?").bind(runId),
      env.LIFE_DB.prepare("DELETE FROM provider_connections WHERE id = ?").bind(connectionId),
    ]);
  });

  it("OAuth callback拒絕缺參數、錯誤state與redirect mismatch且回跳不洩密", async () => {
    const missing = await SELF.fetch("https://life-manager.test/oauth/youtube/callback", { redirect: "manual" });
    expect(missing.status).toBe(303); const missingLocation = new URL(String(missing.headers.get("location"))); expect(missingLocation.pathname).toBe("/integrations"); expect(missingLocation.searchParams.get("provider")).toBe("youtube"); expect(missingLocation.searchParams.get("error")).toBe("OAUTH_RESPONSE_MISSING");
    const invalid = await SELF.fetch("https://life-manager.test/oauth/youtube/callback?code=secret-code&state=bad-state", { redirect: "manual" });
    expect(invalid.status).toBe(303); const invalidLocation = String(invalid.headers.get("location")); const invalidUrl = new URL(invalidLocation); expect(invalidUrl.pathname).toBe("/integrations"); expect(invalidUrl.searchParams.get("error")).toBe("OAUTH_STATE_INVALID"); expect(invalidLocation).not.toMatch(/secret-code|bad-state|token/);
    const state = "redirect-mismatch-state";
    await env.LIFE_DB.prepare("INSERT INTO oauth_states (id, provider_key, state_hash, code_verifier_encrypted, redirect_uri, expires_at, created_at) VALUES (?, 'youtube', ?, 'not-read-before-mismatch', 'https://wrong.example/oauth/youtube/callback', '2099-01-01T00:00:00.000Z', '2026-08-02T00:00:00.000Z')").bind(uuidv7(), await sha256(state)).run();
    const mismatch = await SELF.fetch(`https://life-manager.test/oauth/youtube/callback?code=secret-code&state=${state}`, { redirect: "manual" });
    expect(mismatch.status).toBe(400); const body = await mismatch.json() as { error: { code: string } }; expect(body.error.code).toBe("OAUTH_STATE_INVALID");
  });

  it("即將到期的provider token會換發並重新加密保存且保留原refresh token", async () => {
    const connectionId = uuidv7();
    const nowMilliseconds = Date.parse("2026-08-09T00:00:00.000Z");
    const oldAccessToken = "old-access-token-for-refresh-test";
    const refreshToken = "existing-refresh-token-for-refresh-test";
    await env.LIFE_DB.prepare(
      `INSERT INTO provider_connections
       (id, provider_key, external_account_id, display_name, status, encrypted_access_token, encrypted_refresh_token,
        token_algorithm, granted_scopes_json, token_expires_at, provider_definition_version, created_at, updated_at, version)
       VALUES (?, 'youtube', ?, 'refresh-test', 'CONNECTED', ?, ?, 'AES-GCM-256', '[]', ?, 'refresh-test-v1', ?, ?, 1)`,
    ).bind(connectionId, `refresh-${connectionId}`,
      await encryptSecret(oldAccessToken, env.TOKEN_ENCRYPTION_KEY),
      await encryptSecret(refreshToken, env.TOKEN_ENCRYPTION_KEY),
      "2026-08-09T00:04:00.000Z", "2026-08-08T00:00:00.000Z", "2026-08-08T00:00:00.000Z").run();
    expect(tokenRefreshRequired("2026-08-09T00:04:00.000Z", nowMilliseconds)).toBe(true);
    const provider: Pick<IntegrationProvider, "key" | "definitionVersion" | "refreshCredentials"> = {
      key: "youtube",
      definitionVersion: "refresh-test-v2",
      refreshCredentials: async () => ({ accessToken: "new-access-token-for-refresh-test", expiresAt: "2026-08-09T01:00:00.000Z" }),
    };
    const refreshed = await refreshConnectionCredentialsIfNeeded({
      env,
      connectionId,
      provider,
      credentials: { accessToken: oldAccessToken, refreshToken, expiresAt: "2026-08-09T00:04:00.000Z" },
      nowMilliseconds,
    });
    expect(refreshed).toEqual(expect.objectContaining({
      accessToken: "new-access-token-for-refresh-test",
      refreshToken,
      expiresAt: "2026-08-09T01:00:00.000Z",
    }));
    const stored = await env.LIFE_DB.prepare(
      "SELECT encrypted_access_token, encrypted_refresh_token, token_expires_at, version FROM provider_connections WHERE id = ?",
    ).bind(connectionId).first<{ encrypted_access_token: string; encrypted_refresh_token: string; token_expires_at: string; version: number }>();
    expect(stored?.encrypted_access_token).not.toContain("new-access-token-for-refresh-test");
    expect(stored?.encrypted_refresh_token).not.toContain(refreshToken);
    expect(await decryptSecret(String(stored?.encrypted_access_token), env.TOKEN_ENCRYPTION_KEY)).toBe("new-access-token-for-refresh-test");
    expect(await decryptSecret(String(stored?.encrypted_refresh_token), env.TOKEN_ENCRYPTION_KEY)).toBe(refreshToken);
    expect(stored).toEqual(expect.objectContaining({ token_expires_at: "2026-08-09T01:00:00.000Z", version: 2 }));
    await env.LIFE_DB.prepare("DELETE FROM provider_connections WHERE id = ?").bind(connectionId).run();
  });

  it("YouTube日Analytics寫入帳號級非累積快照且raw provenance與partial unique index生效", async () => {
    const runId = uuidv7();
    const now = "2026-08-09T00:00:00.000Z";
    const raw: RawWithId[] = [
      {
        rawId: uuidv7(), kind: "channels", externalId: null, observedAt: now,
        apiVersion: "youtube-data-v3+analytics-v2@2026-08-09",
        payload: { items: [{ id: "test-channel", snippet: { title: "測試頻道" } }] },
      },
      {
        rawId: uuidv7(), kind: "videos", externalId: null, observedAt: now,
        apiVersion: "youtube-data-v3+analytics-v2@2026-08-09",
        payload: { items: [{ id: "test-video", snippet: { title: "測試影片", publishedAt: "2026-08-01T00:00:00.000Z" }, statistics: { viewCount: "20" } }] },
      },
      {
        rawId: uuidv7(), kind: "analytics", externalId: null, observedAt: now,
        apiVersion: "youtube-data-v3+analytics-v2@2026-08-09",
        payload: {
          columnHeaders: [{ name: "day" }, { name: "views" }, { name: "likes" }, { name: "comments" }],
          rows: [["2026-08-01", 10, -2, 1]],
        },
      },
    ];
    await env.LIFE_DB.prepare(
      `INSERT INTO provider_sync_runs
       (id, provider_key, connection_id, trigger_kind, status, started_at, completed_at, fetched_count,
        created_count, updated_count, ignored_count, error_count, request_id, created_at)
       VALUES (?, 'youtube', NULL, 'MANUAL', 'SUCCEEDED', ?, ?, 3, 0, 0, 0, 0, 'youtube-daily-test', ?)`,
    ).bind(runId, now, now, now).run();
    for (const entry of raw) {
      await env.LIFE_DB.prepare(
        `INSERT INTO provider_raw_payloads
         (id, provider_key, sync_run_id, payload_kind, external_id, observed_at, sha256, payload_json, api_version, created_at)
         VALUES (?, 'youtube', ?, ?, NULL, ?, ?, ?, ?, ?)`,
      ).bind(entry.rawId, runId, entry.kind, entry.observedAt, `sha-${entry.rawId}`,
        JSON.stringify(entry.payload), entry.apiVersion, now).run();
    }
    await persistYouTube(env, raw);
    await persistYouTube(env, raw);
    const rows = await env.LIFE_DB.prepare(
      `SELECT d.metric_key, d.provider_definition_version, s.value_decimal, s.is_cumulative,
              s.quality, s.observed_at, s.raw_payload_id
       FROM social_metric_snapshots s
       JOIN social_metric_definitions d ON d.id = s.social_metric_definition_id
       WHERE d.metric_key LIKE 'youtube.analytics.daily.%'
       ORDER BY d.metric_key`,
    ).all<{
      metric_key: string; provider_definition_version: string; value_decimal: string;
      is_cumulative: number; quality: string; observed_at: string; raw_payload_id: string;
    }>();
    expect(rows.results).toEqual([
      { metric_key: "youtube.analytics.daily.comments", provider_definition_version: "youtube-analytics-v2-channel-daily@2026-08-09", value_decimal: "1", is_cumulative: 0, quality: "SOURCE_REPORTED", observed_at: "2026-08-01T07:00:00.000Z", raw_payload_id: raw[2].rawId },
      { metric_key: "youtube.analytics.daily.likes", provider_definition_version: "youtube-analytics-v2-channel-daily@2026-08-09", value_decimal: "-2", is_cumulative: 0, quality: "SOURCE_REPORTED", observed_at: "2026-08-01T07:00:00.000Z", raw_payload_id: raw[2].rawId },
      { metric_key: "youtube.analytics.daily.views", provider_definition_version: "youtube-analytics-v2-channel-daily@2026-08-09", value_decimal: "10", is_cumulative: 0, quality: "SOURCE_REPORTED", observed_at: "2026-08-01T07:00:00.000Z", raw_payload_id: raw[2].rawId },
    ]);
    expect(Number((await env.LIFE_DB.prepare(
      "SELECT COUNT(*) AS count FROM social_metric_snapshots s JOIN social_metric_definitions d ON d.id = s.social_metric_definition_id WHERE d.metric_key = 'youtube.views'",
    ).first<{ count: number }>())?.count)).toBe(1);
    const post = await env.LIFE_DB.prepare(
      "SELECT id, content_asset_id FROM platform_posts WHERE external_post_id = 'test-video'",
    ).first<{ id: string; content_asset_id: string }>();
    const account = await env.LIFE_DB.prepare(
      "SELECT id FROM social_accounts WHERE external_account_id = 'test-channel'",
    ).first<{ id: string }>();
    await env.LIFE_DB.batch([
      env.LIFE_DB.prepare("DELETE FROM social_metric_snapshots WHERE raw_payload_id IN (?, ?, ?)")
        .bind(raw[0].rawId, raw[1].rawId, raw[2].rawId),
      env.LIFE_DB.prepare("DELETE FROM platform_posts WHERE id = ?").bind(post?.id),
      env.LIFE_DB.prepare("DELETE FROM social_accounts WHERE id = ?").bind(account?.id),
    ]);
    await env.LIFE_DB.batch([
      env.LIFE_DB.prepare("DELETE FROM content_assets WHERE id = ?").bind(post?.content_asset_id),
      env.LIFE_DB.prepare("DELETE FROM social_metric_definitions WHERE provider_definition_version IN ('youtube-data-v3@2026-08-09', 'youtube-analytics-v2-channel-daily@2026-08-09')"),
      env.LIFE_DB.prepare("DELETE FROM provider_raw_payloads WHERE sync_run_id = ?").bind(runId),
    ]);
    await env.LIFE_DB.prepare("DELETE FROM provider_sync_runs WHERE id = ?").bind(runId).run();
  });

  it("Instagram profile使用user_id新增及更新帳號", async () => {
    const raw: RawWithId[] = [{
      rawId: uuidv7(),
      kind: "profile",
      externalId: null,
      observedAt: "2026-08-11T00:00:00.000Z",
      apiVersion: "v23.0",
      payload: { user_id: "instagram-account", username: "instagram-display" },
    }];

    expect(await persistInstagram(env, raw)).toEqual({ created: 1, updated: 0 });
    expect(await persistInstagram(env, raw)).toEqual({ created: 0, updated: 1 });
    const account = await env.LIFE_DB.prepare(
      "SELECT id, external_account_id, display_name, account_kind, source_type, version FROM social_accounts WHERE external_account_id = ?",
    ).bind("instagram-account").first<{
      id: string; external_account_id: string; display_name: string; account_kind: string; source_type: string; version: number;
    }>();
    expect(account).toEqual(expect.objectContaining({
      external_account_id: "instagram-account",
      display_name: "instagram-display",
      account_kind: "PROFESSIONAL",
      source_type: "INSTAGRAM_API",
      version: 2,
    }));
    await env.LIFE_DB.prepare("DELETE FROM social_accounts WHERE id = ?").bind(account?.id).run();
  });

  it("Instagram media insights優先輪替未同步與最久未同步內容", async () => {
    const now = "2026-08-11T00:00:00.000Z";
    const media = Array.from({ length: 50 }, (_, index) => ({ id: `budget-media-${index + 1}` }));
    const content = [{
      kind: "media",
      externalId: null,
      observedAt: now,
      apiVersion: "v23.0",
      payload: { data: media },
    }];
    const first = await selectInstagramMediaInsightIds(env, content);
    expect(first).toEqual({ selectedIds: media.slice(0, 40).map((item) => item.id), skippedCount: 10 });

    const accountId = uuidv7();
    const definitionId = uuidv7();
    const statements: D1PreparedStatement[] = [
      env.LIFE_DB.prepare(
         `INSERT INTO social_accounts
         (id, platform_id, display_name, external_account_id, account_kind, timezone, source_type, created_at, updated_at, version)
         VALUES (?, ?, 'budget-account', 'budget-account', 'PROFESSIONAL', 'Asia/Taipei', 'INSTAGRAM_API', ?, ?, 1)`,
      ).bind(accountId, SYSTEM_PLATFORM_IDS.instagram, now, now),
      env.LIFE_DB.prepare(
        `INSERT INTO social_metric_definitions
         (id, platform_id, metric_key, provider_metric_name, provider_definition, provider_definition_version,
          unit, scope, is_cumulative, comparable_family, source_type, created_at, updated_at, version)
         VALUES (?, ?, 'budget_views', 'views', 'budget fixture', 'budget-test',
          'count', 'POST', 1, 'views', 'INSTAGRAM_API', ?, ?, 1)`,
      ).bind(definitionId, SYSTEM_PLATFORM_IDS.instagram, now, now),
    ];
    const contentIds: string[] = [];
    for (let index = 0; index < 40; index++) {
      const contentId = uuidv7();
      const postId = uuidv7();
      contentIds.push(contentId);
      const observedAt = new Date(Date.UTC(2026, 5, index + 1)).toISOString();
      statements.push(
        env.LIFE_DB.prepare(
          `INSERT INTO content_assets
           (id, title, description, topic, style, format, campaign, source_type, created_at, updated_at, version)
           VALUES (?, ?, '', '', '', 'POST', '', 'INSTAGRAM_API', ?, ?, 1)`,
        ).bind(contentId, media[index].id, now, now),
        env.LIFE_DB.prepare(
          `INSERT INTO platform_posts
           (id, content_asset_id, social_account_id, external_post_id, platform_format, published_at,
            published_timezone, source_type, created_at, updated_at, version)
           VALUES (?, ?, ?, ?, 'POST', ?, 'UTC', 'INSTAGRAM_API', ?, ?, 1)`,
        ).bind(postId, contentId, accountId, media[index].id, now, now, now),
        env.LIFE_DB.prepare(
          `INSERT INTO social_metric_snapshots
           (id, social_metric_definition_id, platform_post_id, observed_at, value_decimal, is_cumulative,
            quality, source_type, created_at, updated_at, version)
           VALUES (?, ?, ?, ?, '1', 1, 'SOURCE_REPORTED', 'INSTAGRAM_API', ?, ?, 1)`,
        ).bind(uuidv7(), definitionId, postId, observedAt, now, now),
      );
    }
    await runD1WriteBatches(env, statements);

    const second = await selectInstagramMediaInsightIds(env, content);
    expect(second.skippedCount).toBe(10);
    expect(second.selectedIds).toEqual([
      ...media.slice(40).map((item) => item.id),
      ...media.slice(0, 30).map((item) => item.id),
    ]);

    await env.LIFE_DB.batch([
      env.LIFE_DB.prepare("DELETE FROM social_metric_snapshots WHERE social_metric_definition_id = ?").bind(definitionId),
      env.LIFE_DB.prepare("DELETE FROM platform_posts WHERE social_account_id = ?").bind(accountId),
    ]);
    await runD1WriteBatches(env, contentIds.map((id) => env.LIFE_DB.prepare("DELETE FROM content_assets WHERE id = ?").bind(id)));
    await env.LIFE_DB.batch([
      env.LIFE_DB.prepare("DELETE FROM social_metric_definitions WHERE id = ?").bind(definitionId),
      env.LIFE_DB.prepare("DELETE FROM social_accounts WHERE id = ?").bind(accountId),
    ]);
  });

  it("完整JSON以checksum驗證後可還原到空白正式資料庫且不含秘密", async () => {
    const areaId = uuidv7();
    const exportRunId = uuidv7();
    const exportNow = "2026-08-09T15:40:00.000Z";
    await responseBody(await jsonRequest("/api/v1/areas", "POST", { operationId: uuidv7(), data: { id: areaId, name: "可攜領域", description: "備份驗收", whyText: "搬家", principlesText: "不遺失", strategyText: "完整匯出", nextActionText: "還原", lowClarityGuide: "核對checksum", sortOrder: 0, sourceType: "MANUAL" } }));
    await env.LIFE_DB.prepare(
      `INSERT INTO provider_sync_runs
       (id, provider_key, connection_id, trigger_kind, status, started_at, completed_at, fetched_count,
        created_count, updated_count, ignored_count, error_count, request_id, created_at)
       VALUES (?, 'youtube', NULL, 'MANUAL', 'SUCCEEDED', ?, ?, 1, 0, 0, 0, 0, 'full-export-evidence', ?)`,
    ).bind(exportRunId, exportNow, exportNow, exportNow).run();
    const exportRaw = await storeRawPayloads(env, "youtube", exportRunId, [{
      kind: "channels", externalId: null, observedAt: exportNow,
      apiVersion: "youtube-data-v3@full-export-evidence", payload: { items: [] },
    }]);
    const exportedResponse = await jsonRequest("/api/v1/exports/full", "POST", { operationId: uuidv7() });
    expect(exportedResponse.status).toBe(200);
    const exportedText = await exportedResponse.text();
    const exported = JSON.parse(exportedText) as { checksum: string; entities: Record<string, unknown[]> };
    expect(JSON.stringify(exported)).not.toMatch(/encrypted_access_token|endpoint_encrypted|email_recipient_encrypted/);
    expect(exported.entities.provider_sync_run_payloads).toEqual(expect.arrayContaining([
      expect.objectContaining({ sync_run_id: exportRunId, payload_order: 0, raw_payload_id: exportRaw[0].rawId }),
    ]));
    await env.LIFE_DB.batch([
      env.LIFE_DB.prepare("DELETE FROM areas WHERE id = ?").bind(areaId),
      env.LIFE_DB.prepare("DELETE FROM provider_sync_run_payloads WHERE sync_run_id = ?").bind(exportRunId),
    ]);
    await env.LIFE_DB.prepare("DELETE FROM provider_raw_payloads WHERE id = ?").bind(exportRaw[0].rawId).run();
    await env.LIFE_DB.prepare("DELETE FROM provider_sync_runs WHERE id = ?").bind(exportRunId).run();
    const form = new FormData(); form.set("operationId", uuidv7()); form.set("file", new File([exportedText], "full.json", { type: "application/json" }));
    const restored = (await responseBody(await SELF.fetch("https://life-manager.test/api/v1/imports/full", { method: "POST", body: form }))).data as Record<string, unknown>;
    expect(restored).toEqual(expect.objectContaining({ sourceChecksum: exported.checksum, secretsRestored: false, externalConnectionsRequireReauthorization: true }));
    expect(await env.LIFE_DB.prepare("SELECT name FROM areas WHERE id = ?").bind(areaId).first<{ name: string }>()).toEqual({ name: "可攜領域" });
    expect(await env.LIFE_DB.prepare(
      "SELECT raw_payload_id FROM provider_sync_run_payloads WHERE sync_run_id = ? AND payload_order = 0",
    ).bind(exportRunId).first<{ raw_payload_id: string }>()).toEqual({ raw_payload_id: exportRaw[0].rawId });
  });

  it("領域CRUD具idempotency、稽核、變更流及版本衝突", async () => {
    const id = uuidv7(); const operationId = uuidv7();
    const data = { id, name: "經濟", description: "正式資料", whyText: "維持選擇權", principlesText: "不造假", strategyText: "建立現金流", nextActionText: "記錄交易", lowClarityGuide: "先核對一筆帳", sortOrder: 1, sourceType: "MANUAL" };
    const first = await jsonRequest("/api/v1/areas", "POST", { operationId, data });
    expect(first.status).toBe(201);
    const replay = await responseBody(await jsonRequest("/api/v1/areas", "POST", { operationId, data }));
    expect((replay.meta as Record<string, unknown>).idempotentReplay).toBe(true);
    const updated = await responseBody(await jsonRequest(`/api/v1/areas/${id}`, "PATCH", { operationId: uuidv7(), baseVersion: 1, data: { strategyText: "更新後策略" } }));
    expect((updated.data as Record<string, unknown>).version).toBe(2);
    const conflict = await jsonRequest(`/api/v1/areas/${id}`, "PATCH", { operationId: uuidv7(), baseVersion: 1, data: { strategyText: "過期版本" } });
    expect(conflict.status).toBe(409);
    expect(Number((await env.LIFE_DB.prepare("SELECT COUNT(*) AS count FROM audit_log WHERE entity_id = ?").bind(id).first<{ count: number }>())?.count)).toBe(2);
    expect(Number((await env.LIFE_DB.prepare("SELECT COUNT(*) AS count FROM sync_change_log WHERE entity_id = ?").bind(id).first<{ count: number }>())?.count)).toBe(2);
  });

  it("同步封存與恢復使用同一正式欄位並留下RESTORE變更", async () => {
    const areaId = uuidv7(); const deviceId = uuidv7();
    await responseBody(await jsonRequest("/api/v1/areas", "POST", { operationId: uuidv7(), data: { id: areaId, name: "離線恢復驗收", description: "", whyText: "", principlesText: "", strategyText: "", nextActionText: "", lowClarityGuide: "", sortOrder: 0, sourceType: "MANUAL" } }));
    await responseBody(await jsonRequest("/api/v1/sync/devices", "POST", { operationId: uuidv7(), data: { id: deviceId, displayName: "恢復驗收裝置", userAgentSummary: "worker-contract" } }));
    const operation = (kind: "ARCHIVE" | "RESTORE", baseVersion: number) => ({ operationId: uuidv7(), deviceId, entityType: "areas", entityId: areaId, kind, baseVersion, payload: {}, clientOccurredAt: new Date().toISOString(), schemaVersion: 1 });
    await responseBody(await jsonRequest("/api/v1/sync/batch", "POST", { operations: [operation("ARCHIVE", 1)] }));
    expect(await env.LIFE_DB.prepare("SELECT archived_at, version FROM areas WHERE id = ?").bind(areaId).first()).toEqual(expect.objectContaining({ version: 2 }));
    expect((await env.LIFE_DB.prepare("SELECT archived_at FROM areas WHERE id = ?").bind(areaId).first<{ archived_at: string | null }>())?.archived_at).toBeTruthy();
    await responseBody(await jsonRequest("/api/v1/sync/batch", "POST", { operations: [operation("RESTORE", 2)] }));
    expect(await env.LIFE_DB.prepare("SELECT archived_at, version FROM areas WHERE id = ?").bind(areaId).first()).toEqual({ archived_at: null, version: 3 });
    const restored = await env.LIFE_DB.prepare("SELECT operation_kind, snapshot_json FROM sync_change_log WHERE entity_id = ? ORDER BY cursor DESC LIMIT 1").bind(areaId).first<{ operation_kind: string; snapshot_json: string }>();
    expect(restored?.operation_kind).toBe("RESTORE");
    expect(JSON.parse(String(restored?.snapshot_json)).archivedAt).toBeNull();
  });

  it("每日任務補產生過去發生項並可版本化延後，延後後不再列入今日", async () => {
    const taskId = uuidv7(); const scheduleId = uuidv7();
    await responseBody(await jsonRequest("/api/v1/tasks", "POST", { operationId: uuidv7(), data: {
      id: taskId, areaId: null, businessId: null, title: "每日記錄", description: "", whyText: "保留連續性",
      completionCriteria: "完成一筆記錄", lowClarityGuide: "先記一行", metricRole: "ACTION",
      estimatedMinutes: 5, priority: 80, pinnedNextAction: true,
    } }));
    await responseBody(await jsonRequest("/api/v1/task-schedules", "POST", { operationId: uuidv7(), data: {
      id: scheduleId, taskDefinitionId: taskId, recurrenceKind: "DAILY", startsOnLocalDate: "2026-08-01",
      dueLocalTime: null, timezone: "Asia/Taipei", weekdays: null, monthDay: null, rruleText: null,
      intervalValue: 1, endsOnLocalDate: null,
    } }));
    const before = (await responseBody(await jsonRequest("/api/v1/dashboard?today=2026-08-03"))).data as { todayActions: Array<Record<string, unknown>> };
    const generated = before.todayActions.filter((item) => item.task_id === taskId);
    expect(generated.map((item) => item.scheduled_local_date)).toEqual(["2026-08-01", "2026-08-02", "2026-08-03"]);
    const first = generated[0];
    const rejected = await jsonRequest(`/api/v1/task-occurrences/${first.occurrence_id}/defer`, "POST", { operationId: uuidv7(), data: { baseVersion: first.occurrence_version, deferredToLocalDate: "2026-08-01" } });
    expect(rejected.status).toBe(400);
    const deferred = (await responseBody(await jsonRequest(`/api/v1/task-occurrences/${first.occurrence_id}/defer`, "POST", { operationId: uuidv7(), data: { baseVersion: first.occurrence_version, deferredToLocalDate: "2026-08-04" } }))).data as Record<string, unknown>;
    expect(deferred).toEqual(expect.objectContaining({ status: "DEFERRED", deferredToLocalDate: "2026-08-04", version: 2 }));
    const after = (await responseBody(await jsonRequest("/api/v1/dashboard?today=2026-08-03"))).data as { todayActions: Array<Record<string, unknown>> };
    expect(after.todayActions.filter((item) => item.task_id === taskId).map((item) => item.scheduled_local_date)).toEqual(["2026-08-02", "2026-08-03"]);
    expect((await env.LIFE_DB.prepare("SELECT action FROM audit_log WHERE entity_id = ?").bind(first.occurrence_id).first<{ action: string }>())?.action).toBe("DEFER");
  });

  it("事業跨模組關聯驗證來源與七種正式目標，不接受斷鏈", async () => {
    const areaId = uuidv7(); const businessId = uuidv7(); const suffix = Date.now();
    await responseBody(await jsonRequest("/api/v1/areas", "POST", { operationId: uuidv7(), data: { id: areaId, name: `關聯領域${suffix}`, description: "", whyText: "", principlesText: "", strategyText: "", nextActionText: "", lowClarityGuide: "", sortOrder: 0, sourceType: "MANUAL" } }));
    await responseBody(await jsonRequest("/api/v1/businesses", "POST", { operationId: uuidv7(), data: { id: businessId, areaId, name: `關聯事業${suffix}`, description: "", status: "ACTIVE", whyText: "", principlesText: "", strategyText: "", nextActionText: "", lowClarityGuide: "", sortOrder: 0, sourceType: "MANUAL" } }));
    const incomeSourceId = uuidv7(); const expenseCategoryId = uuidv7(); const taskId = uuidv7();
    const eventTypeId = uuidv7(); const eventId = uuidv7(); const metricId = uuidv7(); const contentId = uuidv7(); const savedViewId = uuidv7();
    await responseBody(await jsonRequest("/api/v1/income-sources", "POST", { operationId: uuidv7(), data: { id: incomeSourceId, businessId, name: `關聯收入${suffix}`, description: "" } }));
    await responseBody(await jsonRequest("/api/v1/finance-categories", "POST", { operationId: uuidv7(), data: { id: expenseCategoryId, kind: "EXPENSE", name: `關聯支出${suffix}`, parentId: null } }));
    await responseBody(await jsonRequest("/api/v1/tasks", "POST", { operationId: uuidv7(), data: { id: taskId, areaId, businessId, title: `關聯任務${suffix}`, description: "", whyText: "", completionCriteria: "", lowClarityGuide: "", metricRole: "ACTION", estimatedMinutes: null, priority: 50, pinnedNextAction: false } }));
    await responseBody(await jsonRequest("/api/v1/event-types", "POST", { operationId: uuidv7(), data: { id: eventTypeId, name: `關聯事件類型${suffix}`, colorToken: "event" } }));
    await responseBody(await jsonRequest("/api/v1/events", "POST", { operationId: uuidv7(), data: { id: eventId, eventTypeId, areaId, businessId, title: `關聯事件${suffix}`, description: "", startsAt: "2026-08-02T00:00:00.000Z", endsAt: null, inputTimezone: "Asia/Taipei", sourceReference: null, sourceType: "MANUAL" } }));
    await responseBody(await jsonRequest("/api/v1/metrics", "POST", { operationId: uuidv7(), data: { id: metricId, key: `linked_metric_${suffix}`, name: `關聯指標${suffix}`, unit: "count", valueType: "INTEGER", role: "OUTCOME", domain: "business", areaId, businessId, recordingFrequency: "AD_HOC", sourcePolicy: "MANUAL", precision: 0 } }));
    await responseBody(await jsonRequest("/api/v1/content-assets", "POST", { operationId: uuidv7(), data: { id: contentId, businessId, title: `關聯內容${suffix}`, description: "", topic: "", style: "", format: "VIDEO", lengthValue: null, lengthUnit: null, campaign: "" } }));
    await responseBody(await jsonRequest("/api/v1/saved-views", "POST", { operationId: uuidv7(), data: { id: savedViewId, name: `關聯檢視${suffix}`, moduleKey: "social", filter: {}, chart: { kind: "FIRST_DAY_COMPARISON" } } }));
    const targets = [
      ["INCOME_SOURCE", incomeSourceId], ["EXPENSE_CATEGORY", expenseCategoryId], ["TASK", taskId], ["EVENT", eventId],
      ["METRIC", metricId], ["CONTENT", contentId], ["SAVED_VIEW", savedViewId],
    ] as const;
    const links: Array<Record<string, unknown>> = [];
    for (const [toType, toId] of targets) {
      const response = (await responseBody(await jsonRequest("/api/v1/entity-links", "POST", { operationId: uuidv7(), data: { id: uuidv7(), fromType: "BUSINESS", fromId: businessId, toType, toId, relationType: "RELATED", sourceType: "MANUAL" } }))).data as Record<string, unknown>;
      links.push(response);
    }
    expect(links).toHaveLength(7);
    const listed = (await responseBody(await jsonRequest(`/api/v1/entity-links?fromType=BUSINESS&fromId=${businessId}`))).data as Array<Record<string, unknown>>;
    expect(new Set(listed.map((link) => link.toType))).toEqual(new Set(targets.map(([toType]) => toType)));
    const invalid = await jsonRequest("/api/v1/entity-links", "POST", { operationId: uuidv7(), data: { id: uuidv7(), fromType: "BUSINESS", fromId: businessId, toType: "CONTENT", toId: uuidv7(), relationType: "RELATED", sourceType: "MANUAL" } });
    expect(invalid.status).toBe(404);
    await responseBody(await jsonRequest(`/api/v1/entity-links/${links[0].id}/archive`, "POST", { operationId: uuidv7(), baseVersion: links[0].version, data: {} }));
    const afterRemoval = (await responseBody(await jsonRequest(`/api/v1/entity-links?fromId=${businessId}`))).data as Array<Record<string, unknown>>;
    expect(afterRemoval).toHaveLength(6);
  });

  it("從D1交易寫入經API算出固定月財務答案，缺匯率明確排除", async () => {
    const accountId = uuidv7();
    await responseBody(await jsonRequest("/api/v1/financial-accounts", "POST", { operationId: uuidv7(), data: { id: accountId, name: "台幣帳戶", accountType: "BANK", currencyCode: "TWD", minorUnitScale: 0, institution: "", includeInNetWorth: true } }));
    for (const [kind, amount, date] of [["INCOME", 100_000, "2026-01-05"], ["EXPENSE", 40_000, "2026-01-12"], ["INCOME", 120_000, "2026-02-05"], ["EXPENSE", 50_000, "2026-02-12"]] as const) {
      await responseBody(await jsonRequest("/api/v1/transactions", "POST", { operationId: uuidv7(), data: { id: uuidv7(), transactionKind: kind, occurredOnLocalDate: date, occurredAt: null, timezone: "Asia/Taipei", accountId, counterpartyAccountId: null, categoryId: null, incomeSourceId: null, businessId: null, amountMinor: amount, currencyCode: "TWD", minorUnitScale: 0, note: "", evidenceRef: null, sourceType: "MANUAL" } }));
    }
    const usdAccountId = uuidv7();
    await responseBody(await jsonRequest("/api/v1/financial-accounts", "POST", { operationId: uuidv7(), data: { id: usdAccountId, name: "美元帳戶", accountType: "BANK", currencyCode: "USD", minorUnitScale: 2, institution: "", includeInNetWorth: true } }));
    await responseBody(await jsonRequest("/api/v1/transactions", "POST", { operationId: uuidv7(), data: { id: uuidv7(), transactionKind: "INCOME", occurredOnLocalDate: "2026-01-06", occurredAt: null, timezone: "Asia/Taipei", accountId: usdAccountId, counterpartyAccountId: null, categoryId: null, incomeSourceId: null, businessId: null, amountMinor: 1000, currencyCode: "USD", minorUnitScale: 2, note: "", evidenceRef: null, sourceType: "MANUAL" } }));
    const analysis = (await responseBody(await jsonRequest("/api/v1/finance/analysis?from=2026-01-01&to=2026-02-28"))).data as Record<string, unknown>;
    expect(analysis.monthly).toEqual([
      expect.objectContaining({ month: "2026-01", incomeMinor: 100_000, expenseMinor: 40_000, netCashFlowMinor: 60_000 }),
      expect.objectContaining({ month: "2026-02", incomeMinor: 120_000, expenseMinor: 50_000, netCashFlowMinor: 70_000 }),
    ]);
    expect((analysis.missingExchangeRates as unknown[])).toHaveLength(1);
    const seriesProvenance = analyticResultSchema.parse(analysis.seriesProvenance);
    expect(seriesProvenance).toEqual(expect.objectContaining({
      metricKey: "finance.cash_flow_series",
      formulaVersion: 1,
      quality: "INSUFFICIENT",
      sampleSize: 4,
      observationCount: 5,
      missingCount: 1,
      excludedCount: 1,
      aggregation: "SUM_INCOME_AND_EXPENSE_BY_PERIOD",
    }));
    expect(analyticResultSchema.parse(analysis.incomeBySourceProvenance)).toEqual(expect.objectContaining({ metricKey: "finance.income_by_source_series", sampleSize: 2, observationCount: 3, missingCount: 1 }));
    expect(analyticResultSchema.parse(analysis.expenseByCategoryProvenance)).toEqual(expect.objectContaining({ metricKey: "finance.expense_by_category", sampleSize: 2, observationCount: 2, missingCount: 0 }));
    const quarterly = (await responseBody(await jsonRequest(`/api/v1/finance/analysis?from=2026-01-01&to=2026-02-28&granularity=QUARTER&accountId=${accountId}`))).data as Record<string, unknown>;
    expect(quarterly.series).toEqual([expect.objectContaining({ month: "2026-Q1", incomeMinor: 220_000, expenseMinor: 90_000, netCashFlowMinor: 130_000, observationCount: 4 })]);
    const nominal = (await responseBody(await jsonRequest(`/api/v1/finance/analysis?from=2026-01-01&to=2026-02-28&currencyMode=NOMINAL&nominalCurrency=USD&accountId=${usdAccountId}`))).data as Record<string, unknown>;
    expect(nominal).toEqual(expect.objectContaining({ unit: "USD minor units", missingExchangeRates: [], series: [expect.objectContaining({ month: "2026-01", incomeMinor: 1000 })] }));
    for (const [date, amount] of [["2026-01-31", 500_000], ["2026-02-28", 560_000]] as const) {
      await responseBody(await jsonRequest("/api/v1/asset-snapshots", "POST", { operationId: uuidv7(), data: { id: uuidv7(), accountId, assetDefinitionId: null, observedAt: `${date}T04:00:00.000Z`, inputLocalDate: date, amountMinor: amount, currencyCode: "TWD", minorUnitScale: 0, fxRateId: null, reportedCashMinor: null, evidenceRef: null, sourceType: "MANUAL" } }));
    }
    const trend = (await responseBody(await jsonRequest("/api/v1/finance/net-worth-trend?from=2026-01-01&to=2026-02-28"))).data as Record<string, unknown>;
    expect(trend.points).toEqual([
      expect.objectContaining({ observedOn: "2026-01-31", valueMinorTwd: 500_000 }),
      expect.objectContaining({ observedOn: "2026-02-28", valueMinorTwd: 560_000 }),
    ]);
    expect(analyticResultSchema.parse(trend.result)).toEqual(expect.objectContaining({
      metricKey: "finance.net_worth_trend",
      value: "560000",
      unit: "TWD minor units",
      quality: "EXACT",
      observationCount: 2,
      aggregation: "LATEST_SNAPSHOT_PER_ACCOUNT_THEN_ASSET_SUM_MINUS_LIABILITY_SUM",
    }));
  });

  it("D1觀測經保存公式計算20／1000 × 100 = 2且除零回422", async () => {
    const definitions = [
      { id: uuidv7(), key: "api_conversions", name: "成交", unit: "count" },
      { id: uuidv7(), key: "api_impressions", name: "曝光", unit: "count" },
      { id: uuidv7(), key: "api_rate", name: "轉化率", unit: "percent" },
    ];
    for (const definition of definitions) await responseBody(await jsonRequest("/api/v1/metrics", "POST", { operationId: uuidv7(), data: { ...definition, valueType: "DECIMAL", role: "OUTCOME", domain: "social", areaId: null, businessId: null, recordingFrequency: "AD_HOC", sourcePolicy: "MANUAL", precision: 4 } }));
    for (const [definition, value] of [[definitions[0], "20"], [definitions[1], "1000"]] as const) await responseBody(await jsonRequest("/api/v1/metric-observations", "POST", { operationId: uuidv7(), data: { id: uuidv7(), metricDefinitionId: definition.id, observedAt: "2026-01-10T00:00:00.000Z", inputLocalDate: "2026-01-10", inputTimezone: "Asia/Taipei", valueDecimal: value, valueText: null, quality: "MANUAL", sourceRefType: null, sourceRefId: null, sourceType: "MANUAL" } }));
    const formulaId = uuidv7();
    await responseBody(await jsonRequest("/api/v1/formulas", "POST", { operationId: uuidv7(), data: { id: formulaId, metricDefinitionId: definitions[2].id, formulaVersion: 1, expression: "api_conversions / api_impressions * 100", window: { kind: "ABSOLUTE_RANGE" }, missingPolicy: "FAIL" } }));
    const calculated = (await responseBody(await jsonRequest(`/api/v1/formulas/${formulaId}/calculate`, "POST", { from: "2026-01-01T00:00:00.000Z", to: "2026-01-31T23:59:59.999Z" }))).data as Record<string, unknown>;
    expect(calculated.value).toBe("2"); expect(calculated.formulaVersion).toBe(1); expect(calculated.observationCount).toBe(2);
    for (const [definition, value] of [[definitions[0], "20"], [definitions[1], "0"]] as const) await responseBody(await jsonRequest("/api/v1/metric-observations", "POST", { operationId: uuidv7(), data: { id: uuidv7(), metricDefinitionId: definition.id, observedAt: "2026-02-10T00:00:00.000Z", inputLocalDate: "2026-02-10", inputTimezone: "Asia/Taipei", valueDecimal: value, valueText: null, quality: "MANUAL", sourceRefType: null, sourceRefId: null, sourceType: "MANUAL" } }));
    const zero = await jsonRequest(`/api/v1/formulas/${formulaId}/calculate`, "POST", { from: "2026-02-01T00:00:00.000Z", to: "2026-02-28T23:59:59.999Z" });
    expect(zero.status).toBe(422);
    expect(((await zero.json()) as { error: { code: string } }).error.code).toBe("FORMULA_DIVISION_BY_ZERO");
  });

  it("Firstrade重跑保留批次證據但正式活動不重複", async () => {
    const financialAccountId = uuidv7(); const brokerageAccountId = uuidv7();
    await responseBody(await jsonRequest("/api/v1/financial-accounts", "POST", { operationId: uuidv7(), data: { id: financialAccountId, name: "Firstrade USD", accountType: "BROKERAGE", currencyCode: "USD", minorUnitScale: 2, institution: "Firstrade", includeInNetWorth: true } }));
    await responseBody(await jsonRequest("/api/v1/brokerage-accounts", "POST", { operationId: uuidv7(), data: { id: brokerageAccountId, financialAccountId, providerKey: "firstrade", displayName: "主要帳戶", externalAccountHint: "末四碼1234" } }));
    const csv = "Date,Type,Amount,Currency,Transaction ID\n2026-01-01,BUY,-100.25,USD,t1\n2026-01-02,DIVIDEND,5.00,USD,t2\n";
    const profile = { date: "Date", type: "Type", amount: "Amount", currency: "Currency", transactionId: "Transaction ID", typeMap: { BUY: "BUY", DIVIDEND: "DIVIDEND" }, dateFormat: "AUTO", defaultCurrency: "USD", minorUnitScale: 2 };
    const upload = async (profileName: string) => { const form = new FormData(); form.set("operationId", uuidv7()); form.set("brokerageAccountId", brokerageAccountId); form.set("profileName", profileName); form.set("profile", JSON.stringify(profile)); form.set("file", new File([csv], "masked.csv", { type: "text/csv" })); return SELF.fetch("https://life-manager.test/api/v1/imports/firstrade", { method: "POST", body: form }); };
    const first = (await responseBody(await upload("fixture-profile"))).data as Record<string, unknown>;
    const second = (await responseBody(await upload("fixture-profile"))).data as Record<string, unknown>;
    expect(first).toEqual(expect.objectContaining({ totalRows: 2, importedRows: 2, duplicateRows: 0, errorRows: 0 }));
    expect(second).toEqual(expect.objectContaining({ totalRows: 2, importedRows: 0, duplicateRows: 2, errorRows: 0 }));
    expect(Number((await env.LIFE_DB.prepare("SELECT COUNT(*) AS count FROM brokerage_activity WHERE brokerage_account_id = ?").bind(brokerageAccountId).first<{ count: number }>())?.count)).toBe(2);
    expect(Number((await env.LIFE_DB.prepare("SELECT COUNT(*) AS count FROM import_batches WHERE account_id = ?").bind(brokerageAccountId).first<{ count: number }>())?.count)).toBe(2);
  });

  it("指標與社群CSV具後端預覽、原始證據、逐列驗證及跨批次去重", async () => {
    const metricId = uuidv7();
    await responseBody(await jsonRequest("/api/v1/metrics", "POST", { operationId: uuidv7(), data: { id: metricId, key: `csv_metric_${Date.now()}`, name: "CSV指標", unit: "count", valueType: "DECIMAL", role: "OUTCOME", domain: "test", areaId: null, businessId: null, recordingFrequency: "AD_HOC", sourcePolicy: "CSV", precision: 2 } }));
    const metricCsv = "observed_at,value\n2026-03-01T10:00:00+08:00,10\n2026-03-02T10:00:00+08:00,20\n";
    const metricUpload = async (preview = false) => { const form = new FormData(); form.set("operationId", uuidv7()); form.set("moduleKey", "metrics"); form.set("definitionId", metricId); form.set("profileName", "metric-fixture-v1"); form.set("mapping", JSON.stringify({ observedAt: "observed_at", value: "value" })); form.set("file", new File([metricCsv], "metric.csv", { type: "text/csv" })); return SELF.fetch(`https://life-manager.test/api/v1/imports/structured${preview ? "/preview" : ""}`, { method: "POST", body: form }); };
    const preview = (await responseBody(await metricUpload(true))).data as Record<string, unknown>;
    expect(preview).toEqual(expect.objectContaining({ totalRows: 2, headers: ["observed_at", "value"] }));
    const first = (await responseBody(await metricUpload())).data as Record<string, unknown>;
    const second = (await responseBody(await metricUpload())).data as Record<string, unknown>;
    expect(first).toEqual(expect.objectContaining({ importedRows: 2, duplicateRows: 0, errorRows: 0 }));
    expect(second).toEqual(expect.objectContaining({ importedRows: 0, duplicateRows: 2, errorRows: 0 }));
    expect(Number((await env.LIFE_DB.prepare("SELECT COUNT(*) AS count FROM metric_observations WHERE metric_definition_id = ? AND source_type = 'CSV_IMPORT'").bind(metricId).first<{ count: number }>())?.count)).toBe(2);

    const textMetricId = uuidv7();
    await responseBody(await jsonRequest("/api/v1/metrics", "POST", { operationId: uuidv7(), data: { id: textMetricId, key: `csv_text_${Date.now()}`, name: "CSV文字指標", unit: "text", valueType: "TEXT", role: "CONDITION", domain: "test", areaId: null, businessId: null, recordingFrequency: "AD_HOC", sourcePolicy: "CSV", precision: 0 } }));
    const textForm = new FormData();
    textForm.set("operationId", uuidv7()); textForm.set("moduleKey", "metrics"); textForm.set("definitionId", textMetricId); textForm.set("profileName", "metric-text-fixture-v1"); textForm.set("mapping", JSON.stringify({ observedAt: "observed_at", value: "value" })); textForm.set("file", new File(["observed_at,value\n2026-03-03T10:00:00+08:00,狀態穩定\n"], "metric-text.csv", { type: "text/csv" }));
    expect((await responseBody(await SELF.fetch("https://life-manager.test/api/v1/imports/structured", { method: "POST", body: textForm }))).data).toEqual(expect.objectContaining({ importedRows: 1, errorRows: 0 }));
    expect((await env.LIFE_DB.prepare("SELECT value_text FROM metric_observations WHERE metric_definition_id = ?").bind(textMetricId).first<{ value_text: string }>())?.value_text).toBe("狀態穩定");

    const youtubeId = String((await env.LIFE_DB.prepare("SELECT id FROM social_platforms WHERE key = 'youtube'").first<{ id: string }>())?.id);
    const socialAccountId = uuidv7(); const contentId = uuidv7(); const postId = uuidv7(); const socialMetricId = uuidv7(); const socialMetricKey = `csv_views_${Date.now()}`;
    await responseBody(await jsonRequest("/api/v1/social-accounts", "POST", { operationId: uuidv7(), data: { id: socialAccountId, platformId: youtubeId, displayName: "CSV測試帳號", externalAccountId: null, accountKind: "CHANNEL", timezone: "Asia/Taipei", sourceType: "MANUAL" } }));
    await responseBody(await jsonRequest("/api/v1/content-assets", "POST", { operationId: uuidv7(), data: { id: contentId, businessId: null, title: "CSV測試內容", description: "", topic: "測試", style: "教學", format: "VIDEO", lengthValue: null, lengthUnit: null, campaign: "" } }));
    await responseBody(await jsonRequest("/api/v1/platform-posts", "POST", { operationId: uuidv7(), data: { id: postId, contentAssetId: contentId, socialAccountId, externalPostId: null, permalink: null, platformFormat: "VIDEO", publishedAt: "2026-03-01T00:00:00.000Z", publishedTimezone: "Asia/Taipei", sourceType: "MANUAL" } }));
    await responseBody(await jsonRequest("/api/v1/social-metrics", "POST", { operationId: uuidv7(), data: { id: socialMetricId, platformId: youtubeId, metricKey: socialMetricKey, providerMetricName: "views", providerDefinition: "來源匯出觀看次數", providerDefinitionVersion: "fixture-v1", unit: "count", scope: "POST", isCumulative: true, comparableFamily: "views", sourceType: "MANUAL" } }));
    const socialCsv = `target_id,observed_at,value\n${postId},2026-03-02T00:00:00.000Z,1000\n`;
    const socialUpload = async () => { const form = new FormData(); form.set("operationId", uuidv7()); form.set("moduleKey", "social"); form.set("definitionId", socialMetricId); form.set("targetKind", "POST"); form.set("profileName", "social-fixture-v1"); form.set("mapping", JSON.stringify({ targetId: "target_id", observedAt: "observed_at", value: "value" })); form.set("file", new File([socialCsv], "social.csv", { type: "text/csv" })); return SELF.fetch("https://life-manager.test/api/v1/imports/structured", { method: "POST", body: form }); };
    expect((await responseBody(await socialUpload())).data).toEqual(expect.objectContaining({ importedRows: 1, duplicateRows: 0 }));
    expect((await responseBody(await socialUpload())).data).toEqual(expect.objectContaining({ importedRows: 0, duplicateRows: 1 }));
    expect(Number((await env.LIFE_DB.prepare("SELECT COUNT(*) AS count FROM social_metric_snapshots WHERE social_metric_definition_id = ? AND source_type = 'CSV_IMPORT'").bind(socialMetricId).first<{ count: number }>())?.count)).toBe(1);
    const content2Id = uuidv7(); const post2Id = uuidv7();
    await responseBody(await jsonRequest("/api/v1/content-assets", "POST", { operationId: uuidv7(), data: { id: content2Id, businessId: null, title: "CSV測試內容B", description: "", topic: "測試", style: "教學", format: "VIDEO", lengthValue: null, lengthUnit: null, campaign: "" } }));
    await responseBody(await jsonRequest("/api/v1/platform-posts", "POST", { operationId: uuidv7(), data: { id: post2Id, contentAssetId: content2Id, socialAccountId, externalPostId: null, permalink: null, platformFormat: "VIDEO", publishedAt: "2026-03-01T00:00:00.000Z", publishedTimezone: "Asia/Taipei", sourceType: "MANUAL" } }));
    await responseBody(await jsonRequest("/api/v1/social-snapshots", "POST", { operationId: uuidv7(), data: { id: uuidv7(), socialMetricDefinitionId: socialMetricId, socialAccountId: null, platformPostId: post2Id, observedAt: "2026-03-02T00:00:00.000Z", publishedAt: "2026-03-01T00:00:00.000Z", ageSeconds: 86400, valueDecimal: "3000", isCumulative: true, quality: "MANUAL", rawPayloadId: null, importRowId: null, sourceType: "MANUAL" } }));
    const conversionA = (await responseBody(await jsonRequest("/api/v1/conversions", "POST", { operationId: uuidv7(), data: { id: uuidv7(), platformPostId: postId, contentAssetId: contentId, campaign: null, confirmedAt: "2026-03-02T00:00:00.000Z", countValue: 20, amountMinor: null, currencyCode: null, minorUnitScale: null, attributionNote: "人工確認A", denominatorMetricKey: socialMetricKey, windowFromHours: 0, windowToHours: 24 } }))).data as Record<string, unknown>;
    await responseBody(await jsonRequest("/api/v1/conversions", "POST", { operationId: uuidv7(), data: { id: uuidv7(), platformPostId: post2Id, contentAssetId: content2Id, campaign: null, confirmedAt: "2026-03-02T00:00:00.000Z", countValue: 30, amountMinor: null, currencyCode: null, minorUnitScale: null, attributionNote: "人工確認B", denominatorMetricKey: socialMetricKey, windowFromHours: 0, windowToHours: 24 } }));
    const comparisonBefore = (await responseBody(await jsonRequest(`/api/v1/social/comparison?metricKey=${socialMetricKey}&from=2026-03-01T00:00:00.000Z&to=2026-03-03T00:00:00.000Z&toleranceMinutes=15`))).data as { groups: Array<Record<string, Record<string, unknown>>> };
    expect(comparisonBefore.groups[0].conversionRate.value).toBe("1.250000");
    await responseBody(await jsonRequest(`/api/v1/conversions/${conversionA.id}`, "PATCH", { operationId: uuidv7(), baseVersion: conversionA.version, data: { countValue: 40 } }));
    const comparisonAfter = (await responseBody(await jsonRequest(`/api/v1/social/comparison?metricKey=${socialMetricKey}&from=2026-03-01T00:00:00.000Z&to=2026-03-03T00:00:00.000Z&toleranceMinutes=15`))).data as { groups: Array<Record<string, Record<string, unknown>>> };
    expect(comparisonAfter.groups[0].conversions.value).toBe("70"); expect(comparisonAfter.groups[0].conversionRate.value).toBe("1.750000");
    const sumComparison = (await responseBody(await jsonRequest(`/api/v1/social/comparison?metricKey=${socialMetricKey}&from=2026-03-01T00:00:00.000Z&to=2026-03-03T00:00:00.000Z&toleranceMinutes=15&aggregation=SUM`))).data as { aggregation: string; groups: Array<Record<string, Record<string, unknown>>> };
    expect(sumComparison.aggregation).toBe("SUM"); expect(sumComparison.groups[0].exposure.value).toBe("4000");
    const distributionComparison = (await responseBody(await jsonRequest(`/api/v1/social/comparison?metricKey=${socialMetricKey}&from=2026-03-01T00:00:00.000Z&to=2026-03-03T00:00:00.000Z&toleranceMinutes=15&aggregation=DISTRIBUTION`))).data as { groups: Array<Record<string, Record<string, unknown>>> };
    expect(distributionComparison.groups[0].exposure.value).toBeNull(); expect(distributionComparison.groups[0].exposureDistribution).toEqual(expect.objectContaining({ minimum: "1000", median: "2000", maximum: "3000" }));
    const tagId = uuidv7(); await responseBody(await jsonRequest("/api/v1/tags", "POST", { operationId: uuidv7(), data: { id: tagId, name: "教學標籤", colorToken: "accent" } }));
    await responseBody(await jsonRequest("/api/v1/entity-tags", "POST", { operationId: uuidv7(), data: { entityType: "content_asset", entityId: contentId, tagId } }));
    const tagComparison = (await responseBody(await jsonRequest(`/api/v1/social/comparison?metricKey=${socialMetricKey}&from=2026-03-01T00:00:00.000Z&to=2026-03-03T00:00:00.000Z&toleranceMinutes=15&groupBy=tag&tag=${encodeURIComponent("教學標籤")}`))).data as { groupBy: string; filters: Record<string, unknown>; groups: Array<Record<string, unknown>> };
    expect(tagComparison).toEqual(expect.objectContaining({ groupBy: "tag", filters: expect.objectContaining({ tag: "教學標籤" }) })); expect(tagComparison.groups.map((group) => group.group)).toEqual(["教學標籤"]);
    await responseBody(await jsonRequest("/api/v1/comparison-definitions", "POST", { operationId: uuidv7(), data: { id: uuidv7(), name: "教學標籤首日", metricKey: socialMetricKey, aggregation: "MEAN", groupBy: ["tag"], filters: { tag: "教學標籤" }, windowFromHours: 0, windowToHours: 24, toleranceMinutes: 15 } }));
    await responseBody(await jsonRequest("/api/v1/saved-views", "POST", { operationId: uuidv7(), data: { id: uuidv7(), name: "教學標籤圖表", moduleKey: "social", filter: { metricKey: socialMetricKey, tag: "教學標籤" }, chart: { kind: "FIRST_DAY_COMPARISON", x: "tag", y: socialMetricKey } } }));
    expect(Number((await env.LIFE_DB.prepare("SELECT COUNT(*) AS count FROM import_files f JOIN import_batches b ON b.id = f.import_batch_id WHERE b.module_key IN ('metrics','social') AND f.raw_content_base64 IS NOT NULL").first<{ count: number }>())?.count)).toBeGreaterThanOrEqual(4);
  });

  it("期限範本固定最高級、W-8BEN確認日保留試算，報稅子任務不另啟通知", async () => {
    const invalid = await jsonRequest("/api/v1/deadlines", "POST", { operationId: uuidv7(), data: { id: uuidv7(), templateId: "system-template-tax", parentDeadlineId: null, name: "錯誤降級", institution: "", accountHint: "", actionableFromLocalDate: "2026-08-01", dueLocalDate: "2026-08-31", timezone: "Asia/Taipei", completionCondition: "完成申報", instructions: "", importance: "CRITICAL", status: "OPEN", completedAt: null, nextOccurrenceLocalDate: null, lastSignedLocalDate: null, calculatedDueLocalDate: null, confirmedDueLocalDate: null, calculationBasis: null } });
    expect(invalid.status).toBe(400);
    const parentId = uuidv7(); const childId = uuidv7();
    await responseBody(await jsonRequest("/api/v1/deadlines", "POST", { operationId: uuidv7(), data: { id: parentId, templateId: "system-template-w8ben", parentDeadlineId: null, name: "W-8BEN更新", institution: "Firstrade", accountHint: "末四碼1234", actionableFromLocalDate: "2026-08-01", dueLocalDate: null, timezone: "Asia/Taipei", completionCondition: "券商確認生效", instructions: "依官方介面", importance: "SUPER_CRITICAL", status: "OPEN", completedAt: null, nextOccurrenceLocalDate: null, lastSignedLocalDate: "2026-04-18", calculatedDueLocalDate: "2029-12-31", confirmedDueLocalDate: "2029-11-30", calculationBasis: "依簽署年度試算" } }));
    await responseBody(await jsonRequest("/api/v1/deadlines", "POST", { operationId: uuidv7(), data: { id: childId, templateId: null, parentDeadlineId: parentId, name: "整理報稅附件", institution: "", accountHint: "", actionableFromLocalDate: "2026-08-01", dueLocalDate: "2026-08-20", timezone: "Asia/Taipei", completionCondition: "附件齊備", instructions: "", importance: "CRITICAL", status: "OPEN", completedAt: null, nextOccurrenceLocalDate: null, lastSignedLocalDate: null, calculatedDueLocalDate: null, confirmedDueLocalDate: null, calculationBasis: null } }));
    const dashboard = (await responseBody(await jsonRequest("/api/v1/dashboard?today=2026-08-10"))).data as { deadlineWarnings: Array<Record<string, unknown>> };
    expect(dashboard.deadlineWarnings.map((item) => item.id)).toEqual([parentId]);
    const persisted = await env.LIFE_DB.prepare("SELECT calculated_due_local_date, confirmed_due_local_date FROM deadline_items WHERE id = ?").bind(parentId).first<{ calculated_due_local_date: string; confirmed_due_local_date: string }>();
    expect(persisted).toEqual({ calculated_due_local_date: "2029-12-31", confirmed_due_local_date: "2029-11-30" });
    await responseBody(await jsonRequest("/api/v1/deadline-completions", "POST", { operationId: uuidv7(), data: { id: uuidv7(), deadlineItemId: parentId, completedAt: "2026-08-10T01:00:00.000Z", note: "已完成", evidenceRef: null, nextOccurrenceLocalDate: null } }));
    const after = (await responseBody(await jsonRequest("/api/v1/dashboard?today=2026-08-10"))).data as { deadlineWarnings: Array<Record<string, unknown>> };
    expect(after.deadlineWarnings).toEqual([]);
  });

  it("Web Push訂閱以密文保存且每台裝置可獨立停用", async () => {
    const deviceA = uuidv7(); const deviceB = uuidv7();
    for (const [deviceId, label] of [[deviceA, "推播裝置A"], [deviceB, "推播裝置B"]]) {
      await responseBody(await jsonRequest("/api/v1/sync/devices", "POST", { operationId: uuidv7(), data: { id: deviceId, displayName: label, userAgentSummary: "worker-test" } }));
      await responseBody(await jsonRequest("/api/v1/push-subscriptions", "POST", { operationId: uuidv7(), data: { id: uuidv7(), deviceId, endpoint: `https://push.example.test/${deviceId}`, expirationTime: null, keys: { p256dh: "p256dh-test-value-with-sufficient-length", auth: "auth-test-value" }, userAgentSummary: "worker-test" } }));
    }
    const originalSubscriptionA = await env.LIFE_DB.prepare("SELECT id FROM push_subscriptions WHERE device_id = ?").bind(deviceA).first<{ id: string }>();
    await responseBody(await jsonRequest("/api/v1/sync/devices", "POST", { operationId: uuidv7(), data: { id: deviceA, displayName: "Computer", userAgentSummary: "desktop-browser" } }));
    const resubscribe = await responseBody(await jsonRequest("/api/v1/push-subscriptions", "POST", { operationId: uuidv7(), data: { id: uuidv7(), deviceId: deviceA, endpoint: `https://push.example.test/${deviceA}`, expirationTime: null, keys: { p256dh: "p256dh-test-value-with-sufficient-length", auth: "auth-test-value" }, userAgentSummary: "desktop-browser" } }));
    expect((resubscribe.data as Record<string, unknown>).id).toBe(originalSubscriptionA?.id);
    expect(Number((await env.LIFE_DB.prepare("SELECT COUNT(*) AS count FROM push_subscriptions WHERE device_id = ?").bind(deviceA).first<{ count: number }>())?.count)).toBe(1);
    const labelled = (await responseBody(await jsonRequest("/api/v1/push-subscriptions"))).data as Array<Record<string, unknown>>;
    expect(labelled).toEqual(expect.arrayContaining([expect.objectContaining({ device_id: deviceA, device_name: "Computer", status: "ACTIVE" })]));
    const updatedEndpoint = `https://push.example.test/${deviceA}/updated`;
    await responseBody(await jsonRequest("/api/v1/push-subscriptions", "POST", { operationId: uuidv7(), data: { id: uuidv7(), deviceId: deviceA, endpoint: updatedEndpoint, expirationTime: null, keys: { p256dh: "p256dh-test-value-with-sufficient-length", auth: "auth-test-value" }, userAgentSummary: "desktop-browser-updated" } }));
    expect(Number((await env.LIFE_DB.prepare("SELECT COUNT(*) AS count FROM push_subscriptions WHERE device_id = ?").bind(deviceA).first<{ count: number }>())?.count)).toBe(2);
    const encrypted = await env.LIFE_DB.prepare("SELECT endpoint_encrypted FROM push_subscriptions WHERE device_id = ? AND status = 'ACTIVE'").bind(deviceA).first<{ endpoint_encrypted: string }>();
    expect(encrypted?.endpoint_encrypted).not.toContain("push.example.test");
    expect(await decryptSecret(encrypted!.endpoint_encrypted, env.TOKEN_ENCRYPTION_KEY)).toBe(updatedEndpoint);
    await responseBody(await jsonRequest("/api/v1/push-subscriptions/disable", "POST", { operationId: uuidv7(), data: { deviceId: deviceA } }));
    expect(Number((await env.LIFE_DB.prepare("SELECT COUNT(*) AS count FROM push_subscriptions WHERE status = 'ACTIVE'").first<{ count: number }>())?.count)).toBe(1);
    expect((await env.LIFE_DB.prepare("SELECT enabled FROM notification_channels WHERE channel_kind = 'WEB_PUSH'").first<{ enabled: number }>())?.enabled).toBe(1);
    await responseBody(await jsonRequest("/api/v1/push-subscriptions/disable", "POST", { operationId: uuidv7(), data: { deviceId: deviceB } }));
    expect((await env.LIFE_DB.prepare("SELECT enabled, status FROM notification_channels WHERE channel_kind = 'WEB_PUSH'").first<{ enabled: number; status: string }>())).toEqual({ enabled: 0, status: "DISABLED" });
  });

  it("兩裝置離線批次形成衝突紀錄且可用明確合併版本解決", async () => {
    const deviceA = uuidv7(); const deviceB = uuidv7();
    for (const [id, name] of [[deviceA, "裝置A"], [deviceB, "裝置B"]]) {
      await responseBody(await jsonRequest("/api/v1/sync/devices", "POST", { operationId: uuidv7(), data: { id, displayName: name, userAgentSummary: "worker-test" } }));
    }
    const areaId = uuidv7();
    const baseData = { id: areaId, name: "同步領域", description: "", whyText: "原因", principlesText: "原則", strategyText: "初始", nextActionText: "下一步", lowClarityGuide: "指引", sortOrder: 0, sourceType: "MANUAL" };
    const create = await responseBody(await jsonRequest("/api/v1/sync/batch", "POST", { operations: [{ operationId: uuidv7(), deviceId: deviceA, entityType: "areas", entityId: areaId, kind: "UPSERT", baseVersion: null, payload: baseData, clientOccurredAt: "2026-08-02T00:00:00.000Z", schemaVersion: 1 }] }));
    expect(((create.data as { results: Array<Record<string, unknown>> }).results[0]).status).toBe("APPLIED");
    const operationA = uuidv7(); const operationB = uuidv7();
    const updateA = await responseBody(await jsonRequest("/api/v1/sync/batch", "POST", { operations: [{ operationId: operationA, deviceId: deviceA, entityType: "areas", entityId: areaId, kind: "UPSERT", baseVersion: 1, payload: { strategyText: "裝置A策略" }, clientOccurredAt: "2026-08-02T01:00:00.000Z", schemaVersion: 1 }] }));
    expect(((updateA.data as { results: Array<Record<string, unknown>> }).results[0]).resultVersion).toBe(2);
    const updateB = await responseBody(await jsonRequest("/api/v1/sync/batch", "POST", { operations: [{ operationId: operationB, deviceId: deviceB, entityType: "areas", entityId: areaId, kind: "UPSERT", baseVersion: 1, payload: { strategyText: "裝置B策略" }, clientOccurredAt: "2026-08-02T01:01:00.000Z", schemaVersion: 1 }] }));
    const conflict = (updateB.data as { results: Array<Record<string, unknown>> }).results[0];
    expect(conflict.status).toBe("CONFLICT");
    const conflictId = String(conflict.conflictId);
    const resolved = await responseBody(await jsonRequest(`/api/v1/sync/conflicts/${conflictId}/resolve`, "POST", { operationId: uuidv7(), data: { resolution: "MERGED", mergedPayload: { strategyText: "人工合併策略" } } }));
    const applied = ((resolved.data as { applied: { data: { results: Array<Record<string, unknown>> } } }).applied.data.results[0]);
    expect(applied.resultVersion).toBe(3);
    expect((await env.LIFE_DB.prepare("SELECT status FROM conflict_records WHERE id = ?").bind(conflictId).first<{ status: string }>())?.status).toBe("RESOLVED_MERGED");
    const changes = (await responseBody(await jsonRequest(`/api/v1/sync/changes?deviceId=${deviceA}&after=0`))).data as { changes: Array<Record<string, unknown>>; nextCursor: number };
    expect(changes.changes.filter((change) => change.entityId === areaId).at(-1)?.snapshot).toEqual(expect.objectContaining({ strategyText: "人工合併策略", version: 3 }));
    expect((await env.LIFE_DB.prepare("SELECT last_pulled_cursor FROM sync_cursors WHERE device_id = ?").bind(deviceA).first<{ last_pulled_cursor: number }>())?.last_pulled_cursor).toBe(changes.nextCursor);
  });

  it("真正刪除產生同步tombstone且離線舊版本不能復活資料", async () => {
    const deviceId = uuidv7(); await responseBody(await jsonRequest("/api/v1/sync/devices", "POST", { operationId: uuidv7(), data: { id: deviceId, displayName: "刪除測試裝置", userAgentSummary: "worker-test" } }));
    const metricId = uuidv7(); const observationId = uuidv7();
    await responseBody(await jsonRequest("/api/v1/metrics", "POST", { operationId: uuidv7(), data: { id: metricId, key: `delete_metric_${Date.now()}`, name: "刪除測試指標", unit: "count", valueType: "INTEGER", role: "ACTION", domain: "test", areaId: null, businessId: null, recordingFrequency: "AD_HOC", sourcePolicy: "MANUAL", precision: 0 } }));
    await responseBody(await jsonRequest("/api/v1/metric-observations", "POST", { operationId: uuidv7(), data: { id: observationId, metricDefinitionId: metricId, observedAt: "2026-08-02T00:00:00.000Z", inputLocalDate: "2026-08-02", inputTimezone: "Asia/Taipei", valueDecimal: "1", valueText: null, quality: "MANUAL", sourceRefType: null, sourceRefId: null, sourceType: "MANUAL" } }));
    await responseBody(await jsonRequest(`/api/v1/metric-observations/${observationId}/archive`, "POST", { operationId: uuidv7(), baseVersion: 1, data: {} }));
    expect((await env.LIFE_DB.prepare("SELECT deleted_at FROM metric_observations WHERE id = ?").bind(observationId).first<{ deleted_at: string | null }>())?.deleted_at).toBeTruthy();
    const stale = await responseBody(await jsonRequest("/api/v1/sync/batch", "POST", { operations: [{ operationId: uuidv7(), deviceId, entityType: "metric-observations", entityId: observationId, kind: "UPSERT", baseVersion: 1, payload: { valueDecimal: "999" }, clientOccurredAt: "2026-08-02T01:00:00.000Z", schemaVersion: 1 }] }));
    expect((stale.data as { results: Array<Record<string, unknown>> }).results[0].status).toBe("CONFLICT");
    const changes = (await responseBody(await jsonRequest(`/api/v1/sync/changes?deviceId=${deviceId}&after=0`))).data as { changes: Array<Record<string, unknown>> };
    expect(changes.changes.filter((change) => change.entityId === observationId).at(-1)).toEqual(expect.objectContaining({ kind: "DELETE", snapshot: expect.objectContaining({ deletedAt: expect.any(String), version: 2 }) }));
    expect((await env.LIFE_DB.prepare("SELECT value_decimal, deleted_at FROM metric_observations WHERE id = ?").bind(observationId).first<{ value_decimal: string; deleted_at: string | null }>())).toEqual(expect.objectContaining({ value_decimal: "1", deleted_at: expect.any(String) }));
  });
});
