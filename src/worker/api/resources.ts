import type { z } from "zod";

import {
  dailyTaskCompletionInputSchema,
  dailyTaskInputSchema,
  financialGoalInputSchema,
  financialHistoryInputSchema,
  taskCategoryInputSchema,
  userProfileInputSchema,
} from "@/modules/simple/schema";

export interface ResourceDefinition {
  key: string;
  table: string;
  label: string;
  inputSchema: z.ZodType;
  columns: Record<string, string>;
  booleanFields?: ReadonlySet<string>;
  jsonFields?: ReadonlySet<string>;
  filterFields?: ReadonlySet<string>;
  dateColumn?: string;
  versioned: boolean;
  timestamps: boolean;
  softDelete: boolean;
  archivable: boolean;
  appendOnly?: boolean;
  defaultSourceType?: string;
}

const editable = {
  versioned: true,
  timestamps: true,
  softDelete: true,
} as const;

export const resourceDefinitions: Record<string, ResourceDefinition> = {
  "task-categories": {
    key: "task-categories",
    table: "task_categories_v2",
    label: "任務分類",
    inputSchema: taskCategoryInputSchema,
    columns: {
      id: "id",
      name: "name",
      description: "description",
    },
    filterFields: new Set(["name"]),
    defaultSourceType: "MANUAL",
    archivable: true,
    ...editable,
  },
  "daily-tasks": {
    key: "daily-tasks",
    table: "daily_tasks_v2",
    label: "每日任務",
    inputSchema: dailyTaskInputSchema,
    columns: {
      id: "id",
      categoryId: "category_id",
      name: "name",
      description: "description",
      achievementName: "achievement_name",
      achievementUnit: "achievement_unit",
    },
    filterFields: new Set(["categoryId"]),
    defaultSourceType: "MANUAL",
    archivable: true,
    ...editable,
  },
  "daily-task-completions": {
    key: "daily-task-completions",
    table: "daily_task_completions_v2",
    label: "每日任務完成紀錄",
    inputSchema: dailyTaskCompletionInputSchema,
    columns: {
      id: "id",
      taskId: "task_id",
      completedLocalDate: "completed_local_date",
      completedAt: "completed_at",
    },
    filterFields: new Set(["taskId"]),
    dateColumn: "completed_local_date",
    defaultSourceType: "MANUAL",
    archivable: false,
    ...editable,
  },
  "user-profile": {
    key: "user-profile",
    table: "user_profile_v2",
    label: "個人設定",
    inputSchema: userProfileInputSchema,
    columns: {
      id: "id",
      birthDate: "birth_date",
    },
    defaultSourceType: "SYSTEM",
    archivable: false,
    ...editable,
  },
  "financial-goals": {
    key: "financial-goals",
    table: "financial_goals_v2",
    label: "財務目標",
    inputSchema: financialGoalInputSchema,
    columns: {
      id: "id",
      goalKind: "goal_kind",
      amountMinor: "amount_minor",
      currencyCode: "currency_code",
      minorUnitScale: "minor_unit_scale",
    },
    filterFields: new Set(["goalKind"]),
    defaultSourceType: "MANUAL",
    archivable: false,
    ...editable,
  },
  "financial-history": {
    key: "financial-history",
    table: "financial_history_v2",
    label: "財務歷史紀錄",
    inputSchema: financialHistoryInputSchema,
    columns: {
      id: "id",
      metricKind: "metric_kind",
      effectiveLocalDate: "effective_local_date",
      amountMinor: "amount_minor",
      currencyCode: "currency_code",
      minorUnitScale: "minor_unit_scale",
    },
    filterFields: new Set(["metricKind"]),
    dateColumn: "effective_local_date",
    defaultSourceType: "MANUAL",
    archivable: false,
    ...editable,
  },
};
