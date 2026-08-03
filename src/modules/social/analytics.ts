import Decimal from "decimal.js";

import type { AnalyticResult } from "@/core/provenance/analytic-result";

export interface PostForComparison {
  id: string;
  contentAssetId: string;
  platformKey: string;
  accountId: string;
  businessId: string | null;
  style: string;
  topic: string;
  tags: string[];
  publishedAt: string;
}

export interface SnapshotForComparison {
  id: string;
  postId: string;
  metricKey: string;
  value: string;
  observedAt: string;
  ageSeconds: number;
  sourceType: string;
}

export interface ConversionForComparison {
  id: string;
  postId: string;
  count: number;
  confirmedAt: string;
  denominatorMetricKey: string;
}

export interface FirstDaySelection {
  snapshot: SnapshotForComparison | null;
  quality: "EXACT" | "NEAREST" | "INSUFFICIENT";
  deviationSeconds: number | null;
}

export function selectFirstDaySnapshot(
  snapshots: SnapshotForComparison[],
  toleranceMinutes: number,
): FirstDaySelection {
  const target = 24 * 60 * 60;
  const candidates = snapshots
    .map((snapshot) => ({ snapshot, deviation: snapshot.ageSeconds - target }))
    .sort((left, right) => Math.abs(left.deviation) - Math.abs(right.deviation));
  const nearest = candidates[0];
  if (!nearest || Math.abs(nearest.deviation) > toleranceMinutes * 60) {
    return { snapshot: null, quality: "INSUFFICIENT", deviationSeconds: nearest?.deviation ?? null };
  }
  return {
    snapshot: nearest.snapshot,
    quality: nearest.deviation === 0 ? "EXACT" : "NEAREST",
    deviationSeconds: nearest.deviation,
  };
}

export interface ComparisonGroup {
  group: string;
  exposure: AnalyticResult;
  exposureDistribution: {
    count: number;
    minimum: string | null;
    firstQuartile: string | null;
    median: string | null;
    thirdQuartile: string | null;
    maximum: string | null;
  };
  conversions: AnalyticResult;
  conversionRate: AnalyticResult;
  meanIndividualConversionRate: AnalyticResult;
  knownConfounders: Array<{ field: string; values: string[] }>;
  postSelections: Array<{
    postId: string;
    snapshotId: string | null;
    quality: FirstDaySelection["quality"];
    deviationSeconds: number | null;
    excludedReason: string | null;
  }>;
}

export type ComparisonGroupBy = "style" | "topic" | "platformKey" | "accountId" | "businessId" | "tag";
export type ExposureAggregation = "MEAN" | "SUM" | "MEDIAN" | "DISTRIBUTION";

function quantile(values: Decimal[], percentile: number): Decimal | null {
  if (!values.length) return null;
  const ordered = [...values].sort((left, right) => left.comparedTo(right));
  const position = (ordered.length - 1) * percentile;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return ordered[lower];
  return ordered[lower].plus(ordered[upper].minus(ordered[lower]).mul(position - lower));
}

function aggregateExposure(values: Decimal[], aggregation: ExposureAggregation): string | null {
  if (!values.length || aggregation === "DISTRIBUTION") return null;
  if (aggregation === "SUM") return Decimal.sum(...values).toFixed();
  if (aggregation === "MEDIAN") return quantile(values, 0.5)?.toFixed() ?? null;
  return Decimal.sum(...values).div(values.length).toFixed();
}

function groupValues(post: PostForComparison, groupBy: ComparisonGroupBy): string[] {
  if (groupBy === "tag") return post.tags.length ? post.tags : ["未設定"];
  return [String(post[groupBy] ?? "未設定") || "未分類"];
}

export function compareFirstDay(input: {
  posts: PostForComparison[];
  snapshots: SnapshotForComparison[];
  conversions: ConversionForComparison[];
  exposureMetricKey: string;
  toleranceMinutes: number;
  groupBy: ComparisonGroupBy;
  exposureAggregation?: ExposureAggregation;
  appliedFilters?: Record<string, string | null>;
  calculatedAt?: string;
}): ComparisonGroup[] {
  const calculatedAt = input.calculatedAt ?? new Date().toISOString();
  const exposureAggregation = input.exposureAggregation ?? "MEAN";
  const groupNames = [...new Set(input.posts.flatMap((post) => groupValues(post, input.groupBy)))].sort();
  return groupNames.map((groupName) => {
    const groupPosts = input.posts.filter((post) => groupValues(post, input.groupBy).includes(groupName));
    const selections = groupPosts.map((post) => {
      const selected = selectFirstDaySnapshot(
        input.snapshots.filter((snapshot) => snapshot.postId === post.id && snapshot.metricKey === input.exposureMetricKey),
        input.toleranceMinutes,
      );
      return { post, selected };
    });
    const included = selections.filter((entry) => entry.selected.snapshot !== null);
    const exposures = included.map((entry) => new Decimal(entry.selected.snapshot!.value));
    const totalExposure = exposures.length ? Decimal.sum(...exposures) : new Decimal(0);
    const conversionByPost = new Map<string, number>();
    for (const conversion of input.conversions) {
      conversionByPost.set(conversion.postId, (conversionByPost.get(conversion.postId) ?? 0) + conversion.count);
    }
    const totalConversions = included.reduce((sum, entry) => sum + (conversionByPost.get(entry.post.id) ?? 0), 0);
    const individualRatios = included
      .map((entry) => {
        const exposure = new Decimal(entry.selected.snapshot!.value);
        return exposure.isZero() ? null : new Decimal(conversionByPost.get(entry.post.id) ?? 0).div(exposure).mul(100);
      })
      .filter((value): value is Decimal => value !== null);
    const exactCount = included.filter((entry) => entry.selected.quality === "EXACT").length;
    const quality = included.length === 0 ? "INSUFFICIENT" : exactCount === included.length ? "EXACT" : "NEAREST";
    const sourceRefs = included.flatMap((entry) => [
      { type: "platform_post", id: entry.post.id },
      { type: "social_metric_snapshot", id: entry.selected.snapshot!.id },
    ]);
    const common = {
      formulaVersion: 1,
      quality: quality as "EXACT" | "NEAREST" | "INSUFFICIENT",
      sampleSize: included.length,
      observationCount: included.length,
      missingCount: groupPosts.length - included.length,
      excludedCount: groupPosts.length - included.length,
      window: { kind: "POST_PUBLISH", fromHours: 0, toHours: 24, toleranceMinutes: input.toleranceMinutes },
      filters: { ...(input.appliedFilters ?? {}), [input.groupBy]: groupName },
      grouping: [input.groupBy],
      sourceRefs,
      calculatedAt,
    };
    const exposure: AnalyticResult = {
      ...common,
      metricKey: `social.first_day.${input.exposureMetricKey}.${exposureAggregation.toLowerCase()}`,
      value: aggregateExposure(exposures, exposureAggregation),
      unit: input.exposureMetricKey,
      precision: 2,
      aggregation: exposureAggregation,
      denominatorDefinition: exposureAggregation === "MEAN" ? "有合格首日觀測的內容數" : null,
      inputValues: included.map((entry) => ({
        key: entry.post.id,
        value: entry.selected.snapshot!.value,
        sourceRef: { type: "social_metric_snapshot", id: entry.selected.snapshot!.id },
      })),
    };
    const conversions: AnalyticResult = {
      ...common,
      metricKey: "social.first_day.conversions.sum",
      value: String(totalConversions),
      unit: "conversions",
      precision: 0,
      aggregation: "SUM",
      denominatorDefinition: null,
      inputValues: included.map((entry) => ({
        key: entry.post.id,
        value: String(conversionByPost.get(entry.post.id) ?? 0),
        sourceRef: null,
      })),
    };
    const conversionRate: AnalyticResult = {
      ...common,
      metricKey: "social.first_day.conversion_rate.ratio_of_sums",
      value: totalExposure.isZero() ? null : new Decimal(totalConversions).div(totalExposure).mul(100).toFixed(6),
      unit: "percent",
      precision: 6,
      aggregation: "RATIO_OF_SUMS",
      denominatorDefinition: `納入內容的${input.exposureMetricKey}總和`,
      inputValues: [
        { key: "conversion_numerator", value: String(totalConversions), sourceRef: null },
        { key: "exposure_denominator", value: totalExposure.toFixed(), sourceRef: null },
      ],
    };
    const meanIndividualConversionRate: AnalyticResult = {
      ...common,
      metricKey: "social.first_day.conversion_rate.mean_of_ratios",
      value: individualRatios.length ? Decimal.sum(...individualRatios).div(individualRatios.length).toFixed(6) : null,
      unit: "percent",
      precision: 6,
      aggregation: "MEAN_OF_INDIVIDUAL_RATIOS",
      denominatorDefinition: "每篇內容各自的首日曝光，再對個別轉化率取平均",
      inputValues: individualRatios.map((value, index) => ({ key: included[index].post.id, value: value.toFixed(6), sourceRef: null })),
    };
    const knownConfounders: ComparisonGroup["knownConfounders"] = [];
    for (const field of ["platformKey", "accountId", "businessId", "topic"] as const) {
      if (field === input.groupBy) continue;
      const values = [...new Set(groupPosts.map((post) => String(post[field] ?? "未設定")))];
      if (values.length > 1) knownConfounders.push({ field, values });
    }
    return {
      group: groupName,
      exposure,
      exposureDistribution: {
        count: exposures.length,
        minimum: quantile(exposures, 0)?.toFixed() ?? null,
        firstQuartile: quantile(exposures, 0.25)?.toFixed() ?? null,
        median: quantile(exposures, 0.5)?.toFixed() ?? null,
        thirdQuartile: quantile(exposures, 0.75)?.toFixed() ?? null,
        maximum: quantile(exposures, 1)?.toFixed() ?? null,
      },
      conversions,
      conversionRate,
      meanIndividualConversionRate,
      knownConfounders,
      postSelections: selections.map(({ post, selected }) => ({
        postId: post.id,
        snapshotId: selected.snapshot?.id ?? null,
        quality: selected.quality,
        deviationSeconds: selected.deviationSeconds,
        excludedReason: selected.snapshot ? null : "沒有落在容許誤差內的24小時觀測",
      })),
    };
  });
}

export function compareFirstDayByStyle(input: Omit<Parameters<typeof compareFirstDay>[0], "groupBy">): ComparisonGroup[] {
  return compareFirstDay({ ...input, groupBy: "style" });
}

export function crossGroupConfounders(groups: ComparisonGroup[], posts: PostForComparison[], groupBy: ComparisonGroupBy = "style"): Array<{ field: string; groups: Record<string, string[]> }> {
  const result: Array<{ field: string; groups: Record<string, string[]> }> = [];
  for (const field of ["platformKey", "accountId", "businessId", "topic"] as const) {
    if (field === groupBy) continue;
    const grouped: Record<string, string[]> = {};
    for (const group of groups) {
      grouped[group.group] = [...new Set(posts.filter((post) => groupValues(post, groupBy).includes(group.group)).map((post) => String(post[field] ?? "未設定")))];
    }
    const signatures = new Set(Object.values(grouped).map((values) => [...values].sort().join("|")));
    if (signatures.size > 1) result.push({ field, groups: grouped });
  }
  return result;
}
