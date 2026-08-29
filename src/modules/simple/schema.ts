import { z } from "zod";

import { identifierSchema, isoInstantSchema, localDateSchema } from "@/core/validation/common";

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
});

export const dailyTaskCompletionInputSchema = z.object({
  id: identifierSchema,
  taskId: identifierSchema,
  completedLocalDate: localDateSchema,
  completedAt: isoInstantSchema,
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
});

export type FinancialGoalKind = z.infer<typeof financialGoalKindSchema>;
export type FinancialMetricKind = z.infer<typeof financialMetricKindSchema>;
