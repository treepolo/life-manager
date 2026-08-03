import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { apiGet } from "@/app/api/client";
import { useResource } from "@/app/hooks/use-resource";
import { MetricLineChart } from "@/components/charts/MetricLineChart";
import { Field, FormError, Select, TextInput } from "@/components/design-system/FormFields";
import { PageHeader } from "@/components/design-system/PageHeader";
import { EmptyState, Panel, StatusMark } from "@/components/design-system/Panel";
import { InvestmentImportPanel } from "@/app/pages/InvestmentImportPanel";

interface Account extends Record<string, unknown> { id: string; name: string; currencyCode: string; minorUnitScale: number; accountType: string; version: number }
interface Category extends Record<string, unknown> { id: string; name: string; kind: string; version: number; archivedAt?: string | null }
interface IncomeSource extends Record<string, unknown> { id: string; name: string; version: number; archivedAt?: string | null }
interface Business extends Record<string, unknown> { id: string; name: string }
interface AnalyticMeta extends Record<string, unknown> {
  metricKey: string;
  formulaVersion: number;
  quality: string;
  sampleSize: number;
  observationCount: number;
  missingCount: number;
  excludedCount: number;
  window: Record<string, unknown>;
  filters: Record<string, unknown>;
  grouping: string[];
  aggregation: string;
  denominatorDefinition: string | null;
  calculatedAt: string;
}
interface FinanceAnalysisData {
  monthly: Array<Record<string, string | number | null>>;
  series: Array<Record<string, string | number | null>>;
  seriesProvenance: AnalyticMeta;
  incomeBySource: Array<{ period: string; sourceId: string | null; sourceName: string; amountMinor: number; sharePercent: string; observationCount: number }>;
  incomeBySourceProvenance: AnalyticMeta;
  expenseByCategory: Array<{ period: string; categoryId: string | null; categoryName: string; amountMinor: number; sharePercent: string; observationCount: number }>;
  expenseByCategoryProvenance: AnalyticMeta;
  movingAverages: Array<Record<string, unknown>>;
  independence: Record<string, unknown> | null;
  missingExchangeRates: unknown[];
  conversionEvidence: unknown[];
  unit: string;
}

function majorToMinor(value: string, scale: number): number {
  const match = value.trim().match(/^(-?)(\d+)(?:\.(\d+))?$/);
  if (!match) throw new Error("金額格式無效。");
  const fraction = (match[3] ?? "").padEnd(scale, "0");
  if (fraction.length > scale && /[1-9]/.test(fraction.slice(scale))) throw new Error("金額小數位超過幣別精度。");
  const amount = (Number(match[2]) * 10 ** scale + Number(fraction.slice(0, scale) || "0")) * (match[1] ? -1 : 1);
  if (!Number.isSafeInteger(amount)) throw new Error("金額超出安全範圍。");
  return amount;
}

export function FinancePage() {
  const accounts = useResource<Account>("financial-accounts", "?includeArchived=true");
  const categories = useResource<Category>("finance-categories", "?includeArchived=true");
  const sources = useResource<IncomeSource>("income-sources", "?includeArchived=true");
  const businesses = useResource<Business>("businesses");
  const transactions = useResource<Record<string, unknown>>("transactions", "?limit=100&includeArchived=true");
  const fxRates = useResource<Record<string, unknown>>("fx-rates", "?limit=100");
  const snapshots = useResource<Record<string, unknown>>("asset-snapshots", "?limit=100");
  const baselines = useResource<Record<string, unknown>>("expense-baselines", "?includeArchived=true");
  const [formError, setFormError] = useState<unknown>(null);
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(`${today.slice(0, 4)}-01-01`);
  const [to, setTo] = useState(today);
  const [granularity, setGranularity] = useState<"MONTH" | "QUARTER" | "YEAR">("MONTH");
  const [currencyMode, setCurrencyMode] = useState<"TWD" | "NOMINAL">("TWD");
  const [nominalCurrency, setNominalCurrency] = useState("USD");
  const [accountId, setAccountId] = useState(""); const [categoryId, setCategoryId] = useState("");
  const [incomeSourceId, setIncomeSourceId] = useState(""); const [businessId, setBusinessId] = useState("");
  const analysisParams = new URLSearchParams({ from, to, granularity, currencyMode });
  if (currencyMode === "NOMINAL") analysisParams.set("nominalCurrency", nominalCurrency);
  if (accountId) analysisParams.set("accountId", accountId); if (categoryId) analysisParams.set("categoryId", categoryId);
  if (incomeSourceId) analysisParams.set("incomeSourceId", incomeSourceId); if (businessId) analysisParams.set("businessId", businessId);
  const analysis = useQuery({
    queryKey: ["finance-analysis", analysisParams.toString()],
    queryFn: () => apiGet<{ data: FinanceAnalysisData }>(`/api/v1/finance/analysis?${analysisParams.toString()}`).then((response) => response.data),
  });
  const netWorth = useQuery({ queryKey: ["net-worth", to], queryFn: () => apiGet<{ data: Record<string, unknown> }>(`/api/v1/finance/net-worth?asOf=${to}T23:59:59.999Z`).then((response) => response.data) });
  const netWorthTrend = useQuery({ queryKey: ["net-worth-trend", from, to], queryFn: () => apiGet<{ data: { points: Array<Record<string, string | number | null>>; result: AnalyticMeta } }>(`/api/v1/finance/net-worth-trend?from=${from}&to=${to}`).then((response) => response.data) });

  const addAccount = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement);
    accounts.create.mutate({ name: form.get("name"), accountType: form.get("accountType"), currencyCode: String(form.get("currencyCode")).toUpperCase(), minorUnitScale: Number(form.get("minorUnitScale")), institution: form.get("institution"), includeInNetWorth: true }, { onSuccess: () => formElement.reset() });
  };
  const addTransaction = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setFormError(null); const formElement = event.currentTarget; const form = new FormData(formElement);
    const account = accounts.list.data?.find((item) => item.id === form.get("accountId"));
    if (!account) return;
    try {
      const amountMinor = majorToMinor(String(form.get("amount")), account.minorUnitScale);
      transactions.create.mutate({
        transactionKind: form.get("transactionKind"), occurredOnLocalDate: form.get("date"), occurredAt: null,
        timezone: "Asia/Taipei", accountId: account.id, counterpartyAccountId: null,
        categoryId: form.get("categoryId") || null, incomeSourceId: form.get("incomeSourceId") || null,
        businessId: form.get("businessId") || null, amountMinor: Math.abs(amountMinor), currencyCode: account.currencyCode,
        minorUnitScale: account.minorUnitScale, note: form.get("note"), evidenceRef: null, sourceType: "MANUAL",
      }, { onSuccess: () => { formElement.reset(); void analysis.refetch(); } });
    } catch (error) { setFormError(error); }
  };
  const addFx = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement);
    fxRates.create.mutate({ baseCurrency: String(form.get("baseCurrency")).toUpperCase(), quoteCurrency: "TWD", rateDecimal: form.get("rate"), rateDate: form.get("rateDate"), providerName: "MANUAL", evidenceRef: form.get("evidenceRef") || null, sourceType: "MANUAL" }, { onSuccess: () => formElement.reset() });
  };
  const addSnapshot = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setFormError(null); const formElement = event.currentTarget; const form = new FormData(formElement);
    const account = accounts.list.data?.find((item) => item.id === form.get("accountId")); if (!account) return;
    try {
      snapshots.create.mutate({ accountId: account.id, assetDefinitionId: null, observedAt: `${String(form.get("date"))}T12:00:00.000+08:00`, inputLocalDate: form.get("date"), amountMinor: majorToMinor(String(form.get("amount")), account.minorUnitScale), currencyCode: account.currencyCode, minorUnitScale: account.minorUnitScale, fxRateId: form.get("fxRateId") || null, reportedCashMinor: null, evidenceRef: null, sourceType: "MANUAL" }, { onSuccess: () => { formElement.reset(); void netWorth.refetch(); } });
    } catch (error) { setFormError(error); }
  };
  const editSnapshot = (event: FormEvent<HTMLFormElement>, row: Record<string, unknown>) => {
    event.preventDefault(); setFormError(null); const form = new FormData(event.currentTarget);
    const account = accounts.list.data?.find((item) => item.id === row.accountId); if (!account) return;
    try { snapshots.update.mutate({ id: String(row.id), version: Number(row.version), patch: { observedAt: `${String(form.get("date"))}T12:00:00.000+08:00`, inputLocalDate: form.get("date"), amountMinor: majorToMinor(String(form.get("amount")), account.minorUnitScale), fxRateId: form.get("fxRateId") || null } }, { onSuccess: () => void netWorth.refetch() }); }
    catch (error) { setFormError(error); }
  };
  const addBaseline = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement);
    baselines.create.mutate({ name: form.get("name"), amountMinor: majorToMinor(String(form.get("amount")), 0), currencyCode: "TWD", minorUnitScale: 0, effectiveFromLocalDate: form.get("date"), effectiveToLocalDate: null }, { onSuccess: () => { formElement.reset(); void analysis.refetch(); } });
  };
  const addCategory = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement); categories.create.mutate({ kind: form.get("kind"), name: form.get("name"), parentId: null }, { onSuccess: () => formElement.reset() }); };
  const addSource = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement); sources.create.mutate({ businessId: form.get("businessId") || null, name: form.get("name"), description: form.get("description") }, { onSuccess: () => formElement.reset() }); };
  const editTransaction = (event: FormEvent<HTMLFormElement>, row: Record<string, unknown>) => {
    event.preventDefault(); setFormError(null); const form = new FormData(event.currentTarget);
    const account = accounts.list.data?.find((item) => item.id === row.accountId); if (!account) return;
    try {
      transactions.update.mutate({ id: String(row.id), version: Number(row.version), patch: {
        transactionKind: form.get("transactionKind"), occurredOnLocalDate: form.get("date"),
        amountMinor: Math.abs(majorToMinor(String(form.get("amount")), account.minorUnitScale)), note: form.get("note"),
      } }, { onSuccess: () => void analysis.refetch() });
    } catch (error) { setFormError(error); }
  };
  const editAccount = (event: FormEvent<HTMLFormElement>, row: Account) => { event.preventDefault(); const form = new FormData(event.currentTarget); accounts.update.mutate({ id: row.id, version: row.version, patch: { name: form.get("name"), accountType: form.get("accountType"), currencyCode: String(form.get("currencyCode")).toUpperCase(), minorUnitScale: Number(form.get("minorUnitScale")), institution: form.get("institution"), includeInNetWorth: form.get("includeInNetWorth") === "on" } }); };
  const editCategory = (event: FormEvent<HTMLFormElement>, row: Category) => { event.preventDefault(); const form = new FormData(event.currentTarget); categories.update.mutate({ id: row.id, version: row.version, patch: { kind: form.get("kind"), name: form.get("name") } }); };
  const editSource = (event: FormEvent<HTMLFormElement>, row: IncomeSource) => { event.preventDefault(); const form = new FormData(event.currentTarget); sources.update.mutate({ id: row.id, version: row.version, patch: { name: form.get("name"), businessId: form.get("businessId") || null, description: form.get("description") } }); };
  const editFx = (event: FormEvent<HTMLFormElement>, row: Record<string, unknown>) => { event.preventDefault(); const form = new FormData(event.currentTarget); fxRates.update.mutate({ id: String(row.id), version: Number(row.version), patch: { baseCurrency: String(form.get("baseCurrency")).toUpperCase(), rateDecimal: form.get("rate"), rateDate: form.get("rateDate"), evidenceRef: form.get("evidenceRef") || null } }); };
  const editBaseline = (event: FormEvent<HTMLFormElement>, row: Record<string, unknown>) => { event.preventDefault(); const form = new FormData(event.currentTarget); baselines.update.mutate({ id: String(row.id), version: Number(row.version), patch: { name: form.get("name"), amountMinor: majorToMinor(String(form.get("amount")), Number(row.minorUnitScale ?? 0)), effectiveFromLocalDate: form.get("date"), effectiveToLocalDate: form.get("endDate") || null } }, { onSuccess: () => void analysis.refetch() }); };

  const series = analysis.data?.series ?? [];
  const incomeSourceNames = [...new Map((analysis.data?.incomeBySource ?? []).map((row) => [row.sourceId ?? "unassigned", row.sourceName])).entries()];
  const sourceChartData = [...new Set((analysis.data?.incomeBySource ?? []).map((row) => row.period))].sort().map((period) => {
    const point: Record<string, string | number | null> = { period };
    for (const row of analysis.data?.incomeBySource ?? []) if (row.period === period) point[row.sourceId ?? "unassigned"] = row.amountMinor;
    return point;
  });
  const movingLatest = ([3, 6, 12] as const).map((window) => ({
    window,
    income: analysis.data?.movingAverages.filter((result) => result.metricKey === `finance.average_income_${window}m`).at(-1),
    expense: analysis.data?.movingAverages.filter((result) => result.metricKey === `finance.average_expense_${window}m`).at(-1),
    coverage: analysis.data?.movingAverages.filter((result) => result.metricKey === `finance.coverage_${window}m`).at(-1),
  }));
  const netResult = netWorth.data?.result as Record<string, unknown> | undefined;
  const allocation = (netWorth.data?.allocation as Array<Record<string, unknown>> | undefined) ?? [];
  const sourceColors = ["#244f84", "#a1412d", "#246b46", "#8a6428", "#6a4b7c", "#2a7070"];
  return (
    <div className="page">
      <PageHeader eyebrow="ECONOMY / EVIDENCE" title="財務、資產與經濟自立" description="保存原幣與匯率證據。缺匯率就明確排除，不用 1 或 0 造出假的台幣淨值。" />
      <Panel title="分析範圍與結果" index="01" tone="accent">
        <div className="filter-bar"><Field label="從"><TextInput type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></Field><Field label="到"><TextInput type="date" value={to} onChange={(event) => setTo(event.target.value)} /></Field><Field label="粒度"><Select value={granularity} onChange={(event) => setGranularity(event.target.value as typeof granularity)}><option value="MONTH">月</option><option value="QUARTER">季</option><option value="YEAR">年</option></Select></Field><Field label="金額口徑"><Select value={currencyMode} onChange={(event) => setCurrencyMode(event.target.value as typeof currencyMode)}><option value="TWD">TWD換算</option><option value="NOMINAL">名目原幣</option></Select></Field>{currencyMode === "NOMINAL" ? <Field label="原幣"><Select value={nominalCurrency} onChange={(event) => setNominalCurrency(event.target.value)}>{[...new Set(accounts.list.data?.map((account) => account.currencyCode) ?? ["USD"])].map((currency) => <option key={currency} value={currency}>{currency}</option>)}</Select></Field> : null}<Field label="帳戶"><Select value={accountId} onChange={(event) => setAccountId(event.target.value)}><option value="">全部</option>{accounts.list.data?.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</Select></Field><Field label="分類"><Select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}><option value="">全部</option>{categories.list.data?.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</Select></Field><Field label="收入來源"><Select value={incomeSourceId} onChange={(event) => setIncomeSourceId(event.target.value)}><option value="">全部</option>{sources.list.data?.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}</Select></Field><Field label="事業"><Select value={businessId} onChange={(event) => setBusinessId(event.target.value)}><option value="">全部</option>{businesses.list.data?.map((business) => <option key={business.id} value={business.id}>{business.name}</option>)}</Select></Field><div><span>淨值</span><strong className="hero-number">{netResult?.value == null ? "缺少資料" : `${Number(netResult.value).toLocaleString("zh-TW")} TWD`}</strong></div></div>
        {analysis.data?.missingExchangeRates.length ? <p className="warning-line">有 {analysis.data.missingExchangeRates.length} 筆交易缺少換算匯率，已排除於TWD分析。</p> : null}
        <MetricLineChart title="收入、開銷與淨現金流" subtitle={`${from} 至 ${to}；${granularity === "MONTH" ? "月" : granularity === "QUARTER" ? "季" : "年"}粒度；${analysis.data?.unit ?? "TWD minor units"}`} data={series} xKey="month" xAxisName={granularity === "MONTH" ? "月份（Asia/Taipei）" : granularity === "QUARTER" ? "季度（Asia/Taipei）" : "年份（Asia/Taipei）"} yAxisName="金額" unit={analysis.data?.unit ?? "TWD minor units"} series={[{ key: "incomeMinor", name: "收入", color: "#246b46" }, { key: "expenseMinor", name: "開銷", color: "#d35a3a" }, { key: "netCashFlowMinor", name: "淨現金流", color: "#253248", dash: "5 3" }]} definition="依所選粒度彙總收入、開銷絕對值與淨現金流；所有篩選在同一正式交易集合上套用。TWD模式只納入具指定日期匯率證據的交易。" source={`financial_transactions + fx_rates；公式版本 1；換算證據 ${analysis.data?.conversionEvidence.length ?? 0} 筆`} sampleSize={analysis.data?.seriesProvenance.sampleSize ?? 0} missingCount={analysis.data?.seriesProvenance.missingCount ?? 0} lastUpdated={analysis.data?.seriesProvenance.calculatedAt ?? null} provenance={analysis.data?.seriesProvenance} evidenceHref="#financial-transaction-records" />
        <MetricLineChart title="各收入來源趨勢" subtitle={`${from} 至 ${to}；各系列為正式收入來源，未指定者獨立列示`} data={sourceChartData} xKey="period" xAxisName="期間（Asia/Taipei）" yAxisName="收入" unit={analysis.data?.unit ?? "TWD minor units"} series={incomeSourceNames.map(([key, name], index) => ({ key, name, color: sourceColors[index % sourceColors.length] }))} definition="依收入來源與期間加總收入，同期占比以該來源收入除以所有收入；切換圖例不修改原始交易。" source="financial_transactions.income_source_id；公式版本 1" sampleSize={analysis.data?.incomeBySourceProvenance.sampleSize ?? 0} missingCount={analysis.data?.incomeBySourceProvenance.missingCount ?? 0} lastUpdated={analysis.data?.incomeBySourceProvenance.calculatedAt ?? null} provenance={analysis.data?.incomeBySourceProvenance} evidenceHref="#financial-transaction-records" />
        <MetricLineChart title="淨值時間趨勢" subtitle={`${from} 至 ${to}；每個快照日期取各帳戶當時最近快照`} data={netWorthTrend.data?.points ?? []} xKey="observedOn" xAxisName="快照日期（Asia/Taipei）" yAxisName="淨值" unit="TWD minor units" series={[{ key: "valueMinorTwd", name: "淨值", color: "#253248" }]} definition="每個快照日期的資產總和減負債總和；資產配置分母不含負債，淨值仍扣除負債。缺匯率快照明確排除。" source="asset_snapshots + financial_accounts + fx_rates；公式版本 1" sampleSize={netWorthTrend.data?.result.sampleSize ?? 0} missingCount={netWorthTrend.data?.result.missingCount ?? 0} lastUpdated={netWorthTrend.data?.result.calculatedAt ?? null} provenance={netWorthTrend.data?.result} evidenceHref="#asset-snapshot-records" />
        <div className="data-table-wrap"><table className="data-table"><thead><tr><th>視窗</th><th>平均收入</th><th>平均開銷</th><th>覆蓋率</th><th>樣本／缺失</th></tr></thead><tbody>{movingLatest.map((row) => <tr key={row.window}><td>{row.window}個月</td><td>{row.income ? String(row.income.value) : "資料不足"}</td><td>{row.expense ? String(row.expense.value) : "資料不足"}</td><td>{row.coverage?.value == null ? "資料不足" : `${String(row.coverage.value)}%`}</td><td>{row.income ? `${String(row.income.sampleSize)}／${String(row.income.missingCount)}` : "0／0"}</td></tr>)}</tbody></table></div>
        {analysis.data?.independence ? <p className="support-copy">收入高於生活基準月份：{String(analysis.data.independence.value)}；樣本 {String(analysis.data.independence.sampleSize)} 個月。計算月份與來源可於分析回應追溯。</p> : <p className="support-copy">尚無可用的TWD生活基準，或目前使用原幣模式，因此不顯示經濟自立距離。</p>}
        <div className="data-table-wrap"><table className="data-table"><thead><tr><th>期間</th><th>支出分類</th><th>金額</th><th>同期占比</th><th>觀測數</th></tr></thead><tbody>{analysis.data?.expenseByCategory.map((row) => <tr key={`${row.period}-${row.categoryId ?? "unassigned"}`}><td>{row.period}</td><td>{row.categoryName}</td><td>{row.amountMinor.toLocaleString("zh-TW")} {analysis.data?.unit}</td><td>{Number(row.sharePercent).toFixed(2)}%</td><td>{row.observationCount}</td></tr>)}</tbody></table></div>
        <div className="data-table-wrap"><table className="data-table"><thead><tr><th>資產／帳戶</th><th>TWD金額</th><th>資產配置</th></tr></thead><tbody>{allocation.map((row) => <tr key={String(row.accountId)}><td>{String(row.name)}</td><td>{Number(row.amountMinorTwd).toLocaleString("zh-TW")}</td><td>{Number(row.sharePercent).toFixed(2)}%</td></tr>)}</tbody></table></div>
      </Panel>
      <div className="finance-input-grid">
        <Panel title="帳戶" index="02"><form className="form-grid" onSubmit={addAccount}><Field label="名稱"><TextInput name="name" required /></Field><Field label="類型"><Select name="accountType"><option value="CASH">現金</option><option value="BANK">銀行</option><option value="BROKERAGE">券商</option><option value="ASSET">其他資產</option><option value="LIABILITY">負債</option></Select></Field><Field label="幣別"><TextInput name="currencyCode" defaultValue="TWD" pattern="[A-Za-z]{3}" required /></Field><Field label="小數位"><TextInput name="minorUnitScale" type="number" min="0" max="6" defaultValue="0" required /></Field><Field label="機構"><TextInput name="institution" /></Field><button className="button">新增帳戶</button></form></Panel>
        <Panel title="收入／支出" index="03"><form className="form-grid" onSubmit={addTransaction}><Field label="類型"><Select name="transactionKind"><option value="INCOME">收入</option><option value="EXPENSE">支出</option></Select></Field><Field label="日期"><TextInput name="date" type="date" defaultValue={today} required /></Field><Field label="帳戶"><Select name="accountId" required><option value="">請選擇</option>{accounts.list.data?.filter((account) => !account.archivedAt).map((account) => <option key={account.id} value={account.id}>{account.name} · {account.currencyCode}</option>)}</Select></Field><Field label="原幣金額"><TextInput name="amount" inputMode="decimal" required /></Field><Field label="分類"><Select name="categoryId"><option value="">未分類</option>{categories.list.data?.filter((category) => !category.archivedAt).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</Select></Field><Field label="收入來源"><Select name="incomeSourceId"><option value="">不適用</option>{sources.list.data?.filter((source) => !source.archivedAt).map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}</Select></Field><Field label="事業"><Select name="businessId"><option value="">未關聯</option>{businesses.list.data?.map((business) => <option key={business.id} value={business.id}>{business.name}</option>)}</Select></Field><Field label="備註"><TextInput name="note" /></Field><FormError error={formError || transactions.create.error} /><button className="button">記錄交易</button></form></Panel>
        <Panel title="手動匯率" index="04"><form className="form-grid" onSubmit={addFx}><Field label="原幣"><TextInput name="baseCurrency" defaultValue="USD" pattern="[A-Za-z]{3}" required /></Field><Field label="TWD 匯率"><TextInput name="rate" inputMode="decimal" required /></Field><Field label="匯率日期"><TextInput name="rateDate" type="date" defaultValue={today} required /></Field><Field label="證據說明"><TextInput name="evidenceRef" placeholder="銀行牌告／CSV欄位等" /></Field><button className="button">保存匯率</button></form></Panel>
        <Panel title="資產／帳戶快照" index="05"><form className="form-grid" onSubmit={addSnapshot}><Field label="帳戶"><Select name="accountId" required><option value="">請選擇</option>{accounts.list.data?.filter((account) => !account.archivedAt).map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</Select></Field><Field label="原幣總值"><TextInput name="amount" inputMode="decimal" required /></Field><Field label="日期"><TextInput name="date" type="date" defaultValue={today} required /></Field><Field label="匯率證據"><Select name="fxRateId"><option value="">同幣別或尚未指定</option>{fxRates.list.data?.map((rate) => <option key={String(rate.id)} value={String(rate.id)}>{String(rate.baseCurrency)}/TWD {String(rate.rateDecimal)} · {String(rate.rateDate)}</option>)}</Select></Field><button className="button">保存快照</button></form></Panel>
        <Panel title="生活開銷基準" index="06"><form className="form-grid" onSubmit={addBaseline}><Field label="名稱"><TextInput name="name" required /></Field><Field label="每月 TWD"><TextInput name="amount" inputMode="numeric" required /></Field><Field label="生效日"><TextInput name="date" type="date" defaultValue={today} required /></Field><button className="button">保存基準</button></form></Panel>
        <Panel title="分類與收入來源" index="06A"><form className="form-grid" onSubmit={addCategory}><Field label="分類類型"><Select name="kind"><option value="INCOME">收入</option><option value="EXPENSE">支出</option><option value="ASSET">資產</option><option value="LIABILITY">負債</option></Select></Field><Field label="分類名稱"><TextInput name="name" required /></Field><button className="button">新增分類</button></form><form className="form-grid section-break" onSubmit={addSource}><Field label="收入來源"><TextInput name="name" required /></Field><Field label="所屬事業"><Select name="businessId"><option value="">未關聯</option>{businesses.list.data?.map((business) => <option key={business.id} value={business.id}>{business.name}</option>)}</Select></Field><Field label="說明"><TextInput name="description" /></Field><button className="button button--quiet">新增收入來源</button></form></Panel>
      </div>
      <Panel title="財務設定資料" index="06B">
        <div className="data-table-wrap"><table className="data-table"><thead><tr><th>帳戶</th><th>類型／幣別</th><th>狀態</th><th>操作</th></tr></thead><tbody>{accounts.list.data?.map((row) => <tr key={row.id}><td>{row.name}</td><td>{row.accountType} · {row.currencyCode}</td><td><StatusMark tone={row.archivedAt ? "neutral" : "good"}>{row.archivedAt ? "已封存" : "啟用"}</StatusMark></td><td><details className="inline-editor"><summary>編輯帳戶</summary><form className="form-grid" onSubmit={(event) => editAccount(event, row)}><Field label="名稱"><TextInput name="name" defaultValue={row.name} required /></Field><Field label="類型"><Select name="accountType" defaultValue={row.accountType}><option value="CASH">現金</option><option value="BANK">銀行</option><option value="BROKERAGE">券商</option><option value="ASSET">其他資產</option><option value="LIABILITY">負債</option></Select></Field><Field label="幣別"><TextInput name="currencyCode" defaultValue={row.currencyCode} pattern="[A-Za-z]{3}" required /></Field><Field label="小數位"><TextInput name="minorUnitScale" type="number" min="0" max="6" defaultValue={row.minorUnitScale} required /></Field><Field label="機構"><TextInput name="institution" defaultValue={String(row.institution ?? "")} /></Field><label className="check-field"><input type="checkbox" name="includeInNetWorth" defaultChecked={Boolean(row.includeInNetWorth)} />納入淨值</label><button className="button">保存</button><button className="button button--quiet" type="button" onClick={() => accounts.archive.mutate({ id: row.id, version: row.version, restore: Boolean(row.archivedAt) })}>{row.archivedAt ? "恢復" : "封存"}</button></form></details></td></tr>)}</tbody></table></div>
        <div className="data-table-wrap"><table className="data-table"><thead><tr><th>分類</th><th>類型</th><th>狀態</th><th>操作</th></tr></thead><tbody>{categories.list.data?.map((row) => <tr key={row.id}><td>{row.name}</td><td>{row.kind}</td><td>{row.archivedAt ? "已封存" : "啟用"}</td><td><details className="inline-editor"><summary>編輯分類</summary><form className="inline-form" onSubmit={(event) => editCategory(event, row)}><Field label="類型"><Select name="kind" defaultValue={row.kind}><option value="INCOME">收入</option><option value="EXPENSE">支出</option><option value="ASSET">資產</option><option value="LIABILITY">負債</option></Select></Field><Field label="名稱"><TextInput name="name" defaultValue={row.name} required /></Field><button className="button">保存</button><button className="button button--quiet" type="button" onClick={() => categories.archive.mutate({ id: row.id, version: row.version, restore: Boolean(row.archivedAt) })}>{row.archivedAt ? "恢復" : "封存"}</button></form></details></td></tr>)}</tbody></table></div>
        <div className="data-table-wrap"><table className="data-table"><thead><tr><th>收入來源</th><th>事業</th><th>狀態</th><th>操作</th></tr></thead><tbody>{sources.list.data?.map((row) => <tr key={row.id}><td>{row.name}</td><td>{businesses.list.data?.find((business) => business.id === row.businessId)?.name ?? "未關聯"}</td><td>{row.archivedAt ? "已封存" : "啟用"}</td><td><details className="inline-editor"><summary>編輯來源</summary><form className="form-grid" onSubmit={(event) => editSource(event, row)}><Field label="名稱"><TextInput name="name" defaultValue={row.name} required /></Field><Field label="事業"><Select name="businessId" defaultValue={String(row.businessId ?? "")}><option value="">未關聯</option>{businesses.list.data?.map((business) => <option key={business.id} value={business.id}>{business.name}</option>)}</Select></Field><Field label="說明"><TextInput name="description" defaultValue={String(row.description ?? "")} /></Field><button className="button">保存</button><button className="button button--quiet" type="button" onClick={() => sources.archive.mutate({ id: row.id, version: row.version, restore: Boolean(row.archivedAt) })}>{row.archivedAt ? "恢復" : "封存"}</button></form></details></td></tr>)}</tbody></table></div>
        <div className="data-table-wrap"><table className="data-table"><thead><tr><th>匯率日期</th><th>匯率</th><th>證據</th><th>操作</th></tr></thead><tbody>{fxRates.list.data?.map((row) => <tr key={String(row.id)}><td>{String(row.rateDate)}</td><td>{String(row.baseCurrency)}/TWD {String(row.rateDecimal)}</td><td>{String(row.evidenceRef ?? "未提供")}</td><td><details className="inline-editor"><summary>編輯匯率</summary><form className="form-grid" onSubmit={(event) => editFx(event, row)}><Field label="原幣"><TextInput name="baseCurrency" defaultValue={String(row.baseCurrency)} pattern="[A-Za-z]{3}" required /></Field><Field label="匯率"><TextInput name="rate" defaultValue={String(row.rateDecimal)} required /></Field><Field label="日期"><TextInput name="rateDate" type="date" defaultValue={String(row.rateDate)} required /></Field><Field label="證據"><TextInput name="evidenceRef" defaultValue={String(row.evidenceRef ?? "")} /></Field><button className="button">保存</button><button className="button button--quiet" type="button" onClick={() => fxRates.archive.mutate({ id: String(row.id), version: Number(row.version) })}>刪除</button></form></details></td></tr>)}</tbody></table></div>
        <div className="data-table-wrap"><table className="data-table"><thead><tr><th>生活基準</th><th>金額</th><th>生效期間</th><th>操作</th></tr></thead><tbody>{baselines.list.data?.map((row) => <tr key={String(row.id)}><td>{String(row.name)}</td><td>{(Number(row.amountMinor) / 10 ** Number(row.minorUnitScale)).toFixed(Number(row.minorUnitScale))} {String(row.currencyCode)}</td><td>{String(row.effectiveFromLocalDate)}–{String(row.effectiveToLocalDate ?? "持續")}</td><td><details className="inline-editor"><summary>編輯基準</summary><form className="form-grid" onSubmit={(event) => editBaseline(event, row)}><Field label="名稱"><TextInput name="name" defaultValue={String(row.name)} required /></Field><Field label="金額"><TextInput name="amount" defaultValue={String(Number(row.amountMinor) / 10 ** Number(row.minorUnitScale))} required /></Field><Field label="生效日"><TextInput name="date" type="date" defaultValue={String(row.effectiveFromLocalDate)} required /></Field><Field label="結束日"><TextInput name="endDate" type="date" defaultValue={String(row.effectiveToLocalDate ?? "")} /></Field><button className="button">保存</button><button className="button button--quiet" type="button" onClick={() => baselines.archive.mutate({ id: String(row.id), version: Number(row.version), restore: Boolean(row.archivedAt) })}>{row.archivedAt ? "恢復" : "封存"}</button></form></details></td></tr>)}</tbody></table></div>
        <FormError error={accounts.update.error || accounts.archive.error || categories.update.error || categories.archive.error || sources.update.error || sources.archive.error || fxRates.update.error || fxRates.archive.error || baselines.update.error || baselines.archive.error} />
      </Panel>
      <Panel title="最近交易" index="07" id="financial-transaction-records">
        {!transactions.list.data?.length ? <EmptyState title="尚無財務交易" detail="先建立帳戶，再記錄收入或支出。" /> : <div className="data-table-wrap"><table className="data-table"><thead><tr><th>日期</th><th>類型</th><th>原幣金額</th><th>來源</th><th>狀態</th><th>操作</th></tr></thead><tbody>{transactions.list.data.map((row) => { const account = accounts.list.data?.find((item) => item.id === row.accountId); const scale = account?.minorUnitScale ?? Number(row.minorUnitScale ?? 0); const major = (Number(row.amountMinor) / 10 ** scale).toFixed(scale); return <tr key={String(row.id)}><td>{String(row.occurredOnLocalDate)}</td><td>{String(row.transactionKind)}</td><td>{major} {String(row.currencyCode)}</td><td>{String(row.sourceType)}</td><td><StatusMark tone={row.archivedAt ? "neutral" : row.pending ? "pending" : "good"}>{row.archivedAt ? "已封存" : row.pending ? "待同步" : "已保存"}</StatusMark></td><td><details className="inline-editor"><summary>編輯</summary><form className="form-grid" onSubmit={(event) => editTransaction(event, row)}><Field label="類型"><Select name="transactionKind" defaultValue={String(row.transactionKind)}><option value="INCOME">收入</option><option value="EXPENSE">支出</option></Select></Field><Field label="日期"><TextInput name="date" type="date" defaultValue={String(row.occurredOnLocalDate)} required /></Field><Field label="原幣金額"><TextInput name="amount" defaultValue={major} required /></Field><Field label="備註"><TextInput name="note" defaultValue={String(row.note ?? "")} /></Field><button className="button">保存修改</button><button className="button button--quiet" type="button" onClick={() => transactions.archive.mutate({ id: String(row.id), version: Number(row.version), restore: Boolean(row.archivedAt) })}>{row.archivedAt ? "恢復" : "封存"}</button></form></details></td></tr>; })}</tbody></table></div>}
      </Panel>
      <Panel title="資產快照紀錄" index="08" id="asset-snapshot-records">{!snapshots.list.data?.length ? <EmptyState title="尚無資產快照" detail="建立帳戶快照後才會計算淨值與配置，不會顯示示範資產。" /> : <div className="data-table-wrap"><table className="data-table"><thead><tr><th>日期</th><th>帳戶</th><th>原幣總值</th><th>來源</th><th>操作</th></tr></thead><tbody>{snapshots.list.data.map((row) => { const account = accounts.list.data?.find((item) => item.id === row.accountId); const scale = account?.minorUnitScale ?? Number(row.minorUnitScale ?? 0); const major = (Number(row.amountMinor) / 10 ** scale).toFixed(scale); return <tr key={String(row.id)}><td>{String(row.inputLocalDate)}</td><td>{account?.name ?? String(row.accountId)}</td><td>{major} {String(row.currencyCode)}</td><td>{String(row.sourceType)}</td><td>{row.sourceType === "MANUAL" ? <details className="inline-editor"><summary>編輯</summary><form className="form-grid" onSubmit={(event) => editSnapshot(event, row)}><Field label="日期"><TextInput name="date" type="date" defaultValue={String(row.inputLocalDate)} required /></Field><Field label="原幣總值"><TextInput name="amount" defaultValue={major} required /></Field><Field label="匯率證據"><Select name="fxRateId" defaultValue={String(row.fxRateId ?? "")}><option value="">同幣別或尚未指定</option>{fxRates.list.data?.map((rate) => <option key={String(rate.id)} value={String(rate.id)}>{String(rate.baseCurrency)}/TWD {String(rate.rateDecimal)} · {String(rate.rateDate)}</option>)}</Select></Field><button className="button">保存修改</button><button className="button button--quiet" type="button" onClick={() => snapshots.archive.mutate({ id: String(row.id), version: Number(row.version) })}>刪除</button></form></details> : <span>來源資料不可手動改寫</span>}</td></tr>; })}</tbody></table></div>}</Panel>
      <InvestmentImportPanel />
    </div>
  );
}
