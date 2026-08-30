import type { FinancialMetricKind } from "@/modules/simple/schema";

export interface TaskCategoryRecord {
  id: string;
  name: string;
  archivedAt?: string | null;
}

export interface DailyTaskRecord {
  id: string;
  categoryId: string;
  createdAt?: string | null;
  archivedAt?: string | null;
}

export interface DailyTaskCompletionRecord {
  id: string;
  taskId: string;
  completedLocalDate: string;
}

export interface FinancialHistoryRecord {
  id: string;
  metricKind: FinancialMetricKind;
  effectiveLocalDate: string;
  amountMinor: number;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface TaskSeriesPoint {
  date: string;
  [categoryId: string]: string | number;
}

export interface FinancialSeriesPoint {
  date: string;
  value: number;
}

export function buildTaskCategorySeries(input: {
  categories: TaskCategoryRecord[];
  tasks: DailyTaskRecord[];
  completions: DailyTaskCompletionRecord[];
  today: string;
}): TaskSeriesPoint[] {
  const taskCategory = new Map(input.tasks.map((task) => [task.id, task.categoryId]));
  const validCategoryIds = new Set(input.categories.map((category) => category.id));
  const relevantCompletions = input.completions.filter((completion) => {
    const categoryId = taskCategory.get(completion.taskId);
    return Boolean(categoryId && validCategoryIds.has(categoryId) && completion.completedLocalDate <= input.today);
  });
  if (!relevantCompletions.length) return [];

  const completionDates = relevantCompletions.map((completion) => completion.completedLocalDate);
  const eventDates = [...new Set([...completionDates, input.today])].sort();
  const totals = new Map(input.categories.map((category) => [category.id, 0]));
  const byDate = new Map<string, DailyTaskCompletionRecord[]>();
  for (const completion of relevantCompletions) {
    const bucket = byDate.get(completion.completedLocalDate) ?? [];
    bucket.push(completion);
    byDate.set(completion.completedLocalDate, bucket);
  }

  return eventDates.map((date) => {
    for (const completion of byDate.get(date) ?? []) {
      const categoryId = taskCategory.get(completion.taskId);
      if (categoryId && totals.has(categoryId)) totals.set(categoryId, (totals.get(categoryId) ?? 0) + 1);
    }
    return Object.fromEntries([
      ["date", date],
      ...input.categories.map((category) => [category.id, totals.get(category.id) ?? 0] as const),
    ]) as TaskSeriesPoint;
  });
}

function historyOrder(a: FinancialHistoryRecord, b: FinancialHistoryRecord): number {
  if (a.effectiveLocalDate !== b.effectiveLocalDate) return a.effectiveLocalDate.localeCompare(b.effectiveLocalDate);
  const aCreated = a.createdAt ?? "";
  const bCreated = b.createdAt ?? "";
  if (aCreated !== bCreated) return aCreated.localeCompare(bCreated);
  return a.id.localeCompare(b.id);
}

export function buildFinancialSeries(
  history: FinancialHistoryRecord[],
  metricKind: FinancialMetricKind,
  today: string,
): FinancialSeriesPoint[] {
  const ordered = history
    .filter((record) => record.metricKind === metricKind && record.effectiveLocalDate <= today)
    .sort(historyOrder);
  if (!ordered.length) return [];

  const lastByDate = new Map<string, FinancialHistoryRecord>();
  for (const record of ordered) lastByDate.set(record.effectiveLocalDate, record);
  const points = [...lastByDate.values()]
    .sort(historyOrder)
    .map((record) => ({ date: record.effectiveLocalDate, value: record.amountMinor }));
  const last = points.at(-1);
  if (last && last.date !== today) points.push({ date: today, value: last.value });
  return points;
}

export function currentFinancialValue(
  history: FinancialHistoryRecord[],
  metricKind: FinancialMetricKind,
  today: string,
): FinancialHistoryRecord | null {
  return history
    .filter((record) => record.metricKind === metricKind && record.effectiveLocalDate <= today)
    .sort(historyOrder)
    .at(-1) ?? null;
}
