import { newId, nowIso } from "@/core/database/d1";
import { ApiError } from "@/core/errors/api-error";
import { INSTAGRAM_MEDIA_INSIGHTS_PER_RUN, instagramMetricDefinitionVersion } from "@/integrations/instagram/provider";
import type { ProviderRawPayload } from "@/integrations/providers/contract";
import { SYSTEM_PLATFORM_IDS } from "@/modules/social/platforms";
import { connectionCredentials, refreshConnectionCredentialsIfNeeded } from "@/worker/api/oauth";
import { commitD1AdmissionBudget, createProviderRequestGuard, reserveD1AdmissionBudget } from "@/modules/cost-guardrail/service";
import { d1SyncAdmissionEstimate } from "@/modules/cost-guardrail/contracts";
import { prepareRawPayloadWrites, type RawWithId } from "@/worker/api/provider-raw";
import type { Env } from "@/worker/env";

export type { RawWithId } from "@/worker/api/provider-raw";

const YOUTUBE_DAILY_METRICS = ["views", "likes", "comments"] as const;
const D1_WRITE_BATCH_SIZE = 100;
const PROVIDER_SYNC_STALE_MS = 10 * 60 * 1000;

export interface YouTubeDailyMetricPoint {
  day: string;
  metric: typeof YOUTUBE_DAILY_METRICS[number];
  value: string;
  observedAt: string;
}

export interface InstagramMediaInsightSelection {
  selectedIds: string[];
  skippedCount: number;
}

export async function selectInstagramMediaInsightIds(
  env: Env,
  content: ProviderRawPayload[],
  limit = INSTAGRAM_MEDIA_INSIGHTS_PER_RUN,
): Promise<InstagramMediaInsightSelection> {
  const mediaPayload = content.find((entry) => entry.kind === "media")?.payload as {
    data?: Array<{ id?: unknown }>;
  } | undefined;
  const seen = new Set<string>();
  const candidates = (mediaPayload?.data ?? []).flatMap((media, index) => {
    const id = typeof media.id === "string" ? media.id : "";
    if (!id || seen.has(id)) return [];
    seen.add(id);
    return [{ id, index }];
  });
  const boundedLimit = Math.max(0, Math.min(Math.trunc(limit), INSTAGRAM_MEDIA_INSIGHTS_PER_RUN));
  if (candidates.length <= boundedLimit) {
    return { selectedIds: candidates.map((candidate) => candidate.id), skippedCount: 0 };
  }
  if (boundedLimit === 0) return { selectedIds: [], skippedCount: candidates.length };

  const placeholders = candidates.map(() => "?").join(", ");
  const previous = await env.LIFE_DB.prepare(
    `SELECT pp.external_post_id, MAX(s.observed_at) AS last_observed_at
     FROM platform_posts pp
     JOIN social_accounts sa ON sa.id = pp.social_account_id
     LEFT JOIN social_metric_snapshots s ON s.platform_post_id = pp.id
     WHERE sa.platform_id = ? AND pp.external_post_id IN (${placeholders})
     GROUP BY pp.external_post_id`,
  ).bind(SYSTEM_PLATFORM_IDS.instagram, ...candidates.map((candidate) => candidate.id))
    .all<{ external_post_id: string; last_observed_at: string | null }>();
  const lastObservedAt = new Map(previous.results.map((row) => [row.external_post_id, row.last_observed_at]));
  const selectedIds = [...candidates]
    .sort((left, right) => {
      const leftObserved = lastObservedAt.get(left.id) ?? null;
      const rightObserved = lastObservedAt.get(right.id) ?? null;
      if (leftObserved === null && rightObserved !== null) return -1;
      if (leftObserved !== null && rightObserved === null) return 1;
      if (leftObserved !== rightObserved) return String(leftObserved).localeCompare(String(rightObserved));
      return left.index - right.index;
    })
    .slice(0, boundedLimit)
    .map((candidate) => candidate.id);
  return { selectedIds, skippedCount: candidates.length - selectedIds.length };
}

export async function runD1WriteBatches(env: Env, statements: D1PreparedStatement[]): Promise<void> {
  for (let offset = 0; offset < statements.length; offset += D1_WRITE_BATCH_SIZE) {
    await env.LIFE_DB.batch(statements.slice(offset, offset + D1_WRITE_BATCH_SIZE));
  }
}

export async function recoverStaleProviderSyncs(env: Env, now: Date, connectionId: string | null = null): Promise<void> {
  const completedAt = now.toISOString();
  const staleBefore = new Date(now.getTime() - PROVIDER_SYNC_STALE_MS).toISOString();
  await env.LIFE_DB.batch([
    env.LIFE_DB.prepare(
      `UPDATE provider_sync_runs
       SET status = 'FAILED', completed_at = ?, error_count = 1, error_code = 'SYNC_INTERRUPTED',
           error_message_redacted = '同步執行中斷，可安全重試。'
       WHERE status = 'RUNNING' AND started_at <= ? AND (? IS NULL OR connection_id = ?)`,
    ).bind(completedAt, staleBefore, connectionId, connectionId),
    env.LIFE_DB.prepare(
      `UPDATE provider_sync_jobs
       SET status = CASE WHEN attempt + 1 >= max_attempts THEN 'DEAD_LETTER' ELSE 'RETRY' END,
           attempt = MIN(attempt + 1, max_attempts), next_run_at = ?, last_error_code = 'SYNC_INTERRUPTED', updated_at = ?
       WHERE status = 'RUNNING' AND updated_at <= ? AND (? IS NULL OR connection_id = ?)`,
    ).bind(completedAt, completedAt, staleBefore, connectionId, connectionId),
  ]);
}

export async function claimManualProviderSyncJob(env: Env, connectionId: string, now: string): Promise<boolean> {
  const result = await env.LIFE_DB.prepare(
    `UPDATE provider_sync_jobs SET status = 'RUNNING', updated_at = ?
     WHERE connection_id = ? AND status IN ('READY','RETRY','PAUSED','DEAD_LETTER')`,
  ).bind(now, connectionId).run();
  return Number(result.meta.changes ?? 0) === 1;
}

function pacificParts(instant: Date): Record<string, string> {
  return Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
}

export function youtubePacificDayStart(day: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || new Date(`${day}T00:00:00.000Z`).toISOString().slice(0, 10) !== day) {
    throw new ApiError(502, "PROVIDER_ERROR", "YouTube Analytics回傳無效日期。");
  }
  const [year, month, date] = day.split("-").map(Number);
  const desiredWallTime = Date.UTC(year, month - 1, date, 0, 0, 0);
  let instant = desiredWallTime + 8 * 60 * 60 * 1000;
  for (let attempt = 0; attempt < 3; attempt++) {
    const parts = pacificParts(new Date(instant));
    const renderedWallTime = Date.UTC(
      Number(parts.year), Number(parts.month) - 1, Number(parts.day),
      Number(parts.hour), Number(parts.minute), Number(parts.second),
    );
    instant += desiredWallTime - renderedWallTime;
  }
  const verified = pacificParts(new Date(instant));
  if (`${verified.year}-${verified.month}-${verified.day}` !== day || verified.hour !== "00") {
    throw new ApiError(502, "PROVIDER_ERROR", "YouTube Analytics日期無法轉換為Pacific日界。");
  }
  return new Date(instant).toISOString();
}

export function youtubeAnalyticsDailyPoints(payload: unknown): YouTubeDailyMetricPoint[] {
  const body = payload as { columnHeaders?: Array<{ name?: unknown }>; rows?: unknown[] };
  const headerNames = (body.columnHeaders ?? []).map((header) => String(header.name ?? ""));
  const dayIndex = headerNames.indexOf("day");
  const metricIndexes = YOUTUBE_DAILY_METRICS.map((metric) => ({ metric, index: headerNames.indexOf(metric) }));
  if (dayIndex < 0 || metricIndexes.some((entry) => entry.index < 0)) {
    throw new ApiError(502, "PROVIDER_ERROR", "YouTube Analytics回應缺少必要日指標欄位。");
  }
  const points: YouTubeDailyMetricPoint[] = [];
  for (const sourceRow of body.rows ?? []) {
    if (!Array.isArray(sourceRow)) throw new ApiError(502, "PROVIDER_ERROR", "YouTube Analytics回應列格式無效。");
    const day = String(sourceRow[dayIndex] ?? "");
    const observedAt = youtubePacificDayStart(day);
    for (const { metric, index } of metricIndexes) {
      const rawValue = sourceRow[index];
      const value = typeof rawValue === "number" && Number.isFinite(rawValue)
        ? String(rawValue)
        : typeof rawValue === "string" && /^-?\d+(?:\.\d+)?$/.test(rawValue) ? rawValue : null;
      if (value === null) throw new ApiError(502, "PROVIDER_ERROR", `YouTube Analytics ${metric}值無效。`);
      points.push({ day, metric, value, observedAt });
    }
  }
  return points;
}

export async function storeRawPayloads(env: Env, providerKey: string, runId: string, payloads: ProviderRawPayload[]): Promise<RawWithId[]> {
  const prepared = await prepareRawPayloadWrites(env, providerKey, runId, payloads);
  await runD1WriteBatches(env, prepared.statements);
  return prepared.stored;
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

export async function persistYouTube(env: Env, raw: RawWithId[]): Promise<{ created: number; updated: number }> {
  const channelRaw = raw.find((entry) => entry.kind === "channels");
  const channelBody = channelRaw?.payload as { items?: Array<{ id: string; snippet?: { title?: string } }> } | undefined;
  const channel = channelBody?.items?.[0];
  if (!channel) throw new ApiError(422, "PROVIDER_ERROR", "YouTube回應沒有頻道資料。");
  const account = await ensureSocialAccount({ env, providerKey: "youtube", externalId: channel.id, displayName: channel.snippet?.title ?? channel.id, accountKind: "CHANNEL" });
  let created = account.created ? 1 : 0;
  let updated = account.created ? 0 : 1;
  const metricDefinitions = new Map<string, string>();
  const snapshotStatements: D1PreparedStatement[] = [];
  for (const videosRaw of raw.filter((entry) => entry.kind === "videos")) {
    const videos = (videosRaw.payload as { items?: Array<Record<string, unknown>> }).items ?? [];
    for (const video of videos) {
      const id = String(video.id);
      const snippet = video.snippet as { title?: string; description?: string; publishedAt?: string; categoryId?: string } | undefined;
      const statistics = video.statistics as Record<string, string> | undefined;
      const post = await upsertPost({
        env, accountId: account.id, externalPostId: id, title: snippet?.title ?? id,
        description: snippet?.description ?? "", format: "VIDEO", permalink: `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`,
        publishedAt: snippet?.publishedAt ?? videosRaw.observedAt, sourceType: "YOUTUBE_API",
      });
      if (post.created) created++;
      else updated++;
      for (const [providerName, value] of Object.entries(statistics ?? {})) {
        if (!/^\d+$/.test(value)) continue;
        const metricKey = `youtube.${providerName.replace(/Count$/, "s").toLowerCase()}`;
        const definitionCacheKey = `youtube-data-v3@2026-08-09:${metricKey}`;
        let definitionId = metricDefinitions.get(definitionCacheKey);
        if (!definitionId) {
          definitionId = await ensureMetricDefinition({
            env, platformId: SYSTEM_PLATFORM_IDS.youtube, metricKey, providerName,
            providerDefinition: `YouTube Data API v3 videos.statistics.${providerName}; observed cumulative source value.`,
            version: "youtube-data-v3@2026-08-09", scope: "POST", cumulative: true, sourceType: "YOUTUBE_API",
          });
          metricDefinitions.set(definitionCacheKey, definitionId);
        }
        const observedAt = videosRaw.observedAt;
        const publishedAt = snippet?.publishedAt ?? observedAt;
        const ageSeconds = Math.max(0, Math.floor((Date.parse(observedAt) - Date.parse(publishedAt)) / 1000));
        snapshotStatements.push(env.LIFE_DB.prepare(
          `INSERT OR IGNORE INTO social_metric_snapshots
           (id, social_metric_definition_id, social_account_id, platform_post_id, observed_at, published_at, age_seconds,
            value_decimal, is_cumulative, quality, raw_payload_id, source_type, created_at, updated_at, version)
           VALUES (?, ?, NULL, ?, ?, ?, ?, ?, 1, 'SOURCE_REPORTED', ?, 'YOUTUBE_API', ?, ?, 1)`,
        ).bind(newId(), definitionId, post.postId, observedAt, publishedAt, ageSeconds, value, videosRaw.rawId, nowIso(), nowIso()));
      }
    }
  }
  for (const analyticsRaw of raw.filter((entry) => entry.kind === "analytics")) {
    for (const point of youtubeAnalyticsDailyPoints(analyticsRaw.payload)) {
      const metricKey = `youtube.analytics.daily.${point.metric}`;
      const definitionCacheKey = `youtube-analytics-v2-channel-daily@2026-08-09:${metricKey}`;
      let definitionId = metricDefinitions.get(definitionCacheKey);
      if (!definitionId) {
        definitionId = await ensureMetricDefinition({
          env,
          platformId: SYSTEM_PLATFORM_IDS.youtube,
          metricKey,
          providerName: point.metric,
          providerDefinition: `YouTube Analytics API v2 channel time-based report; dimensions=day; metric=${point.metric}; source day is 00:00–23:59 America/Los_Angeles (UTC-7/UTC-8); source-reported signed interval value, not cumulative.`,
          version: "youtube-analytics-v2-channel-daily@2026-08-09",
          scope: "ACCOUNT",
          cumulative: false,
          sourceType: "YOUTUBE_API",
        });
        metricDefinitions.set(definitionCacheKey, definitionId);
      }
      snapshotStatements.push(env.LIFE_DB.prepare(
        `INSERT OR IGNORE INTO social_metric_snapshots
         (id, social_metric_definition_id, social_account_id, platform_post_id, observed_at, published_at, age_seconds,
          value_decimal, is_cumulative, quality, raw_payload_id, source_type, created_at, updated_at, version)
         VALUES (?, ?, ?, NULL, ?, NULL, NULL, ?, 0, 'SOURCE_REPORTED', ?, 'YOUTUBE_API', ?, ?, 1)`,
      ).bind(newId(), definitionId, account.id, point.observedAt, point.value, analyticsRaw.rawId, nowIso(), nowIso()));
    }
  }
  await runD1WriteBatches(env, snapshotStatements);
  return { created, updated };
}

export async function persistInstagram(env: Env, raw: RawWithId[]): Promise<{ created: number; updated: number }> {
  const profileRaw = raw.find((entry) => entry.kind === "profile");
  const profile = profileRaw?.payload as { user_id?: string | number; username?: string; name?: string } | undefined;
  const profileUserId = profile?.user_id === undefined ? "" : String(profile.user_id);
  if (!profileUserId) throw new ApiError(422, "PROVIDER_ERROR", "Instagram回應沒有專業帳號識別。");
  const account = await ensureSocialAccount({ env, providerKey: "instagram", externalId: profileUserId, displayName: profile?.username ?? profile?.name ?? profileUserId, accountKind: "PROFESSIONAL" });
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
        version: instagramMetricDefinitionVersion(insightsRaw.apiVersion), scope: "POST", cumulative: true, sourceType: "INSTAGRAM_API",
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
  const { provider, credentials: storedCredentials } = await connectionCredentials(input.env, input.connectionId);
  if (input.triggerKind === "MANUAL") await recoverStaleProviderSyncs(input.env, new Date(), input.connectionId);
  const runId = newId();
  const startedAt = nowIso();
  await input.env.LIFE_DB.prepare(
    `INSERT INTO provider_sync_runs
     (id, provider_key, connection_id, trigger_kind, status, started_at, fetched_count, created_count,
      updated_count, ignored_count, error_count, request_id, created_at)
     VALUES (?, ?, ?, ?, 'RUNNING', ?, 0, 0, 0, 0, 0, ?, ?)`,
  ).bind(runId, provider.key, input.connectionId, input.triggerKind, startedAt, input.requestId, startedAt).run();
  if (input.triggerKind === "MANUAL" && !(await claimManualProviderSyncJob(input.env, input.connectionId, startedAt))) {
    await input.env.LIFE_DB.prepare(
      `UPDATE provider_sync_runs SET status = 'FAILED', completed_at = ?, error_count = 1,
       error_code = 'PROVIDER_SYNC_IN_PROGRESS', error_message_redacted = '此連線已有同步正在執行。' WHERE id = ?`,
    ).bind(nowIso(), runId).run();
    throw new ApiError(409, "PROVIDER_SYNC_IN_PROGRESS", "此連線已有同步正在執行。");
  }
  try {
    const credentials = await refreshConnectionCredentialsIfNeeded({
      env: input.env,
      connectionId: input.connectionId,
      provider,
      credentials: storedCredentials,
    });
    const requestGuard = createProviderRequestGuard({ env: input.env, operationId: `provider-sync:${runId}`, requestId: input.requestId });
    const accountPayloads = await provider.fetchAccounts(credentials, requestGuard);
    const contentPayloads = await provider.fetchContent(credentials, requestGuard);
    const instagramSelection = provider.key === "instagram"
      ? await selectInstagramMediaInsightIds(input.env, contentPayloads)
      : { selectedIds: [] as string[], skippedCount: 0 };
    const metricPayloads = await provider.fetchMetrics(credentials, {
      from: input.from,
      to: input.to,
      content: contentPayloads,
      ...(provider.key === "instagram" ? { selectedContentExternalIds: instagramSelection.selectedIds } : {}),
      requestGuard,
    });
    const payloads = [...accountPayloads, ...contentPayloads, ...metricPayloads];
    const estimate = d1SyncAdmissionEstimate({
      payloadCount: payloads.length,
      payloadBytes: new TextEncoder().encode(JSON.stringify(payloads)).length,
      derivedMetricCount: metricPayloads.length,
    });
    const d1Budget = await reserveD1AdmissionBudget({
      env: input.env, operationId: `provider-sync:${runId}:persistence`, requestId: input.requestId,
      rowsRead: estimate.rowsRead, rowsWritten: estimate.rowsWritten, storageBytes: estimate.storageBytes,
    });
    let d1BudgetSettled = false;
    let stored: RawWithId[];
    let counts: { created: number; updated: number };
    try {
      stored = await storeRawPayloads(input.env, provider.key, runId, payloads);
      counts = provider.key === "youtube" ? await persistYouTube(input.env, stored) : await persistInstagram(input.env, stored);
      await commitD1AdmissionBudget({ env: input.env, reservations: d1Budget, succeeded: true });
      d1BudgetSettled = true;
    } catch (persistenceError) {
      if (!d1BudgetSettled) {
        try { await commitD1AdmissionBudget({ env: input.env, reservations: d1Budget, succeeded: false }); } catch { /* preserve original error */ }
      }
      throw persistenceError;
    }
    const completedAt = nowIso();
    const configuredInterval = Number(input.env.PROVIDER_SYNC_INTERVAL_HOURS ?? "6");
    const intervalHours = Number.isFinite(configuredInterval) && configuredInterval > 0 ? configuredInterval : 6;
    const nextRunAt = new Date(Date.parse(completedAt) + intervalHours * 60 * 60 * 1000).toISOString();
    await input.env.LIFE_DB.batch([
      input.env.LIFE_DB.prepare(
        `UPDATE provider_sync_runs SET status = 'SUCCEEDED', completed_at = ?, fetched_count = ?,
         created_count = ?, updated_count = ?, ignored_count = ? WHERE id = ?`,
      ).bind(completedAt, payloads.length, counts.created, counts.updated, instagramSelection.skippedCount, runId),
      input.env.LIFE_DB.prepare(
        "UPDATE provider_connections SET status = 'CONNECTED', last_attempt_at = ?, last_success_at = ?, last_error_code = NULL, last_error_message_redacted = NULL, provider_definition_version = ?, updated_at = ?, version = version + 1 WHERE id = ?",
      ).bind(completedAt, completedAt, provider.definitionVersion, completedAt, input.connectionId),
      input.env.LIFE_DB.prepare(
        "UPDATE provider_sync_jobs SET status = 'READY', attempt = 0, next_run_at = ?, last_error_code = NULL, updated_at = ? WHERE connection_id = ?",
      ).bind(nextRunAt, completedAt, input.connectionId),
    ]);
    return {
      runId,
      providerKey: provider.key,
      status: "SUCCEEDED",
      fetchedCount: payloads.length,
      ignoredCount: instagramSelection.skippedCount,
      ...counts,
    };
  } catch (error) {
    const code = error instanceof ApiError ? error.code : "PROVIDER_ERROR";
    const status = error instanceof ApiError && error.status === 401 ? "NEEDS_REAUTH" : "ERROR";
    const completedAt = nowIso();
    const failureStatements: D1PreparedStatement[] = [
      input.env.LIFE_DB.prepare(
        "UPDATE provider_sync_runs SET status = 'FAILED', completed_at = ?, error_count = 1, error_code = ?, error_message_redacted = ? WHERE id = ?",
      ).bind(completedAt, code, error instanceof Error ? error.message.slice(0, 240) : "同步失敗", runId),
      input.env.LIFE_DB.prepare(
        "UPDATE provider_connections SET status = ?, last_attempt_at = ?, last_error_code = ?, last_error_message_redacted = ?, updated_at = ?, version = version + 1 WHERE id = ?",
      ).bind(status, completedAt, code, error instanceof Error ? error.message.slice(0, 240) : "同步失敗", completedAt, input.connectionId),
    ];
    if (input.triggerKind === "MANUAL") {
      const retryAt = new Date(Date.parse(completedAt) + 60_000).toISOString();
      failureStatements.push(status === "NEEDS_REAUTH"
        ? input.env.LIFE_DB.prepare(
          "UPDATE provider_sync_jobs SET status = 'PAUSED', last_error_code = ?, updated_at = ? WHERE connection_id = ?",
        ).bind(code, completedAt, input.connectionId)
        : input.env.LIFE_DB.prepare(
          `UPDATE provider_sync_jobs
           SET status = CASE WHEN attempt + 1 >= max_attempts THEN 'DEAD_LETTER' ELSE 'RETRY' END,
               attempt = MIN(attempt + 1, max_attempts), next_run_at = ?, last_error_code = ?, updated_at = ?
           WHERE connection_id = ?`,
        ).bind(retryAt, code, completedAt, input.connectionId));
    }
    await input.env.LIFE_DB.batch(failureStatements);
    throw error;
  }
}
