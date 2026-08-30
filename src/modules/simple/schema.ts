import { z } from "zod";

import { identifierSchema, isoInstantSchema, localDateSchema } from "@/core/validation/common";
import { taipeiDate } from "@/modules/simple/date";

export const taskCategoryInputSchema = z.object({
  id: identifierSchema,
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).default(""),
});

export const dailyTaskInputSchema = z.object({
  id: identifierSchema,
  categoryId: identifierSchema,
  name: z.string().trim().min(1).max(180),
  description: z.string().trim().max(2000).default(""),
  achievementName: z.string().trim().max(120).default(""),
  achievementUnit: z.string().trim().max(24).default(""),
}).superRefine((value, context) => {
  const hasName = Boolean(value.achievementName);
  const hasUnit = Boolean(value.achievementUnit);
  if (hasName !== hasUnit) {
    context.addIssue({
      code: "custom",
      path: hasName ? ["achievementUnit"] : ["achievementName"],
      message: "成果與單位要一起填，或一起留空。",
    });
  }
});

export const dailyTaskCompletionInputSchema = z.object({
  id: identifierSchema,
  taskId: identifierSchema,
  completedLocalDate: localDateSchema,
  completedAt: isoInstantSchema,
}).superRefine((value, context) => {
  if (value.completedLocalDate > taipeiDate()) {
    context.addIssue({ code: "custom", path: ["completedLocalDate"], message: "不能登記未來日期的完成紀錄。" });
  }
});

export const userProfileInputSchema = z.object({
  id: identifierSchema,
  birthDate: localDateSchema.nullable(),
}).superRefine((value, context) => {
  if (value.birthDate && value.birthDate > taipeiDate()) {
    context.addIssue({ code: "custom", path: ["birthDate"], message: "出生年月日不能在未來。" });
  }
});

export const financialGoalKindSchema = z.enum(["MONTHLY_INCOME", "SAVINGS"]);

export const financialGoalInputSchema = z.object({
  id: identifierSchema,
  goalKind: financialGoalKindSchema,
  amountMinor: z.int().nonnegative().nullable(),
  currencyCode: z.literal("TWD").default("TWD"),
  minorUnitScale: z.literal(0).default(0),
});

export const financialMetricKindSchema = z.enum(["MONTHLY_INCOME", "SAVINGS"]);

export const financialHistoryInputSchema = z.object({
  id: identifierSchema,
  metricKind: financialMetricKindSchema,
  effectiveLocalDate: localDateSchema,
  amountMinor: z.int(),
  currencyCode: z.literal("TWD").default("TWD"),
  minorUnitScale: z.literal(0).default(0),
}).superRefine((value, context) => {
  if (value.metricKind === "MONTHLY_INCOME" && value.amountMinor < 0) {
    context.addIssue({ code: "custom", path: ["amountMinor"], message: "固定月收入不可為負數。" });
  }
  if (value.effectiveLocalDate > taipeiDate()) {
    context.addIssue({ code: "custom", path: ["effectiveLocalDate"], message: "財務紀錄日期不能在未來。" });
  }
});

export type FinancialGoalKind = z.infer<typeof financialGoalKindSchema>;
export type FinancialMetricKind = z.infer<typeof financialMetricKindSchema>;
