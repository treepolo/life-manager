import { compareFirstDay, crossGroupConfounders, type ComparisonGroupBy, type ConversionForComparison, type ExposureAggregation, type PostForComparison, type SnapshotForComparison } from "@/modules/social/analytics";

interface PostRow {
  id: string;
  content_asset_id: string;
  platform_key: string;
  account_id: string;
  business_id: string | null;
  style: string;
  topic: string;
  published_at: string;
}

interface SnapshotRow {
  id: string;
  post_id: string;
  metric_key: string;
  value_decimal: string;
  observed_at: string;
  age_seconds: number;
  source_type: string;
}

interface ConversionRow {
  id: string;
  post_id: string;
  count_value: number;
  confirmed_at: string;
  denominator_metric_key: string;
}

export async function socialComparisonQuery(input: {
  db: D1Database;
  exposureMetricKey: string;
  toleranceMinutes: number;
  from: string;
  to: string;
  groupBy: ComparisonGroupBy;
  exposureAggregation: ExposureAggregation;
  filters: { platformKey: string | null; accountId: string | null; businessId: string | null; style: string | null; topic: string | null; tag: string | null };
}): Promise<Record<string, unknown>> {
  const [postRows, snapshotRows, conversionRows, tagRows] = await Promise.all([
    input.db.prepare(
      `SELECT p.id, p.content_asset_id, sp.key AS platform_key, a.id AS account_id,
              c.business_id, c.style, c.topic, p.published_at
       FROM platform_posts p
       JOIN content_assets c ON c.id = p.content_asset_id
       JOIN social_accounts a ON a.id = p.social_account_id
       JOIN social_platforms sp ON sp.id = a.platform_id
       WHERE p.deleted_at IS NULL AND p.archived_at IS NULL AND c.deleted_at IS NULL
         AND p.published_at BETWEEN ? AND ?`,
    ).bind(input.from, input.to).all<PostRow>(),
    input.db.prepare(
      `SELECT s.id, s.platform_post_id AS post_id, d.metric_key, s.value_decimal,
              s.observed_at, s.age_seconds, s.source_type
       FROM social_metric_snapshots s
       JOIN social_metric_definitions d ON d.id = s.social_metric_definition_id
       WHERE s.deleted_at IS NULL AND d.metric_key = ? AND s.platform_post_id IS NOT NULL`,
    ).bind(input.exposureMetricKey).all<SnapshotRow>(),
    input.db.prepare(
      `SELECT id, platform_post_id AS post_id, count_value, confirmed_at, denominator_metric_key
       FROM conversion_records
       WHERE deleted_at IS NULL AND platform_post_id IS NOT NULL AND denominator_metric_key = ?`,
    ).bind(input.exposureMetricKey).all<ConversionRow>(),
    input.db.prepare(
      `SELECT et.entity_id AS content_asset_id, t.name
       FROM entity_tags et JOIN tags t ON t.id = et.tag_id
       WHERE et.entity_type = 'content_asset' AND t.deleted_at IS NULL AND t.archived_at IS NULL`,
    ).all<{ content_asset_id: string; name: string }>(),
  ]);
  const tagsByContent = new Map<string, string[]>();
  for (const row of tagRows.results) tagsByContent.set(row.content_asset_id, [...(tagsByContent.get(row.content_asset_id) ?? []), row.name]);
  const allPosts: PostForComparison[] = postRows.results.map((row) => ({
    id: row.id,
    contentAssetId: row.content_asset_id,
    platformKey: row.platform_key,
    accountId: row.account_id,
    businessId: row.business_id,
    style: row.style,
    topic: row.topic,
    tags: tagsByContent.get(row.content_asset_id) ?? [],
    publishedAt: row.published_at,
  }));
  const posts = allPosts.filter((post) =>
    (!input.filters.platformKey || post.platformKey === input.filters.platformKey)
    && (!input.filters.accountId || post.accountId === input.filters.accountId)
    && (!input.filters.businessId || post.businessId === input.filters.businessId)
    && (!input.filters.style || post.style === input.filters.style)
    && (!input.filters.topic || post.topic === input.filters.topic)
    && (!input.filters.tag || post.tags.includes(input.filters.tag))
  );
  const snapshots: SnapshotForComparison[] = snapshotRows.results.map((row) => ({
    id: row.id,
    postId: row.post_id,
    metricKey: row.metric_key,
    value: row.value_decimal,
    observedAt: row.observed_at,
    ageSeconds: row.age_seconds,
    sourceType: row.source_type,
  }));
  const conversions: ConversionForComparison[] = conversionRows.results.map((row) => ({
    id: row.id,
    postId: row.post_id,
    count: row.count_value,
    confirmedAt: row.confirmed_at,
    denominatorMetricKey: row.denominator_metric_key,
  }));
  const groups = compareFirstDay({
    posts,
    snapshots,
    conversions,
    exposureMetricKey: input.exposureMetricKey,
    toleranceMinutes: input.toleranceMinutes,
    groupBy: input.groupBy,
    exposureAggregation: input.exposureAggregation,
    appliedFilters: input.filters,
  });
  return {
    metricDefinition: input.exposureMetricKey,
    groupBy: input.groupBy,
    aggregation: input.exposureAggregation,
    filters: input.filters,
    groups,
    crossGroupConfounders: crossGroupConfounders(groups, posts, input.groupBy),
    calculatedAt: new Date().toISOString(),
  };
}
