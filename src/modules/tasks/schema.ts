import { z } from "zod";

import { identifierSchema, isoInstantSchema, localDateSchema, roleSchema } from "@/core/validation/common";

export const taskInputSchema = z.object({
  id: identifierSchema,
  areaId: identifierSchema.nullable().default(null),
  businessId: identifierSchema.nullable().default(null),
  title: z.string().trim().min(1).max(240),
  description: z.string().max(20000).default(""),
  whyText: z.string().max(10000).default(""),
  completionCriteria: z.string().max(10000).default(""),
  lowClarityGuide: z.string().max(5000).default(""),
  metricRole: roleSchema.nullable().default(null),
  estimatedMinutes: z.int().nonnegative().nullable().default(null),
  priority: z.int().min(0).max(100).default(50),
  pinnedNextAction: z.boolean().default(false),
});

export const taskScheduleInputSchema = z
  .object({
    id: identifierSchema,
    taskDefinitionId: identifierSchema,
    recurrenceKind: z.enum(["ONCE", "DAILY", "WEEKLY", "MONTHLY", "CUSTOM_RRULE"]),
    startsOnLocalDate: localDateSchema,
    dueLocalTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().default(null),
    timezone: z.string().trim().min(1).max(80).default("Asia/Taipei"),
    weekdays: z.array(z.int().min(0).max(6)).max(7).nullable().default(null),
    monthDay: z.int().min(1).max(31).nullable().default(null),
    rruleText: z.string().max(1000).nullable().default(null),
    intervalValue: z.int().positive().max(365).default(1),
    endsOnLocalDate: localDateSchema.nullable().default(null),
  })
  .superRefine((value, context) => {
    if (value.recurrenceKind === "WEEKLY" && (!value.weekdays || value.weekdays.length === 0)) {
      context.addIssue({ code: "custom", path: ["weekdays"], message: "每週任務需選擇至少一個星期。" });
    }
    if (value.recurrenceKind === "MONTHLY" && !value.monthDay) {
      context.addIssue({ code: "custom", path: ["monthDay"], message: "每月任務需指定日期。" });
    }
    if (value.recurrenceKind === "CUSTOM_RRULE" && !value.rruleText) {
      context.addIssue({ code: "custom", path: ["rruleText"], message: "自訂週期需提供RRULE。" });
    }
    if (value.endsOnLocalDate && value.endsOnLocalDate < value.startsOnLocalDate) {
      context.addIssue({ code: "custom", path: ["endsOnLocalDate"], message: "排程結束日期不得早於開始日期。" });
    }
  });

export const taskWithInitialScheduleInputSchema = z
  .object({
    task: taskInputSchema,
    schedule: taskScheduleInputSchema.nullable().default(null),
  })
  .superRefine((value, context) => {
    if (value.schedule && value.schedule.taskDefinitionId !== value.task.id) {
      context.addIssue({
        code: "custom",
        path: ["schedule", "taskDefinitionId"],
        message: "初始排程必須關聯同一個task.id。",
      });
    }
  });

const taskCommandTaskOutputSchema = taskInputSchema.extend({
  createdAt: isoInstantSchema,
  updatedAt: isoInstantSchema,
  version: z.int().positive(),
});

const taskCommandScheduleOutputSchema = taskScheduleInputSchema.extend({
  createdAt: isoInstantSchema,
  updatedAt: isoInstantSchema,
  version: z.int().positive(),
});

export const taskWithInitialScheduleOutputSchema = z.object({
  data: z.object({
    task: taskCommandTaskOutputSchema,
    schedule: taskCommandScheduleOutputSchema.nullable(),
  }),
  meta: z.object({
    requestId: z.string().min(1),
    idempotentReplay: z.boolean().optional(),
  }),
});

export const taskCompletionInputSchema = z.object({
  id: identifierSchema,
  taskDefinitionId: identifierSchema,
  taskOccurrenceId: identifierSchema.nullable().default(null),
  scheduledLocalDate: localDateSchema,
  completedAt: isoInstantSchema,
  note: z.string().max(10000).default(""),
  numericValue: z.string().nullable().default(null),
  metricDefinitionId: identifierSchema.nullable().default(null),
});

export const taskDeferralInputSchema = z.object({
  taskOccurrenceId: identifierSchema,
  baseVersion: z.int().positive(),
  deferredToLocalDate: localDateSchema,
});
