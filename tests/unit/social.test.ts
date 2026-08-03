import { describe, expect, it } from "vitest";

import { compareFirstDayByStyle, selectFirstDaySnapshot } from "@/modules/social/analytics";

describe("社群首日與轉化固定答案", () => {
  it("只接受24小時容許誤差內快照並區分精確與最近", () => {
    const selection = selectFirstDaySnapshot([
      { id: "s1", postId: "p1", metricKey: "views", value: "900", observedAt: "2026-01-02T00:50:00Z", ageSeconds: 89_400, sourceType: "MANUAL" },
      { id: "s2", postId: "p1", metricKey: "views", value: "1000", observedAt: "2026-01-02T00:00:00Z", ageSeconds: 86_400, sourceType: "MANUAL" },
    ], 15);
    expect(selection.quality).toBe("EXACT");
    expect(selection.snapshot?.id).toBe("s2");
    expect(selectFirstDaySnapshot([{ id: "s3", postId: "p1", metricKey: "views", value: "1", observedAt: "", ageSeconds: 90_000, sourceType: "MANUAL" }], 15).quality).toBe("INSUFFICIENT");
  });

  it("教學型首日曝光平均2000且總和比率不混淆個別比率平均", () => {
    const posts = [
      { id: "p1", contentAssetId: "c1", platformKey: "youtube", accountId: "a1", businessId: null, style: "教學", topic: "A", tags: [], publishedAt: "2026-01-01T00:00:00Z" },
      { id: "p2", contentAssetId: "c2", platformKey: "youtube", accountId: "a1", businessId: null, style: "教學", topic: "A", tags: [], publishedAt: "2026-01-01T00:00:00Z" },
    ];
    const comparisonInput = { posts, snapshots: [
      { id: "s1", postId: "p1", metricKey: "views", value: "1000", observedAt: "2026-01-02T00:00:00Z", ageSeconds: 86_400, sourceType: "YOUTUBE_API" },
      { id: "s2", postId: "p2", metricKey: "views", value: "3000", observedAt: "2026-01-02T00:00:00Z", ageSeconds: 86_400, sourceType: "YOUTUBE_API" },
    ], conversions: [
      { id: "v1", postId: "p1", count: 20, confirmedAt: "2026-01-02T00:00:00Z", denominatorMetricKey: "views" },
      { id: "v2", postId: "p2", count: 30, confirmedAt: "2026-01-02T00:00:00Z", denominatorMetricKey: "views" },
    ], exposureMetricKey: "views", toleranceMinutes: 15, calculatedAt: "2026-01-03T00:00:00.000Z" };
    const groups = compareFirstDayByStyle(comparisonInput);
    expect(groups[0].exposure.value).toBe("2000");
    expect(groups[0].conversionRate.value).toBe("1.250000");
    expect(groups[0].meanIndividualConversionRate.value).toBe("1.500000");
    expect(groups[0].exposure.sampleSize).toBe(2);
    expect(compareFirstDayByStyle({ ...comparisonInput, exposureAggregation: "SUM" })[0].exposure.value).toBe("4000");
    expect(compareFirstDayByStyle({ ...comparisonInput, exposureAggregation: "MEDIAN" })[0].exposure.value).toBe("2000");
    const distribution = compareFirstDayByStyle({ ...comparisonInput, exposureAggregation: "DISTRIBUTION" })[0];
    expect(distribution.exposure.value).toBeNull();
    expect(distribution.exposureDistribution).toEqual({ count: 2, minimum: "1000", firstQuartile: "1500", median: "2000", thirdQuartile: "2500", maximum: "3000" });
  });
});
