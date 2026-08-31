import { describe, expect, it } from "vitest";

import type { FinancialHistory } from "@/modules/simple/model";
import { buildPopulationComparisonInsight } from "@/modules/simple/population-comparison";
import type { TaiwanDistributionModel } from "@/modules/simple/taiwan-distributions";

const model: TaiwanDistributionModel = {
  schemaVersion: 1,
  kind: "taiwan-population-amount-distribution",
  metric: "test",
  label: "測試",
  sourceYear: 2026,
  comparisonPopulation: 100_000,
  zeroMassPeople: 0,
  finiteBands: [
    { minNtd: 0, maxNtd: 100_000, people: 90_000, logSlopePerNtd: 0 },
  ],
  tail: { type: "pareto", thresholdNtd: 100_000, people: 10_000, alpha: 2 },
  provenance: {},
};

function record(id: string, date: string, amount: number): FinancialHistory {
  return {
    id,
    version: 1,
    metricKind: "MONTHLY_INCOME",
    effectiveLocalDate: date,
    amountMinor: amount,
    currencyCode: "TWD",
    minorUnitScale: 0,
    createdAt: `${date}T00:00:00.000Z`,
    deletedAt: null,
  };
}

describe("人口比較卡自適應資訊", () => {
  it("依典型金額步幅選擇接近的漂亮人口里程碑", () => {
    const insight = buildPopulationComparisonInsight({
      model,
      metricKind: "MONTHLY_INCOME",
      history: [record("a", "2026-08-01", 5_000), record("b", "2026-08-15", 7_500), record("c", "2026-09-01", 10_000)],
      goal: 20_000,
      today: "2026-09-01",
    });

    expect(insight.nextStep).not.toBeNull();
    expect(insight.nextStep?.additionalPeople).toBe(2_000);
    expect(insight.nextStep?.amountIncrease).toBeGreaterThan(2_000);
    expect(insight.nextStep?.amountIncrease).toBeLessThan(2_300);
  });

  it("上次紀錄只要多贏過約一千人以上就優先顯示，不要求數萬人", () => {
    const insight = buildPopulationComparisonInsight({
      model,
      metricKind: "MONTHLY_INCOME",
      history: [record("a", "2026-08-01", 5_000), record("b", "2026-09-01", 10_000)],
      goal: null,
      today: "2026-09-01",
    });

    expect(insight.historyChange).toEqual({
      baselineLabel: "上次紀錄",
      amountChange: 5_000,
      peopleChange: 4_500,
    });
  });

  it("上次變化太小時，往較長時間找第一個有感的比較點", () => {
    const insight = buildPopulationComparisonInsight({
      model,
      metricKind: "MONTHLY_INCOME",
      history: [
        record("a", "2026-07-01", 1_000),
        record("b", "2026-08-31", 9_500),
        record("c", "2026-09-01", 10_000),
      ],
      goal: null,
      today: "2026-09-01",
    });

    expect(insight.historyChange?.baselineLabel).toBe("30 天前");
    expect(insight.historyChange?.amountChange).toBe(9_000);
    expect(insight.historyChange?.peopleChange).toBe(8_100);
  });

  it("下降時保留負向金額與人口變化供 UI 顯示少贏過", () => {
    const insight = buildPopulationComparisonInsight({
      model,
      metricKind: "MONTHLY_INCOME",
      history: [record("a", "2026-08-01", 10_000), record("b", "2026-09-01", 5_000)],
      goal: null,
      today: "2026-09-01",
    });

    expect(insight.historyChange).toEqual({
      baselineLabel: "上次紀錄",
      amountChange: -5_000,
      peopleChange: -4_500,
    });
  });

  it("只有一筆紀錄時仍提供下一步與總人口，但不捏造歷史比較", () => {
    const insight = buildPopulationComparisonInsight({
      model,
      metricKind: "MONTHLY_INCOME",
      history: [record("a", "2026-09-01", 10_000)],
      goal: 20_000,
      today: "2026-09-01",
    });

    expect(insight.currentPeople).toBe(9_000);
    expect(insight.nextStep).not.toBeNull();
    expect(insight.historyChange).toBeNull();
  });
});
