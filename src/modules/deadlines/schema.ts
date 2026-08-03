import { z } from "zod";

import { identifierSchema, isoInstantSchema, localDateSchema } from "@/core/validation/common";

export const deadlineImportanceSchema = z.enum(["SUPER_CRITICAL", "CRITICAL"]);

export const deadlineItemInputSchema = z
  .object({
    id: identifierSchema,
    templateId: z.string().max(160).nullable().default(null),
    parentDeadlineId: identifierSchema.nullable().default(null),
    name: z.string().trim().min(1).max(240),
    institution: z.string().max(240).default(""),
    accountHint: z.string().max(240).default(""),
    actionableFromLocalDate: localDateSchema,
    dueLocalDate: localDateSchema.nullable().default(null),
    timezone: z.string().default("Asia/Taipei"),
    completionCondition: z.string().trim().min(1).max(10000),
    instructions: z.string().max(20000).default(""),
    importance: deadlineImportanceSchema,
    status: z.enum(["OPEN", "COMPLETED", "ARCHIVED"]).default("OPEN"),
    completedAt: isoInstantSchema.nullable().default(null),
    nextOccurrenceLocalDate: localDateSchema.nullable().default(null),
    lastSignedLocalDate: localDateSchema.nullable().default(null),
    calculatedDueLocalDate: localDateSchema.nullable().default(null),
    confirmedDueLocalDate: localDateSchema.nullable().default(null),
    calculationBasis: z.string().max(10000).nullable().default(null),
  })
  .superRefine((value, context) => {
    if (value.dueLocalDate && value.dueLocalDate < value.actionableFromLocalDate) {
      context.addIssue({ code: "custom", path: ["dueLocalDate"], message: "到期日不得早於開始處理日期。" });
    }
    if (value.templateId && value.importance !== "SUPER_CRITICAL") {
      context.addIssue({ code: "custom", path: ["importance"], message: "W-8BEN與報稅範本固定為超級無敵重要。" });
    }
  });

export const deadlineCompletionInputSchema = z.object({
  id: identifierSchema,
  deadlineItemId: identifierSchema,
  completedAt: isoInstantSchema,
  note: z.string().max(10000).default(""),
  evidenceRef: z.string().max(2000).nullable().default(null),
  nextOccurrenceLocalDate: localDateSchema.nullable().default(null),
});

export const notificationPreferenceInputSchema = z.object({
  id: identifierSchema,
  timezone: z.string().default("Asia/Taipei"),
  localSendTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  repeatIntervalHours: z.int().min(1).max(720),
  emailRecipient: z.email().nullable().default(null),
  modalForSuperCritical: z.boolean().default(true),
  confirmedAt: isoInstantSchema,
});

export function calculateW8BenExpiry(lastSignedLocalDate: string): { calculatedDueLocalDate: string; calculationBasis: string } {
  const signedYear = Number(lastSignedLocalDate.slice(0, 4));
  return {
    calculatedDueLocalDate: `${signedYear + 3}-12-31`,
    calculationBasis: `依IRS一般規則，W-8BEN通常有效至簽署年度後第三個完整曆年的12月31日；若情況變更可能提早失效。簽署日：${lastSignedLocalDate}。`,
  };
}
