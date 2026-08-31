import { shiftDays, shiftMonths } from "@/modules/simple/date";
import type { FinancialHistory } from "@/modules/simple/model";
import type { FinancialMetricKind } from "@/modules/simple/schema";
import { peopleBelow, type TaiwanDistributionModel } from "@/modules/simple/taiwan-distributions";

const PEOPLE_MILESTONES = [
  1_000,
  2_000,
  5_000,
  10_000,
  20_000,
  50_000,
  100_000,
  200_000,
  500_000,
  1_000_000,
  2_000_000,
  5_000_000,
  10_000_000,
];
const SMALL_PEOPLE_MILESTONES = [1, 2, 5, 10, 20, 50, 100, 200, 500];

export interface PopulationNextStep {
  amountIncrease: number;
  additionalPeople: number;
  targetAmount: number;
}

export interface PopulationHistoryChange {
  baselineLabel: string;
  amountChange: number;
  peopleChange: number;
}

export interface PopulationComparisonInsight {
  currentAmount: number | null;
  currentPeople: number | null;
  nextStep: PopulationNextStep | null;
  historyChange: PopulationHistoryChange | null;
}

interface BuildPopulationComparisonInsightInput {
  model: TaiwanDistributionModel;
  metricKind: FinancialMetricKind;
  history: FinancialHistory[];
  goal: number | null;
  today: string;
}

function historyOrder(a: FinancialHistory, b: FinancialHistory): number {
  if (a.effectiveLocalDate !== b.effectiveLocalDate) return a.effectiveLocalDate.localeCompare(b.effectiveLocalDate);
  const aCreated = a.createdAt ?? "";
  const bCreated = b.createdAt ?? "";
  if (aCreated !== bCreated) return aCreated.localeCompare(bCreated);
  return a.id.localeCompare(b.id);
}

function canonicalHistory(history: FinancialHistory[], metricKind: FinancialMetricKind, today: string): FinancialHistory[] {
  const ordered = history
    .filter((record) => record.metricKind === metricKind && !record.deletedAt && record.effectiveLocalDate <= today)
    .sort(historyOrder);
  const lastByDate = new Map<string, FinancialHistory>();
  for (const record of ordered) lastByDate.set(record.effectiveLocalDate, record);
  return [...lastByDate.values()].sort(historyOrder);
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  if (ordered.length % 2 === 1) return ordered[middle];
  return (ordered[middle - 1] + ordered[middle]) / 2;
}

function preferredAmountStep(
  records: FinancialHistory[],
  metricKind: FinancialMetricKind,
  currentAmount: number,
  goal: number | null,
): number {
  const recent = records.slice(-6);
  const positiveChanges: number[] = [];
  for (let index = 1; index < recent.length; index += 1) {
    const change = recent[index].amountMinor - recent[index - 1].amountMinor;
    if (change > 0) positiveChanges.push(change);
  }
  const typical = median(positiveChanges.slice(-4));
  if (typical !== null && typical >= 1) return Math.max(1, Math.round(typical));
  if (goal !== null && goal > currentAmount) return Math.max(1, Math.round((goal - currentAmount) / 4));
  const floor = metricKind === "MONTHLY_INCOME" ? 1_000 : 10_000;
  return Math.max(floor, Math.round(Math.abs(currentAmount) * 0.05));
}

function amountNeededForAdditionalPeople(
  model: TaiwanDistributionModel,
  currentAmount: number,
  additionalPeople: number,
): number | null {
  const currentBelow = peopleBelow(model, currentAmount);
  const targetBelow = currentBelow + additionalPeople;
  const isCapped = model.tail.type === "piecewise-pareto-capped";
  const maximumTarget = isCapped ? model.comparisonPopulation : model.comparisonPopulation - 0.5;
  if (targetBelow > maximumTarget) return null;

  let low = currentAmount + 1;
  if (!Number.isSafeInteger(low)) return null;
  if (peopleBelow(model, low) >= targetBelow) return low;

  let step = Math.max(1, Math.ceil(Math.max(Math.abs(currentAmount), 100) * 0.01));
  let high = currentAmount + step;
  for (let index = 0; index < 80 && peopleBelow(model, high) < targetBelow; index += 1) {
    step *= 2;
    high = currentAmount + step;
    if (!Number.isSafeInteger(high)) return null;
  }
  if (peopleBelow(model, high) < targetBelow) return null;

  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (peopleBelow(model, middle) >= targetBelow) high = middle;
    else low = middle + 1;
  }
  return low;
}

function buildNextStep(
  model: TaiwanDistributionModel,
  metricKind: FinancialMetricKind,
  records: FinancialHistory[],
  currentAmount: number,
  goal: number | null,
): PopulationNextStep | null {
  const currentBelow = peopleBelow(model, currentAmount);
  const remaining = model.comparisonPopulation - currentBelow;
  if (remaining <= 0.5) return null;
  const milestones = remaining >= 1_000 ? PEOPLE_MILESTONES : SMALL_PEOPLE_MILESTONES;
  const preferredStep = preferredAmountStep(records, metricKind, currentAmount, goal);
  const candidates = milestones
    .filter((milestone) => milestone <= remaining)
    .map((milestone) => {
      const targetAmount = amountNeededForAdditionalPeople(model, currentAmount, milestone);
      if (targetAmount === null) return null;
      const amountIncrease = targetAmount - currentAmount;
      const actualGain = Math.max(0, Math.round(peopleBelow(model, targetAmount) - currentBelow));
      const displayedGain = actualGain > milestone * 1.5 ? actualGain : milestone;
      const score = Math.abs(Math.log(Math.max(amountIncrease, 1) / Math.max(preferredStep, 1)));
      return { amountIncrease, additionalPeople: displayedGain, targetAmount, score, milestone };
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
    .sort((a, b) => a.score - b.score || b.milestone - a.milestone);
  const best = candidates[0];
  return best ? { amountIncrease: best.amountIncrease, additionalPeople: best.additionalPeople, targetAmount: best.targetAmount } : null;
}

function recordAtOrBefore(records: FinancialHistory[], date: string): FinancialHistory | null {
  return records.filter((record) => record.effectiveLocalDate <= date).at(-1) ?? null;
}

function buildHistoryChange(
  model: TaiwanDistributionModel,
  records: FinancialHistory[],
  currentRecord: FinancialHistory,
  today: string,
): PopulationHistoryChange | null {
  if (records.length < 2) return null;
  const currentPeople = peopleBelow(model, currentRecord.amountMinor);
  const previous = records.at(-2) ?? null;
  const first = records[0] ?? null;
  const rawCandidates = [
    { label: "上次紀錄", record: previous, threshold: 1_000 },
    { label: "30 天前", record: recordAtOrBefore(records, shiftDays(today, -30)), threshold: 2_000 },
    { label: "3 個月前", record: recordAtOrBefore(records, shiftMonths(today, -3)), threshold: 5_000 },
    { label: "6 個月前", record: recordAtOrBefore(records, shiftMonths(today, -6)), threshold: 10_000 },
    { label: "1 年前", record: recordAtOrBefore(records, shiftMonths(today, -12)), threshold: 20_000 },
    { label: "開始記錄", record: first, threshold: 20_000 },
  ];

  const seen = new Set<string>();
  const candidates = rawCandidates.flatMap(({ label, record, threshold }) => {
    if (!record || record.id === currentRecord.id || seen.has(record.id)) return [];
    seen.add(record.id);
    const amountChange = currentRecord.amountMinor - record.amountMinor;
    const peopleChange = Math.round(currentPeople - peopleBelow(model, record.amountMinor));
    if (amountChange === 0 || peopleChange === 0) return [];
    return [{ baselineLabel: label, amountChange, peopleChange, threshold }];
  });
  if (!candidates.length) return null;
  const meaningful = candidates.find((candidate) => Math.abs(candidate.peopleChange) >= candidate.threshold);
  const selected = meaningful ?? candidates[0];
  return {
    baselineLabel: selected.baselineLabel,
    amountChange: selected.amountChange,
    peopleChange: selected.peopleChange,
  };
}

export function buildPopulationComparisonInsight(input: BuildPopulationComparisonInsightInput): PopulationComparisonInsight {
  const records = canonicalHistory(input.history, input.metricKind, input.today);
  const currentRecord = records.at(-1) ?? null;
  if (!currentRecord) {
    return { currentAmount: null, currentPeople: null, nextStep: null, historyChange: null };
  }
  return {
    currentAmount: currentRecord.amountMinor,
    currentPeople: Math.round(peopleBelow(input.model, currentRecord.amountMinor)),
    nextStep: buildNextStep(input.model, input.metricKind, records, currentRecord.amountMinor, input.goal),
    historyChange: buildHistoryChange(input.model, records, currentRecord, input.today),
  };
}
