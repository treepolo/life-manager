import { currentFinancialValue, type FinancialHistoryRecord } from "@/modules/simple/analytics";
import { shiftMonths } from "@/modules/simple/date";
import type { DailyTask, DailyTaskCompletion } from "@/modules/simple/model";
import type { FinancialMetricKind } from "@/modules/simple/schema";

export const TASK_MILESTONES = [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000] as const;

export interface TaskAchievement {
  taskId: string;
  achievementName: string;
  achievementUnit: string;
  count: number;
  latestCompletionDate: string | null;
  reachedMilestone: number | null;
  nextMilestone: number | null;
  isExactMilestone: boolean;
  milestoneProgress: number;
}

export function buildTaskAchievements(
  tasks: DailyTask[],
  completions: DailyTaskCompletion[],
  today: string,
): TaskAchievement[] {
  const validCompletions = completions.filter((completion) => completion.completedLocalDate <= today && !completion.deletedAt);
  return tasks
    .filter((task) => !task.deletedAt && task.achievementName.trim() && task.achievementUnit.trim())
    .map((task) => {
      const taskCompletions = validCompletions
        .filter((completion) => completion.taskId === task.id)
        .sort((a, b) => a.completedLocalDate.localeCompare(b.completedLocalDate));
      const count = taskCompletions.length;
      const reachedMilestone = [...TASK_MILESTONES].reverse().find((milestone) => milestone <= count) ?? null;
      const nextMilestone = TASK_MILESTONES.find((milestone) => milestone > count) ?? null;
      const lower = reachedMilestone ?? 0;
      const upper = nextMilestone ?? Math.max(count, 1);
      const milestoneProgress = upper === lower ? 1 : Math.max(0, Math.min((count - lower) / (upper - lower), 1));
      return {
        taskId: task.id,
        achievementName: task.achievementName,
        achievementUnit: task.achievementUnit,
        count,
        latestCompletionDate: taskCompletions.at(-1)?.completedLocalDate ?? null,
        reachedMilestone,
        nextMilestone,
        isExactMilestone: TASK_MILESTONES.includes(count as (typeof TASK_MILESTONES)[number]),
        milestoneProgress,
      };
    })
    .sort((a, b) => {
      const latest = String(b.latestCompletionDate ?? "").localeCompare(String(a.latestCompletionDate ?? ""));
      return latest || b.count - a.count || a.achievementName.localeCompare(b.achievementName, "zh-Hant");
    });
}

export interface FinancialAchievement {
  current: number | null;
  changeFromFirst: number | null;
  sixMonthChangePercent: number | null;
  isRecordHigh: boolean;
}

function historyOrder(a: FinancialHistoryRecord, b: FinancialHistoryRecord): number {
  if (a.effectiveLocalDate !== b.effectiveLocalDate) return a.effectiveLocalDate.localeCompare(b.effectiveLocalDate);
  const created = String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? ""));
  return created || a.id.localeCompare(b.id);
}

function valueAtOrBefore(history: FinancialHistoryRecord[], metricKind: FinancialMetricKind, date: string): number | null {
  return history
    .filter((record) => record.metricKind === metricKind && record.effectiveLocalDate <= date)
    .sort(historyOrder)
    .at(-1)?.amountMinor ?? null;
}

export function buildFinancialAchievement(
  history: FinancialHistoryRecord[],
  metricKind: FinancialMetricKind,
  today: string,
): FinancialAchievement {
  const ordered = history
    .filter((record) => record.metricKind === metricKind && record.effectiveLocalDate <= today)
    .sort(historyOrder);
  const currentRecord = currentFinancialValue(history, metricKind, today);
  if (!currentRecord) return { current: null, changeFromFirst: null, sixMonthChangePercent: null, isRecordHigh: false };
  const first = ordered[0]?.amountMinor ?? currentRecord.amountMinor;
  const previousMax = ordered
    .filter((record) => record.id !== currentRecord.id)
    .reduce<number | null>((max, record) => max === null ? record.amountMinor : Math.max(max, record.amountMinor), null);
  const sixMonthsAgoValue = valueAtOrBefore(history, metricKind, shiftMonths(today, -6));
  return {
    current: currentRecord.amountMinor,
    changeFromFirst: currentRecord.amountMinor - first,
    sixMonthChangePercent: sixMonthsAgoValue !== null && sixMonthsAgoValue !== 0
      ? ((currentRecord.amountMinor - sixMonthsAgoValue) / Math.abs(sixMonthsAgoValue)) * 100
      : null,
    isRecordHigh: previousMax !== null && currentRecord.amountMinor > previousMax,
  };
}
