import Decimal from "decimal.js";

import { ratioPercent } from "@/core/money/money";
import type { AnalyticResult } from "@/core/provenance/analytic-result";

export interface FinanceObservation {
  id: string;
  month: string;
  kind: "INCOME" | "EXPENSE";
  amountMinorTwd: number;
  incomeSourceId?: string | null;
  businessId?: string | null;
  categoryId?: string | null;
  accountId?: string | null;
}

export interface MonthlyFinanceRow {
  month: string;
  incomeMinor: number;
  expenseMinor: number;
  netCashFlowMinor: number;
  coveragePercent: string | null;
  observationCount: number;
  sourceRefs: Array<{ type: string; id: string }>;
}

export function monthlyFinance(observations: FinanceObservation[]): MonthlyFinanceRow[] {
  const grouped = new Map<string, FinanceObservation[]>();
  for (const observation of observations) {
    const values = grouped.get(observation.month) ?? [];
    values.push(observation);
    grouped.set(observation.month, values);
  }
  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([month, values]) => {
      const income = values.filter((entry) => entry.kind === "INCOME").reduce((sum, entry) => sum + entry.amountMinorTwd, 0);
      const expense = values.filter((entry) => entry.kind === "EXPENSE").reduce((sum, entry) => sum + Math.abs(entry.amountMinorTwd), 0);
      return {
        month,
        incomeMinor: income,
        expenseMinor: expense,
        netCashFlowMinor: income - expense,
        coveragePercent: ratioPercent(income, expense),
        observationCount: values.length,
        sourceRefs: values.map((entry) => ({ type: "financial_transaction", id: entry.id })),
      };
    });
}

export function movingFinanceAverage(rows: MonthlyFinanceRow[], windowMonths: 3 | 6 | 12): AnalyticResult[] {
  return rows.map((row, index) => {
    const windowRows = rows.slice(Math.max(0, index - windowMonths + 1), index + 1);
    const income = Decimal.sum(...windowRows.map((entry) => entry.incomeMinor));
    const expense = Decimal.sum(...windowRows.map((entry) => entry.expenseMinor));
    const count = windowRows.length;
    const averageIncome = income.div(count);
    const averageExpense = expense.div(count);
    const common = {
      formulaVersion: 1,
      unit: "TWD minor units",
      precision: 2,
      quality: "EXACT" as const,
      sampleSize: count,
      observationCount: windowRows.reduce((sum, entry) => sum + entry.observationCount, 0),
      missingCount: windowMonths - count,
      excludedCount: 0,
      window: { kind: "CALENDAR_MONTH", months: windowRows.map((entry) => entry.month) },
      filters: {},
      grouping: ["month"],
      sourceRefs: windowRows.flatMap((entry) => entry.sourceRefs),
      calculatedAt: new Date().toISOString(),
    };
    return [
      {
        ...common,
        metricKey: `finance.average_income_${windowMonths}m`,
        value: averageIncome.toFixed(2),
        aggregation: "ARITHMETIC_MEAN_OF_MONTHLY_SUMS",
        denominatorDefinition: `${count}個有資料的月份`,
        inputValues: windowRows.map((entry) => ({ key: entry.month, value: String(entry.incomeMinor), sourceRef: null })),
      },
      {
        ...common,
        metricKey: `finance.average_expense_${windowMonths}m`,
        value: averageExpense.toFixed(2),
        aggregation: "ARITHMETIC_MEAN_OF_MONTHLY_SUMS",
        denominatorDefinition: `${count}個有資料的月份`,
        inputValues: windowRows.map((entry) => ({ key: entry.month, value: String(entry.expenseMinor), sourceRef: null })),
      },
      {
        ...common,
        metricKey: `finance.coverage_${windowMonths}m`,
        value: ratioPercent(income, expense),
        unit: "percent",
        precision: 6,
        aggregation: "RATIO_OF_WINDOW_SUMS",
        denominatorDefinition: `${count}個月份的總開銷`,
        inputValues: windowRows.flatMap((entry) => [
          { key: `${entry.month}.income`, value: String(entry.incomeMinor), sourceRef: null },
          { key: `${entry.month}.expense`, value: String(entry.expenseMinor), sourceRef: null },
        ]),
      },
    ];
  }).flat();
}

export function financialIndependenceTimeline(rows: MonthlyFinanceRow[], baselineMinor: number): AnalyticResult {
  const qualifying = rows.filter((row) => row.incomeMinor > baselineMinor).map((row) => row.month);
  return {
    metricKey: "finance.months_income_above_baseline",
    formulaVersion: 1,
    value: String(qualifying.length),
    unit: "months",
    precision: 0,
    quality: "EXACT",
    sampleSize: rows.length,
    observationCount: rows.reduce((sum, row) => sum + row.observationCount, 0),
    missingCount: 0,
    excludedCount: 0,
    window: { kind: "CALENDAR_MONTH", from: rows[0]?.month ?? null, to: rows.at(-1)?.month ?? null },
    filters: { baselineMinor },
    grouping: ["month"],
    aggregation: "COUNT_MONTHS_INCOME_GT_BASELINE",
    denominatorDefinition: null,
    sourceRefs: rows.flatMap((row) => row.sourceRefs),
    inputValues: rows.map((row) => ({ key: row.month, value: String(row.incomeMinor), sourceRef: null })),
    calculatedAt: new Date().toISOString(),
  };
}
