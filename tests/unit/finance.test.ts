import { describe, expect, it } from "vitest";

import { ApiError } from "@/core/errors/api-error";
import { convertMoney } from "@/core/money/money";
import { financialIndependenceTimeline, monthlyFinance, movingFinanceAverage } from "@/modules/finance/analytics";

describe("財務固定答案", () => {
  const rows = monthlyFinance([
    { id: "i1", month: "2026-01", kind: "INCOME", amountMinorTwd: 100_000 },
    { id: "e1", month: "2026-01", kind: "EXPENSE", amountMinorTwd: 40_000 },
    { id: "i2", month: "2026-02", kind: "INCOME", amountMinorTwd: 120_000 },
    { id: "e2", month: "2026-02", kind: "EXPENSE", amountMinorTwd: 50_000 },
    { id: "i3", month: "2026-03", kind: "INCOME", amountMinorTwd: 80_000 },
    { id: "e3", month: "2026-03", kind: "EXPENSE", amountMinorTwd: 60_000 },
  ]);

  it("逐月總和、淨現金流與3月移動平均可人工核對", () => {
    expect(rows.map((row) => [row.month, row.incomeMinor, row.expenseMinor, row.netCashFlowMinor])).toEqual([
      ["2026-01", 100_000, 40_000, 60_000], ["2026-02", 120_000, 50_000, 70_000], ["2026-03", 80_000, 60_000, 20_000],
    ]);
    const marchIncome = movingFinanceAverage(rows, 3).find((item) => item.metricKey === "finance.average_income_3m" && item.sampleSize === 3);
    expect(marchIncome?.value).toBe("100000.00");
    expect(marchIncome?.observationCount).toBe(6);
    expect(financialIndependenceTimeline(rows, 90_000).value).toBe("2");
  });

  it("100.25 USD × 32.5 正確四捨五入為TWD整數且保存匯率證據", () => {
    const result = convertMoney({ amountMinor: 10_025, currencyCode: "USD", minorUnitScale: 2 }, "TWD", 0, {
      id: "fx-1", baseCurrency: "USD", quoteCurrency: "TWD", rateDecimal: "32.5", rateDate: "2026-08-01", providerName: "MANUAL",
    });
    expect(result.amountMinor).toBe(3258);
    expect(result.fxEvidence.id).toBe("fx-1");
    expect(result.quality).toBe("MANUAL");
  });

  it("缺匯率時不默認為1", () => {
    expect(() => convertMoney({ amountMinor: 100, currencyCode: "USD", minorUnitScale: 2 }, "TWD", 0, null)).toThrowError(ApiError);
  });
});
