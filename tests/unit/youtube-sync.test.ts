import { describe, expect, it, vi } from "vitest";

import { runD1WriteBatches, youtubeAnalyticsDailyPoints, youtubePacificDayStart } from "@/worker/api/provider-sync";
import type { Env } from "@/worker/env";

describe("YouTube Analytics日報表正規化", () => {
  it("Pacific來源日界在冬夏時間轉為正確UTC且不冒充Asia/Taipei日界", () => {
    expect(youtubePacificDayStart("2026-01-15")).toBe("2026-01-15T08:00:00.000Z");
    expect(youtubePacificDayStart("2026-07-15")).toBe("2026-07-15T07:00:00.000Z");
  });

  it("固定日報表原樣保留views、likes、comments三個來源值與負likes調整", () => {
    expect(youtubeAnalyticsDailyPoints({
      columnHeaders: [{ name: "day" }, { name: "views" }, { name: "likes" }, { name: "comments" }],
      rows: [["2026-07-15", 100, -2, 3]],
    })).toEqual([
      { day: "2026-07-15", metric: "views", value: "100", observedAt: "2026-07-15T07:00:00.000Z" },
      { day: "2026-07-15", metric: "likes", value: "-2", observedAt: "2026-07-15T07:00:00.000Z" },
      { day: "2026-07-15", metric: "comments", value: "3", observedAt: "2026-07-15T07:00:00.000Z" },
    ]);
  });

  it("缺欄、無效日期或非數值不會被靜默寫入", () => {
    expect(() => youtubeAnalyticsDailyPoints({ columnHeaders: [{ name: "day" }], rows: [] }))
      .toThrow("YouTube Analytics回應缺少必要日指標欄位。");
    expect(() => youtubeAnalyticsDailyPoints({
      columnHeaders: [{ name: "day" }, { name: "views" }, { name: "likes" }, { name: "comments" }],
      rows: [["2026-02-30", 1, 1, 1]],
    })).toThrow("YouTube Analytics回傳無效日期。");
    expect(() => youtubeAnalyticsDailyPoints({
      columnHeaders: [{ name: "day" }, { name: "views" }, { name: "likes" }, { name: "comments" }],
      rows: [["2026-07-15", "not-a-number", 1, 1]],
    })).toThrow("YouTube Analytics views值無效。");
  });

  it("大量快照以每批100句送往D1而不是逐筆建立內部subrequest", async () => {
    const batch = vi.fn(async (statements: D1PreparedStatement[]) => statements.map(() => ({ success: true })));
    const statements = Array.from({ length: 250 }, () => ({}) as D1PreparedStatement);
    await runD1WriteBatches({ LIFE_DB: { batch } } as unknown as Env, statements);
    expect(batch.mock.calls.map(([items]) => items.length)).toEqual([100, 100, 50]);
  });
});
