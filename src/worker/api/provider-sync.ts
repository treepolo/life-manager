import { newId, nowIso } from "@/core/database/d1";
import { sha256 } from "@/core/crypto/secrets";
import { ApiError } from "@/core/errors/api-error";
import type { ProviderRawPayload } from "@/integrations/providers/contract";
import { SYSTEM_PLATFORM_IDS } from "@/modules/social/platforms";
import { connectionCredentials } from "@/worker/api/oauth";
import type { Env } from "@/worker/env";

interface RawWithId extends ProviderRawPayload { rawId: string }

async function storeRawPayloads(env: Env, providerKey: string, runId: string, payloads: ProviderRawPayload[]): Promise<RawWithId[]> {
  const stored: RawWithId[] = [];
  for (const payload of payloads) {
    const serialized = JSON.stringify(payload.payload);
    const digest = await sha256(serialized);
    const existing = await env.LIFE_DB.prepare(
      "SELECT id FROM provider_raw_payloads WHERE provider_key = ? AND payload_kind = ? AND sha256 = ?",
    ).bind(providerKey, payload.kind, digest).first<{ id: string }>();
    const rawId = existing?.id ?? newId();
    if (!existing) {
      await env.LIFE_DB.prepare(
        `INSERT INTO provider_raw_payloads
         (id, provider_key, sync_run_id, payload_kind, external_id, observed_at, sha256, payload_json, api_version, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(rawId, providerKey, runId, payload.kind, payload.externalId, payload.observedAt, digest,
        serialized, payload.apiVersion, nowIso()).run();
    }
    stored.push({ ...payload, rawId });
  }
  return stored;
}

async function ensureSocialAccount(input: {
  env: Env;
  providerKey: string;
  externalId: string;
  displayName: string;
  accountKind: "CHANNEL" | "PROFESSIONAL";
}): Promise<{ id: string; created: boolean }> {
  const platformId = input.providerKey === "youtube" ? SYSTEM_PLATFORM_IDS.youtube : SYSTEM_PLATFORM_IDS.instagram;
  const existing = await input.env.LIFE_DB.prepare(
    "SELECT id FROM social_accounts WHERE platform_id = ? AND external_account_id = ?",
  ).bind(platformId, input.externalId).first<{ id: string }>();
  if (existing) {
    await input.env.LIFE_DB.prepare(
      "UPDATE social_accounts SET display_name = ?, account_kind = ?, updated_at = ?, version = version + 1 WHERE id = ?",
    ).bind(input.displayName, input.accountKind, nowIso(), existing.id).run();
    return { id: existing.id, created: false };
  }
  const id = newId();
  const now = nowIso();
  await input.env.LIFE_DB.prepare(
    `INSERT INTO social_accounts
     (id, platform_id, display_name, external_account_id, account_kind, timezone, source_type, created_at, updated_at, version)
     VALUES (?, ?, ?, ?, ?, 'Asia/Taipei', ?, ?, ?, 1)`,
  ).bind(id, platformId, input.displayName, input.externalId, input.accountKind,
    input.providerKey === "youtube" ? "YOUTUBE_API" : "INSTAGRAM_API", now, now).run();
  return { id, created: true };
}

async function ensureMetricDefinition(input: {
  env: Env;
  platformId: string;
  metricKey: string;
  providerName: string;
  providerDefinition: string;
  version: string;
  scope: "ACCOUNT" | "POST";
  cumulative: boolean;
  sourceType: "YOUTUBE_API" | "INSTAGRAM_API";
}): Promise<string> {
  const existing = await input.env.LIFE_DB.prepare(
    "SELECT id FROM social_metric_definitions WHERE platform_id = ? AND metric_key = ? AND provider_definition_version = ?",
  ).bind(input.platformId, input.metricKey, input.version).first<{ id: string }>();
  if (existing) return existing.id;
  const id = newId();
  const now = nowIso();
  await input.env.LIFE_DB.prepare(
    `INSERT INTO social_metric_definitions
     (id, platform_id, metric_key, provider_metric_name, provider_definition, provider_definition_version,
      unit, scope, is_cumulative, comparable_family, source_type, created_at, updated_at, version)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, 1)`,
  ).bind(id, input.platformId, input.metricKey, input.providerName, input.providerDefinition, input.version,
    input.metricKey, input.scope, input.cumulative ? 1 : 0, input.sourceType, now, now).run();
  return id;
}

async function upsertPost(input: {
  env: Env;
  accountId: string;
  externalPostId: string;
  title: string;
  description: string;
  format: string;
  permalink: string | null;
  publishedAt: string;
  sourceType: "YOUTUBE_API" | "INSTAGRAM_API";
}): Promise<{ postId: string; contentAssetId: string; created: boolean }> {
  const existing = await input.env.LIFE_DB.prepare(
    "SELECT id, content_asset_id FROM platform_posts WHERE social_account_id = ? AND external_post_id = ?",
  ).bind(input.accountId, input.externalPostId).first<{ id: string; content_asset_id: string }>();
  const now = nowIso();
  if (existing) {
    await input.env.LIFE_DB.batch([
      input.env.LIFE_DB.prepare(
        "UPDATE content_assets SET title = ?, description = ?, format = ?, updated_at = ?, version = version + 1 WHERE id = ?",
      ).bind(input.title, input.description, input.format, now, existing.content_asset_id),
      input.env.LIFE_DB.prepare(
        "UPDATE platform_posts SET permalink = ?, platform_format = ?, published_at = ?, updated_at = ?, version = version + 1 WHERE id = ?",
      ).bind(input.permalink, input.format, input.publishedAt, now, existing.id),
    ]);
    return { postId: existing.id, contentAssetId: existing.content_asset_id, created: false };
  }
  const contentAssetId = newId();
  const postId = newId();
  await input.env.LIFE_DB.batch([
    input.env.LIFE_DB.prepare(
      `INSERT INTO content_assets
       (id, business_id, title, description, topic, style, format, campaign, source_type, created_at, updated_at, version)
       VALUES (?, NULL, ?, ?, '', '', ?, '', ?, ?, ?, 1)`,
    ).bind(contentAssetId, input.title, input.description, input.format, input.sourceType, now, now),
    input.env.LIFE_DB.prepare(
      `INSERT INTO platform_posts
       (id, content_asset_id, social_account_id, external_post_id, permalink, platform_format,
        published_at, published_timezone, source_type, created_at, updated_at, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'UTC', ?, ?, ?, 1)`,
    ).bind(postId, contentAssetId, input.accountId, input.externalPostId, input.permalink,
      input.format, input.publishedAt, input.sourceType, now, now),
  ]);
  return { postId, contentAssetId, created: true };
}

async function persistYouTube(env: Env, raw: RawWithId[]): Promise<{ created: number; updated: number }> {
  const channelRaw = raw.find((entry) => entry.kind === "channels");
  const channelBody = channelRaw?.payload as { items?: Array<{ id: string; snippet?: { title?: string } }> } | undefined;
  const channel = channelBody?.items?.[0];
  if (!channel) throw new ApiError(422, "PROVIDER_ERROR", "YouTube回應沒有頻道資料。");
  const account = await ensureSocialAccount({ env, providerKey: "youtube", externalId: channel.id, displayName: channel.snippet?.title ?? channel.id, accountKind: "CHANNEL" });
  let created = account.created ? 1 : 0;
  let updated = account.created ? 0 : 1;
  const videosRaw = raw.find((entry) => entry.kind === "videos");
  const videos = (videosRaw?.payload as { items?: Array<Record<string, unknown>> } | undefined)?.items ?? [];
  for (const video of videos) {
    const id = String(video.id);
    const snippet = video.snippet as { title?: string; description?: string; publishedAt?: string; categoryId?: string } | undefined;
    const statistics = video.statistics as Record<string, string> | undefined;
    const post = await upsertPost({
      env, accountId: account.id, externalPostId: id, title: snippet?.title ?? id,
      description: snippet?.description ?? "", format: "VIDEO", permalink: `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`,
      publishedAt: snippet?.publishedAt ?? videosRaw!.observedAt, sourceType: "YOUTUBE_API",
    });
    if (post.created) created++;
    else updated++;
    for (const [providerName, value] of Object.entries(statistics ?? {})) {
      if (!/^\d+$/.test(value)) continue;
      const metricKey = `youtube.${providerName.replace(/Count$/, "s").toLowerCase()}`;
      const definitionId = await ensureMetricDefinition({
        env, platformId: SYSTEM_PLATFORM_IDS.youtube, metricKey, providerName,
        providerDefinition: `YouTube Data API v3 videos.statistics.${providerName}; observed cumulative source value.`,
        version: "youtube-data-v3@2026-08-02", scope: "POST", cumulative: true, sourceType: "YOUTUBE_API",
      });
      const observedAt = videosRaw!.observedAt;
      const publishedAt = snippet?.publishedAt ?? observedAt;
      const ageSeconds = Math.max(0, Math.floor((Date.parse(observedAt) - Date.parse(publishedAt)) / 1000));
      await env.LIFE_DB.prepare(
        `INSERT OR IGNORE INTO social_metric_snapshots
         (id, social_metric_definition_id, social_account_id, platform_post_id, observed_at, published_at, age_seconds,
          value_decimal, is_cumulative, quality, raw_payload_id, source_type, created_at, updated_at, version)
         VALUES (?, ?, NULL, ?, ?, ?, ?, ?, 1, 'SOURCE_REPORTED', ?, 'YOUTUBE_API', ?, ?, 1)`,
      ).bind(newId(), definitionId, post.postId, observedAt, publishedAt, ageSeconds, value, videosRaw!.rawId, nowIso(), nowIso()).run();
    }
  }
  return { created, updated };
}

async function persistInstagram(env: Env, raw: RawWithId[]): Promise<{ created: number; updated: number }> {
  const profileRaw = raw.find((entry) => entry.kind === "profile");
  const profile = profileRaw?.payload as { id?: string; username?: string; name?: string } | undefined;
  if (!profile?.id) throw new ApiError(422, "PROVIDER_ERROR", "Instagram回應沒有專業帳號識別。");
  const account = await ensureSocialAccount({ env, providerKey: "instagram", externalId: profile.id, displayName: profile.username ?? profile.name ?? profile.id, accountKind: "PROFESSIONAL" });
  let created = account.created ? 1 : 0;
  let updated = account.created ? 0 : 1;
  const mediaRaw = raw.find((entry) => entry.kind === "media");
  const media = (mediaRaw?.payload as { data?: Array<Record<string, unknown>> } | undefined)?.data ?? [];
  const postIds = new Map<string, { postId: string; publishedAt: string }>();
  for (const item of media) {
    const id = String(item.id);
    const format = String(item.media_product_type ?? item.media_type ?? "MEDIA");
    const caption = typeof item.caption === "string" ? item.caption : "";
    const publishedAt = String(item.timestamp ?? mediaRaw!.observedAt);
    const post = await upsertPost({
      env, accountId: account.id, externalPostId: id, title: caption.slice(0, 240) || `${format} ${id}`,
      description: caption, format, permalink: typeof item.permalink === "string" ? item.permalink : null,
      publishedAt, sourceType: "INSTAGRAM_API",
    });
    if (post.created) created++;
    else updated++;
    postIds.set(id, { postId: post.postId, publishedAt });
  }
  for (const insightsRaw of raw.filter((entry) => entry.kind === "media_insights")) {
    const post = insightsRaw.externalId ? postIds.get(insightsRaw.externalId) : null;
    if (!post) continue;
    const metrics = (insightsRaw.payload as { data?: Array<Record<string, unknown>> }).data ?? [];
    for (const metric of metrics) {
      const providerName = String(metric.name);
      const metricKey = `instagram.${providerName}`;
      const definitionId = await ensureMetricDefinition({
        env, platformId: SYSTEM_PLATFORM_IDS.instagram, metricKey, providerName,
        providerDefinition: String(metric.description ?? metric.title ?? providerName),
        version: `instagram-${insightsRaw.apiVersion}@2026-08-02`, scope: "POST", cumulative: true, sourceType: "INSTAGRAM_API",
      });
      const values = Array.isArray(metric.values) ? metric.values as Array<{ value?: unknown }> : [];
      const rawValue = values.at(-1)?.value ?? metric.value;
      if (typeof rawValue !== "number" && typeof rawValue !== "string") continue;
      const ageSeconds = Math.max(0, Math.floor((Date.parse(insightsRaw.observedAt) - Date.parse(post.publishedAt)) / 1000));
      await env.LIFE_DB.prepare(
        `INSERT OR IGNORE INTO social_metric_snapshots
         (id, social_metric_definition_id, social_account_id, platform_post_id, observed_at, published_at, age_seconds,
          value_decimal, is_cumulative, quality, raw_payload_id, source_type, created_at, updated_at, version)
         VALUES (?, ?, NULL, ?, ?, ?, ?, ?, 1, 'SOURCE_REPORTED', ?, 'INSTAGRAM_API', ?, ?, 1)`,
      ).bind(newId(), definitionId, post.postId, insightsRaw.observedAt, post.publishedAt, ageSeconds,
        String(rawValue), insightsRaw.rawId, nowIso(), nowIso()).run();
    }
  }
  return { created, updated };
}

export async function syncProviderConnection(input: {
  env: Env;
  connectionId: string;
  triggerKind: "MANUAL" | "SCHEDULED" | "RETRY";
  requestId: string;
  from: string;
  to: string;
}): Promise<Record<string, unknown>> {
  const { provider, credentials } = await connectionCredentials(input.env, input.connectionId);
  const runId = newId();
  const startedAt = nowIso();
  await input.env.LIFE_DB.prepare(
    `INSERT INTO provider_sync_runs
     (id, provider_key, connection_id, trigger_kind, status, started_at, fetched_count, created_count,
      updated_count, ignored_count, error_count, request_id, created_at)
     VALUES (?, ?, ?, ?, 'RUNNING', ?, 0, 0, 0, 0, 0, ?, ?)`,
  ).bind(runId, provider.key, input.connectionId, input.triggerKind, startedAt, input.requestId, startedAt).run();
  try {
    const payloads = [
      ...(await provider.fetchAccounts(credentials)),
      ...(await provider.fetchContent(credentials)),
      ...(await provider.fetchMetrics(credentials, { from: input.from, to: input.to })),
    ];
    const stored = await storeRawPayloads(input.env, provider.key, runId, payloads);
    const counts = provider.key === "youtube" ? await persistYouTube(input.env, stored) : await persistInstagram(input.env, stored);
    const completedAt = nowIso();
    await input.env.LIFE_DB.batch([
      input.env.LIFE_DB.prepare(
        `UPDATE provider_sync_runs SET status = 'SUCCEEDED', completed_at = ?, fetched_count = ?,
         created_count = ?, updated_count = ? WHERE id = ?`,
      ).bind(completedAt, payloads.length, counts.created, counts.updated, runId),
      input.env.LIFE_DB.prepare(
        "UPDATE provider_connections SET status = 'CONNECTED', last_attempt_at = ?, last_success_at = ?, last_error_code = NULL, last_error_message_redacted = NULL, updated_at = ?, version = version + 1 WHERE id = ?",
      ).bind(completedAt, completedAt, completedAt, input.connectionId),
    ]);
    return { runId, providerKey: provider.key, status: "SUCCEEDED", fetchedCount: payloads.length, ...counts };
  } catch (error) {
    const code = error instanceof ApiError ? error.code : "PROVIDER_ERROR";
    const status = error instanceof ApiError && error.status === 401 ? "NEEDS_REAUTH" : "ERROR";
    const completedAt = nowIso();
    await input.env.LIFE_DB.batch([
      input.env.LIFE_DB.prepare(
        "UPDATE provider_sync_runs SET status = 'FAILED', completed_at = ?, error_count = 1, error_code = ?, error_message_redacted = ? WHERE id = ?",
      ).bind(completedAt, code, error instanceof Error ? error.message.slice(0, 240) : "同步失敗", runId),
      input.env.LIFE_DB.prepare(
        "UPDATE provider_connections SET status = ?, last_attempt_at = ?, last_error_code = ?, last_error_message_redacted = ?, updated_at = ?, version = version + 1 WHERE id = ?",
      ).bind(status, completedAt, code, error instanceof Error ? error.message.slice(0, 240) : "同步失敗", completedAt, input.connectionId),
    ]);
    throw error;
  }
}
