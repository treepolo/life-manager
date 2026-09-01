import { currentFinancialValue, type FinancialHistoryRecord } from "@/modules/simple/analytics";
import { shiftMonths } from "@/modules/simple/date";
import type { DailyTask, DailyTaskCompletion } from "@/modules/simple/model";
import type { FinancialMetricKind } from "@/modules/simple/schema";

export const TASK_MILESTONE_INTERVAL = 25;

export type TaskMilestoneTier = "small" | "medium" | "large" | "major" | "huge" | "highest";

export function taskMilestoneTier(count: number): TaskMilestoneTier | null {
  if (count <= 0 || count % TASK_MILESTONE_INTERVAL !== 0) return null;
  if (count % 1000 === 0) return "highest";
  if (count % 500 === 0 || count % 700 === 0) return "huge";
  if (count % 200 === 0 || count % 300 === 0) return "major";
  if (count % 100 === 0) return "large";
  if (count % 50 === 0) return "medium";
  return "small";
}

function reachedTaskMilestone(count: number): number | null {
  if (count < TASK_MILESTONE_INTERVAL) return null;
  return Math.floor(count / TASK_MILESTONE_INTERVAL) * TASK_MILESTONE_INTERVAL;
}

function nextTaskMilestone(count: number): number {
  return (Math.floor(count / TASK_MILESTONE_INTERVAL) + 1) * TASK_MILESTONE_INTERVAL;
}

export interface TaskAchievement {
  taskId: string;
  achievementName: string;
  achievementUnit: string;
  count: number;
  latestCompletionDate: string | null;
  reachedMilestone: number | null;
  nextMilestone: number;
  isExactMilestone: boolean;
  milestoneTier: TaskMilestoneTier | null;
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
      const reachedMilestone = reachedTaskMilestone(count);
      const nextMilestone = nextTaskMilestone(count);
      const lower = reachedMilestone ?? 0;
      const milestoneProgress = Math.max(0, Math.min((count - lower) / (nextMilestone - lower), 1));
      const milestoneTier = taskMilestoneTier(count);
      return {
        taskId: task.id,
        achievementName: task.achievementName,
        achievementUnit: task.achievementUnit,
        count,
        latestCompletionDate: taskCompletions.at(-1)?.completedLocalDate ?? null,
        reachedMilestone,
        nextMilestone,
        isExactMilestone: milestoneTier !== null,
        milestoneTier,
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
