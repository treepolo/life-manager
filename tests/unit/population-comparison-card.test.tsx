import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PopulationComparisonCard } from "@/components/PopulationComparisonCard";
import type { FinancialHistory } from "@/modules/simple/model";
import type { TaiwanDistributionInfo, TaiwanDistributionModel } from "@/modules/simple/taiwan-distributions";

afterEach(cleanup);

const model: TaiwanDistributionModel = {
  schemaVersion: 1,
  kind: "taiwan-population-amount-distribution",
  metric: "test",
  label: "測試",
  sourceYear: 2026,
  comparisonPopulation: 100_000,
  zeroMassPeople: 0,
  finiteBands: [{ minNtd: 0, maxNtd: 100_000, people: 90_000, logSlopePerNtd: 0 }],
  tail: { type: "pareto", thresholdNtd: 100_000, people: 10_000, alpha: 2 },
  provenance: {},
};

const info: TaiwanDistributionInfo = {
  label: "月收入",
  sourceYear: 2026,
  comparisonPopulation: 100_000,
  note: "測試模型",
  sources: [],
};

const history: FinancialHistory[] = [
  {
    id: "old",
    version: 1,
    metricKind: "MONTHLY_INCOME",
    effectiveLocalDate: "2026-08-01",
    amountMinor: 5_000,
    currencyCode: "TWD",
    minorUnitScale: 0,
    createdAt: "2026-08-01T00:00:00.000Z",
  },
  {
    id: "current",
    version: 1,
    metricKind: "MONTHLY_INCOME",
    effectiveLocalDate: "2026-09-01",
    amountMinor: 10_000,
    currencyCode: "TWD",
    minorUnitScale: 0,
    createdAt: "2026-09-01T00:00:00.000Z",
  },
];

describe("人口比較卡文案", () => {
  it("下一步與歷史變化都明確寫出財務指標名稱，總人口降為第三層", () => {
    render(
      <PopulationComparisonCard
        label="月收入"
        metricKind="MONTHLY_INCOME"
        history={history}
        goal={20_000}
        today="2026-09-01"
        model={model}
        info={info}
      />,
    );

    expect(screen.getByText(/月收入再增加 NT\$/)).toBeVisible();
    expect(screen.getByText(/月收入比上次紀錄增加 NT\$/)).toBeVisible();
    expect(screen.getByText(/又多贏過了 4,500 人/)).toBeVisible();
    expect(screen.getByText(/目前共贏過/)).toBeVisible();
    expect(screen.getByText(/個臺灣人/)).toBeVisible();
  });
});
