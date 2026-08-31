import { describe, expect, it } from "vitest";

import { buildFinancialSeries, buildTaskCategorySeries, currentFinancialValue } from "@/modules/simple/analytics";

describe("新版人生管理器成果計算", () => {
  it("按任務分類累積每日完成次數並延伸到今天", () => {
    const series = buildTaskCategorySeries({
      categories: [
        { id: "cat-a", name: "訓練" },
        { id: "cat-b", name: "工作" },
      ],
      tasks: [
        { id: "task-a", categoryId: "cat-a", createdAt: "2026-08-27T16:00:00.000Z" },
        { id: "task-b", categoryId: "cat-a", createdAt: "2026-08-27T16:00:00.000Z" },
        { id: "task-c", categoryId: "cat-b", createdAt: "2026-08-27T16:00:00.000Z" },
      ],
      completions: [
        { id: "c1", taskId: "task-a", completedLocalDate: "2026-08-28" },
        { id: "c2", taskId: "task-b", completedLocalDate: "2026-08-28" },
        { id: "c3", taskId: "task-c", completedLocalDate: "2026-08-29" },
        { id: "c4", taskId: "task-a", completedLocalDate: "2026-08-30" },
      ],
      today: "2026-08-30",
    });

    expect(series).toEqual([
      { date: "2026-08-28", "cat-a": 2, "cat-b": 0 },
      { date: "2026-08-29", "cat-a": 2, "cat-b": 1 },
      { date: "2026-08-30", "cat-a": 3, "cat-b": 1 },
    ]);
  });

  it("同日多筆財務紀錄只採該日最後建立的一筆，並延伸到今天", () => {
    const history = [
      { id: "a", metricKind: "NET_WORTH" as const, effectiveLocalDate: "2026-08-01", amountMinor: 10000, createdAt: "2026-08-01T01:00:00.000Z" },
      { id: "b", metricKind: "NET_WORTH" as const, effectiveLocalDate: "2026-08-01", amountMinor: 12000, createdAt: "2026-08-01T02:00:00.000Z" },
      { id: "c", metricKind: "NET_WORTH" as const, effectiveLocalDate: "2026-08-15", amountMinor: 18000, createdAt: "2026-08-15T01:00:00.000Z" },
      { id: "d", metricKind: "MONTHLY_INCOME" as const, effectiveLocalDate: "2026-08-01", amountMinor: 30000, createdAt: "2026-08-01T01:00:00.000Z" },
    ];

    expect(buildFinancialSeries(history, "NET_WORTH", "2026-08-30")).toEqual([
      { date: "2026-08-01", value: 12000 },
      { date: "2026-08-15", value: 18000 },
      { date: "2026-08-30", value: 18000 },
    ]);
    expect(currentFinancialValue(history, "NET_WORTH", "2026-08-30")?.id).toBe("c");
  });

  it("淨資產允許負值並能自然回到最新有效紀錄", () => {
    const history = [
      { id: "debt", metricKind: "NET_WORTH" as const, effectiveLocalDate: "2026-07-01", amountMinor: -25000, createdAt: "2026-07-01T01:00:00.000Z" },
      { id: "now", metricKind: "NET_WORTH" as const, effectiveLocalDate: "2026-08-01", amountMinor: 5000, createdAt: "2026-08-01T01:00:00.000Z" },
    ];
    expect(currentFinancialValue(history, "NET_WORTH", "2026-08-30")?.amountMinor).toBe(5000);
    expect(buildFinancialSeries(history, "NET_WORTH", "2026-08-30")[0]?.value).toBe(-25000);
  });

  it("忽略未來紀錄，刪除後由呼叫端移除即可自然回退目前值", () => {
    const history = [
      { id: "older", metricKind: "MONTHLY_INCOME" as const, effectiveLocalDate: "2026-07-01", amountMinor: 25000, createdAt: "2026-07-01T01:00:00.000Z" },
      { id: "future", metricKind: "MONTHLY_INCOME" as const, effectiveLocalDate: "2026-09-01", amountMinor: 40000, createdAt: "2026-08-30T01:00:00.000Z" },
    ];
    expect(currentFinancialValue(history, "MONTHLY_INCOME", "2026-08-30")?.amountMinor).toBe(25000);
    expect(buildFinancialSeries(history, "MONTHLY_INCOME", "2026-08-30")).toEqual([
      { date: "2026-07-01", value: 25000 },
      { date: "2026-08-30", value: 25000 },
    ]);
  });
});
