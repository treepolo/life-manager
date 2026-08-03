import { convertMoney, type FxEvidence } from "@/core/money/money";
import type { AnalyticResult } from "@/core/provenance/analytic-result";
import { financialIndependenceTimeline, monthlyFinance, movingFinanceAverage, type FinanceObservation } from "@/modules/finance/analytics";

export interface FinanceAnalysisOptions {
  from: string;
  to: string;
  granularity: "MONTH" | "QUARTER" | "YEAR";
  currencyMode: "TWD" | "NOMINAL";
  nominalCurrency: string | null;
  accountId: string | null;
  categoryId: string | null;
  incomeSourceId: string | null;
  businessId: string | null;
}

interface TransactionRow {
  id: string;
  transaction_kind: "INCOME" | "EXPENSE";
  occurred_on_local_date: string;
  amount_minor: number;
  currency_code: string;
  minor_unit_scale: number;
  income_source_id: string | null;
  business_id: string | null;
  category_id: string | null;
  account_id: string;
}

interface FxRow {
  id: string;
  base_currency: string;
  quote_currency: string;
  rate_decimal: string;
  rate_date: string;
  provider_name: string;
}

function chooseFx(rates: FxRow[], currency: string, date: string): FxEvidence | null {
  const match = rates
    .filter((rate) => rate.base_currency === currency && rate.quote_currency === "TWD" && rate.rate_date <= date)
    .sort((left, right) => right.rate_date.localeCompare(left.rate_date))[0];
  return match
    ? {
        id: match.id,
        baseCurrency: match.base_currency,
        quoteCurrency: match.quote_currency,
        rateDecimal: match.rate_decimal,
        rateDate: match.rate_date,
        providerName: match.provider_name,
      }
    : null;
}

function periodFor(month: string, granularity: FinanceAnalysisOptions["granularity"]): string {
  if (granularity === "YEAR") return month.slice(0, 4);
  if (granularity === "QUARTER") return `${month.slice(0, 4)}-Q${Math.floor((Number(month.slice(5, 7)) - 1) / 3) + 1}`;
  return month;
}

function aggregatePeriods(rows: ReturnType<typeof monthlyFinance>, granularity: FinanceAnalysisOptions["granularity"]) {
  if (granularity === "MONTH") return rows;
  const grouped = new Map<string, typeof rows>();
  for (const row of rows) {
    const period = periodFor(row.month, granularity);
    grouped.set(period, [...(grouped.get(period) ?? []), row]);
  }
  return [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([month, values]) => {
    const incomeMinor = values.reduce((sum, row) => sum + row.incomeMinor, 0);
    const expenseMinor = values.reduce((sum, row) => sum + row.expenseMinor, 0);
    return {
      month,
      incomeMinor,
      expenseMinor,
      netCashFlowMinor: incomeMinor - expenseMinor,
      coveragePercent: expenseMinor === 0 ? null : (incomeMinor * 100 / expenseMinor).toFixed(6),
      observationCount: values.reduce((sum, row) => sum + row.observationCount, 0),
      sourceRefs: values.flatMap((row) => row.sourceRefs),
    };
  });
}

export async function financeAnalysis(db: D1Database, options: FinanceAnalysisOptions): Promise<{
  monthly: ReturnType<typeof monthlyFinance>;
  series: ReturnType<typeof monthlyFinance>;
  seriesProvenance: AnalyticResult;
  incomeBySource: Array<{ period: string; sourceId: string | null; sourceName: string; amountMinor: number; sharePercent: string; observationCount: number; sourceRefs: Array<{ type: string; id: string }> }>;
  incomeBySourceProvenance: AnalyticResult;
  expenseByCategory: Array<{ period: string; categoryId: string | null; categoryName: string; amountMinor: number; sharePercent: string; observationCount: number; sourceRefs: Array<{ type: string; id: string }> }>;
  expenseByCategoryProvenance: AnalyticResult;
  movingAverages: AnalyticResult[];
  independence: AnalyticResult | null;
  missingExchangeRates: Array<{ transactionId: string; transactionKind: "INCOME" | "EXPENSE"; currencyCode: string; localDate: string }>;
  conversionEvidence: Array<Record<string, unknown>>;
  filters: Omit<FinanceAnalysisOptions, "from" | "to">;
  unit: string;
}> {
  const [transactionResult, fxResult, baseline, sourceResult, categoryResult] = await Promise.all([
    db.prepare(
      `SELECT id, transaction_kind, occurred_on_local_date, amount_minor, currency_code, minor_unit_scale,
              income_source_id, business_id, category_id, account_id
       FROM financial_transactions
       WHERE deleted_at IS NULL AND archived_at IS NULL AND transaction_kind IN ('INCOME','EXPENSE')
         AND occurred_on_local_date BETWEEN ? AND ?`,
    ).bind(options.from, options.to).all<TransactionRow>(),
    db.prepare("SELECT * FROM fx_rates WHERE deleted_at IS NULL AND quote_currency = 'TWD'").all<FxRow>(),
    db.prepare(
      `SELECT amount_minor FROM expense_baselines
       WHERE deleted_at IS NULL AND archived_at IS NULL AND currency_code = 'TWD'
         AND effective_from_local_date <= ? AND (effective_to_local_date IS NULL OR effective_to_local_date >= ?)
       ORDER BY effective_from_local_date DESC LIMIT 1`,
    ).bind(options.to, options.from).first<{ amount_minor: number }>(),
    db.prepare("SELECT id, name FROM income_sources WHERE deleted_at IS NULL").all<{ id: string; name: string }>(),
    db.prepare("SELECT id, name FROM finance_categories WHERE deleted_at IS NULL").all<{ id: string; name: string }>(),
  ]);
  const observations: FinanceObservation[] = [];
  const missingExchangeRates: Array<{ transactionId: string; transactionKind: "INCOME" | "EXPENSE"; currencyCode: string; localDate: string }> = [];
  const conversionEvidence: Array<Record<string, unknown>> = [];
  for (const transaction of transactionResult.results) {
    if (options.accountId && transaction.account_id !== options.accountId) continue;
    if (options.categoryId && transaction.category_id !== options.categoryId) continue;
    if (options.incomeSourceId && transaction.income_source_id !== options.incomeSourceId) continue;
    if (options.businessId && transaction.business_id !== options.businessId) continue;
    if (options.currencyMode === "NOMINAL" && transaction.currency_code !== options.nominalCurrency) continue;
    const fx = chooseFx(fxResult.results, transaction.currency_code, transaction.occurred_on_local_date);
    try {
      const converted = options.currencyMode === "TWD"
        ? convertMoney({ amountMinor: transaction.amount_minor, currencyCode: transaction.currency_code, minorUnitScale: transaction.minor_unit_scale }, "TWD", 0, fx)
        : { amountMinor: transaction.amount_minor, currencyCode: transaction.currency_code, minorUnitScale: transaction.minor_unit_scale, original: { amountMinor: transaction.amount_minor, currencyCode: transaction.currency_code, minorUnitScale: transaction.minor_unit_scale }, fxEvidence: { id: "nominal", baseCurrency: transaction.currency_code, quoteCurrency: transaction.currency_code, rateDecimal: "1", rateDate: transaction.occurred_on_local_date, providerName: "NOMINAL" }, quality: "EXACT" as const };
      observations.push({
        id: transaction.id,
        month: transaction.occurred_on_local_date.slice(0, 7),
        kind: transaction.transaction_kind,
        amountMinorTwd: converted.amountMinor,
        incomeSourceId: transaction.income_source_id,
        businessId: transaction.business_id,
        categoryId: transaction.category_id,
        accountId: transaction.account_id,
      });
      conversionEvidence.push({ transactionId: transaction.id, originalAmountMinor: transaction.amount_minor, originalCurrencyCode: transaction.currency_code, originalMinorUnitScale: transaction.minor_unit_scale, convertedAmountMinor: converted.amountMinor, convertedCurrencyCode: converted.currencyCode, convertedMinorUnitScale: converted.minorUnitScale, fxEvidence: converted.fxEvidence, quality: converted.quality });
    } catch {
      missingExchangeRates.push({
        transactionId: transaction.id,
        transactionKind: transaction.transaction_kind,
        currencyCode: transaction.currency_code,
        localDate: transaction.occurred_on_local_date,
      });
    }
  }
  const monthly = monthlyFinance(observations);
  const series = aggregatePeriods(monthly, options.granularity);
  const sourceNames = new Map(sourceResult.results.map((row) => [row.id, row.name]));
  const categoryNames = new Map(categoryResult.results.map((row) => [row.id, row.name]));
  const buildBreakdown = (kind: "INCOME" | "EXPENSE", key: "incomeSourceId" | "categoryId") => {
    const relevant = observations.filter((entry) => entry.kind === kind);
    const totals = new Map<string, number>();
    for (const entry of relevant) {
      const period = periodFor(entry.month, options.granularity);
      totals.set(period, (totals.get(period) ?? 0) + Math.abs(entry.amountMinorTwd));
    }
    const grouped = new Map<string, FinanceObservation[]>();
    for (const entry of relevant) {
      const period = periodFor(entry.month, options.granularity); const entityId = entry[key] ?? null;
      const groupKey = `${period}|${entityId ?? "unassigned"}`;
      grouped.set(groupKey, [...(grouped.get(groupKey) ?? []), entry]);
    }
    return [...grouped.values()].map((entries) => {
      const period = periodFor(entries[0].month, options.granularity); const entityId = entries[0][key] ?? null;
      const amountMinor = entries.reduce((sum, entry) => sum + Math.abs(entry.amountMinorTwd), 0); const total = totals.get(period) ?? 0;
      return { period, entityId, amountMinor, sharePercent: total === 0 ? "0" : (amountMinor * 100 / total).toFixed(6), observationCount: entries.length, sourceRefs: entries.map((entry) => ({ type: "financial_transaction", id: entry.id })) };
    }).sort((left, right) => left.period.localeCompare(right.period) || String(left.entityId).localeCompare(String(right.entityId)));
  };
  const incomeBreakdown = buildBreakdown("INCOME", "incomeSourceId");
  const expenseBreakdown = buildBreakdown("EXPENSE", "categoryId");
  const calculatedAt = new Date().toISOString();
  const filters = { granularity: options.granularity, currencyMode: options.currencyMode, nominalCurrency: options.nominalCurrency, accountId: options.accountId, categoryId: options.categoryId, incomeSourceId: options.incomeSourceId, businessId: options.businessId };
  const unit = options.currencyMode === "TWD" ? "TWD minor units" : `${options.nominalCurrency} minor units`;
  const provenance = (
    metricKey: string,
    relevant: FinanceObservation[],
    relevantMissing: typeof missingExchangeRates,
    grouping: string[],
    aggregation: string,
    denominatorDefinition: string | null,
    value: string | null,
  ): AnalyticResult => ({
    metricKey,
    formulaVersion: 1,
    value,
    unit,
    precision: 0,
    quality: relevantMissing.length ? "INSUFFICIENT" : "EXACT",
    sampleSize: relevant.length,
    observationCount: relevant.length + relevantMissing.length,
    missingCount: relevantMissing.length,
    excludedCount: relevantMissing.length,
    window: { kind: options.granularity, from: options.from, to: options.to },
    filters,
    grouping,
    aggregation,
    denominatorDefinition,
    sourceRefs: relevant.map((entry) => ({ type: "financial_transaction", id: entry.id })),
    inputValues: relevant.map((entry) => ({ key: entry.id, value: String(entry.amountMinorTwd), sourceRef: { type: "financial_transaction", id: entry.id } })),
    calculatedAt,
  });
  const incomeObservations = observations.filter((entry) => entry.kind === "INCOME");
  const expenseObservations = observations.filter((entry) => entry.kind === "EXPENSE");
  const latestSeries = series.at(-1);
  return {
    monthly,
    series,
    seriesProvenance: provenance(
      "finance.cash_flow_series",
      observations,
      missingExchangeRates,
      [options.granularity.toLowerCase()],
      "SUM_INCOME_AND_EXPENSE_BY_PERIOD",
      null,
      latestSeries ? String(latestSeries.netCashFlowMinor) : null,
    ),
    incomeBySource: incomeBreakdown.map((row) => ({ period: row.period, sourceId: row.entityId, sourceName: row.entityId ? sourceNames.get(row.entityId) ?? "未知收入來源" : "未指定收入來源", amountMinor: row.amountMinor, sharePercent: row.sharePercent, observationCount: row.observationCount, sourceRefs: row.sourceRefs })),
    incomeBySourceProvenance: provenance(
      "finance.income_by_source_series",
      incomeObservations,
      missingExchangeRates.filter((entry) => entry.transactionKind === "INCOME"),
      [options.granularity.toLowerCase(), "income_source"],
      "SUM_INCOME_BY_PERIOD_AND_SOURCE",
      "同期間所有納入收入的總和",
      incomeObservations.length ? String(incomeObservations.reduce((sum, entry) => sum + entry.amountMinorTwd, 0)) : null,
    ),
    expenseByCategory: expenseBreakdown.map((row) => ({ period: row.period, categoryId: row.entityId, categoryName: row.entityId ? categoryNames.get(row.entityId) ?? "未知分類" : "未分類", amountMinor: row.amountMinor, sharePercent: row.sharePercent, observationCount: row.observationCount, sourceRefs: row.sourceRefs })),
    expenseByCategoryProvenance: provenance(
      "finance.expense_by_category",
      expenseObservations,
      missingExchangeRates.filter((entry) => entry.transactionKind === "EXPENSE"),
      [options.granularity.toLowerCase(), "expense_category"],
      "SUM_EXPENSE_BY_PERIOD_AND_CATEGORY",
      "同期間所有納入開銷的總和",
      expenseObservations.length ? String(expenseObservations.reduce((sum, entry) => sum + Math.abs(entry.amountMinorTwd), 0)) : null,
    ),
    movingAverages: ([3, 6, 12] as const).flatMap((window) => movingFinanceAverage(monthly, window)),
    independence: baseline && options.currencyMode === "TWD" ? financialIndependenceTimeline(monthly, baseline.amount_minor) : null,
    missingExchangeRates,
    conversionEvidence,
    filters,
    unit,
  };
}

export async function netWorthAnalysis(db: D1Database, asOf: string): Promise<{
  result: AnalyticResult;
  allocation: Array<{ accountId: string; name: string; amountMinorTwd: number; sharePercent: string }>;
  missingExchangeRates: Array<{ snapshotId: string; currencyCode: string }>;
}> {
  const snapshots = await db.prepare(
    `SELECT s.*, a.name AS account_name, a.account_type
     FROM asset_snapshots s
     LEFT JOIN financial_accounts a ON a.id = s.account_id
     WHERE s.deleted_at IS NULL AND s.observed_at <= ?
       AND s.id IN (SELECT s2.id FROM asset_snapshots s2 WHERE s2.deleted_at IS NULL AND s2.observed_at <= ?
                    AND COALESCE(s2.account_id, s2.asset_definition_id) = COALESCE(s.account_id, s.asset_definition_id)
                    ORDER BY s2.observed_at DESC LIMIT 1)`,
  ).bind(asOf, asOf).all<Record<string, string | number | null>>();
  const rates = await db.prepare("SELECT * FROM fx_rates WHERE deleted_at IS NULL AND quote_currency = 'TWD'").all<FxRow>();
  const converted: Array<{ id: string; accountId: string; name: string; value: number; liability: boolean }> = [];
  const missingExchangeRates: Array<{ snapshotId: string; currencyCode: string }> = [];
  for (const row of snapshots.results) {
    const fx = chooseFx(rates.results, String(row.currency_code), String(row.input_local_date));
    try {
      const money = convertMoney(
        { amountMinor: Number(row.amount_minor), currencyCode: String(row.currency_code), minorUnitScale: Number(row.minor_unit_scale) },
        "TWD", 0, fx,
      );
      converted.push({
        id: String(row.id), accountId: String(row.account_id ?? row.asset_definition_id),
        name: String(row.account_name ?? "資產"), value: money.amountMinor, liability: row.account_type === "LIABILITY",
      });
    } catch {
      missingExchangeRates.push({ snapshotId: String(row.id), currencyCode: String(row.currency_code) });
    }
  }
  const assets = converted.filter((entry) => !entry.liability);
  const liabilities = converted.filter((entry) => entry.liability);
  const assetTotal = assets.reduce((sum, entry) => sum + entry.value, 0);
  const liabilityTotal = liabilities.reduce((sum, entry) => sum + Math.abs(entry.value), 0);
  const netWorth = assetTotal - liabilityTotal;
  return {
    result: {
      metricKey: "finance.net_worth",
      formulaVersion: 1,
      value: String(netWorth), unit: "TWD minor units", precision: 0,
      quality: missingExchangeRates.length ? "INSUFFICIENT" : "EXACT",
      sampleSize: converted.length, observationCount: snapshots.results.length,
      missingCount: missingExchangeRates.length, excludedCount: missingExchangeRates.length,
      window: { kind: "AS_OF", asOf }, filters: {}, grouping: ["account"],
      aggregation: "ASSET_SUM_MINUS_LIABILITY_SUM", denominatorDefinition: "資產配置分母只包含資產；淨值另扣負債",
      sourceRefs: converted.map((entry) => ({ type: "asset_snapshot", id: entry.id })),
      inputValues: converted.map((entry) => ({ key: entry.accountId, value: String(entry.value), sourceRef: { type: "asset_snapshot", id: entry.id } })),
      calculatedAt: new Date().toISOString(),
    },
    allocation: assets.map((entry) => ({
      accountId: entry.accountId, name: entry.name, amountMinorTwd: entry.value,
      sharePercent: assetTotal === 0 ? "0" : (entry.value * 100 / assetTotal).toFixed(6),
    })),
    missingExchangeRates,
  };
}

export async function netWorthTrend(db: D1Database, from: string, to: string): Promise<{
  points: Array<{ observedOn: string; valueMinorTwd: number; quality: string; sampleSize: number; missingCount: number; sourceRefs: Array<{ type: string; id: string }> }>;
  result: AnalyticResult;
  from: string;
  to: string;
}> {
  const dates = await db.prepare(
    `SELECT DISTINCT input_local_date AS observed_on FROM asset_snapshots
     WHERE deleted_at IS NULL AND input_local_date BETWEEN ? AND ? ORDER BY input_local_date`,
  ).bind(from, to).all<{ observed_on: string }>();
  const points: Array<{ observedOn: string; valueMinorTwd: number; quality: string; sampleSize: number; missingCount: number; sourceRefs: Array<{ type: string; id: string }> }> = [];
  for (const row of dates.results) {
    const analysis = await netWorthAnalysis(db, `${row.observed_on}T23:59:59.999Z`);
    points.push({ observedOn: row.observed_on, valueMinorTwd: Number(analysis.result.value), quality: analysis.result.quality, sampleSize: analysis.result.sampleSize, missingCount: analysis.result.missingCount, sourceRefs: analysis.result.sourceRefs });
  }
  const sourceRefs = [...new Map(points.flatMap((point) => point.sourceRefs).map((reference) => [`${reference.type}:${reference.id}`, reference])).values()];
  const missingCount = points.reduce((sum, point) => sum + point.missingCount, 0);
  return {
    points,
    result: {
      metricKey: "finance.net_worth_trend",
      formulaVersion: 1,
      value: points.length ? String(points.at(-1)?.valueMinorTwd) : null,
      unit: "TWD minor units",
      precision: 0,
      quality: !points.length || missingCount ? "INSUFFICIENT" : "EXACT",
      sampleSize: sourceRefs.length,
      observationCount: points.length,
      missingCount,
      excludedCount: missingCount,
      window: { kind: "LOCAL_DATE_RANGE", from, to, timezone: "Asia/Taipei" },
      filters: {},
      grouping: ["input_local_date"],
      aggregation: "LATEST_SNAPSHOT_PER_ACCOUNT_THEN_ASSET_SUM_MINUS_LIABILITY_SUM",
      denominatorDefinition: "資產配置分母只包含資產；淨值另扣負債",
      sourceRefs,
      inputValues: points.map((point) => ({ key: point.observedOn, value: String(point.valueMinorTwd), sourceRef: null })),
      calculatedAt: new Date().toISOString(),
    },
    from,
    to,
  };
}
