import { z } from "zod";

import { identifierSchema } from "@/core/validation/common";

export const asyncJobKindSchema = z.enum(["PROVIDER_SYNC", "CSV_IMPORT"]);

export const asyncJobStatusSchema = z.enum([
  "QUEUED",
  "CLAIMED",
  "RUNNING",
  "RETRY_WAIT",
  "SUCCEEDED",
  "PARTIAL",
  "FAILED",
  "CANCELLED",
  "PAUSED",
  "DEAD_LETTER",
]);

const allowedTransitions: Record<z.infer<typeof asyncJobStatusSchema>, readonly z.infer<typeof asyncJobStatusSchema>[]> = {
  QUEUED: ["CLAIMED", "RUNNING", "CANCELLED"],
  CLAIMED: ["RUNNING", "FAILED", "CANCELLED"],
  RUNNING: ["RETRY_WAIT", "SUCCEEDED", "PARTIAL", "FAILED", "CANCELLED"],
  RETRY_WAIT: ["QUEUED", "RUNNING", "FAILED", "DEAD_LETTER"],
  SUCCEEDED: [],
  PARTIAL: [],
  FAILED: ["RETRY_WAIT", "DEAD_LETTER"],
  CANCELLED: [],
  PAUSED: ["QUEUED", "CANCELLED"],
  DEAD_LETTER: [],
};

export function isAsyncJobTransitionAllowed(
  from: z.infer<typeof asyncJobStatusSchema>,
  to: z.infer<typeof asyncJobStatusSchema>,
): boolean {
  return allowedTransitions[from].includes(to);
}

export const asyncJobPhaseSchema = z.enum([
  "QUEUED",
  "CLAIMED",
  "RUNNING",
  "VALIDATING",
  "RETRY_WAIT",
  "SUCCEEDED",
  "PARTIAL",
  "FAILED",
  "CANCELLED",
  "PAUSED",
  "DEAD_LETTER",
]);

export const asyncJobCountersSchema = z
  .object({
    processed: z.number().int().nonnegative().nullable(),
    total: z.number().int().nonnegative().nullable(),
    succeeded: z.number().int().nonnegative().nullable(),
    skipped: z.number().int().nonnegative().nullable(),
    failed: z.number().int().nonnegative().nullable(),
  })
  .superRefine((value, context) => {
    if (value.processed !== null && value.total !== null && value.processed > value.total) {
      context.addIssue({ code: "custom", path: ["processed"], message: "processed不得大於total。" });
    }
    if (
      value.processed !== null &&
      value.succeeded !== null &&
      value.skipped !== null &&
      value.failed !== null &&
      value.succeeded + value.skipped + value.failed !== value.processed
    ) {
      context.addIssue({ code: "custom", path: ["processed"], message: "processed必須等於succeeded＋skipped＋failed。" });
    }
  });

export const asyncJobSourceCountersSchema = z.object({
  fetched: z.number().int().nonnegative().nullable().optional(),
  created: z.number().int().nonnegative().nullable().optional(),
  updated: z.number().int().nonnegative().nullable().optional(),
  ignored: z.number().int().nonnegative().nullable().optional(),
  errors: z.number().int().nonnegative().nullable().optional(),
  imported: z.number().int().nonnegative().nullable().optional(),
  duplicates: z.number().int().nonnegative().nullable().optional(),
  errorRows: z.number().int().nonnegative().nullable().optional(),
  totalRows: z.number().int().nonnegative().nullable().optional(),
});

export const asyncJobProgressSchema = z
  .object({
    processed: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  })
  .refine((value) => value.processed <= value.total, { message: "processed不得大於total。" });

export const asyncJobErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
}).nullable();

export const asyncJobCapabilitiesSchema = z.object({
  retrySupported: z.boolean(),
  cancelSupported: z.boolean(),
  reloadRecovery: z.boolean(),
  historyPersisted: z.boolean(),
  backgroundContinuation: z.boolean(),
});

export const asyncJobProvenanceSchema = z.object({
  sourceTable: z.enum(["provider_sync_jobs", "provider_sync_runs", "import_batches"]),
  sourceId: identifierSchema,
  sourceUpdatedAt: z.string().min(1),
  counterSemantics: z.string().min(1),
});

export const asyncJobHistoryEntrySchema = z.object({
  id: identifierSchema,
  status: asyncJobStatusSchema,
  phase: asyncJobPhaseSchema,
  startedAt: z.string().min(1),
  completedAt: z.string().nullable(),
  counters: asyncJobCountersSchema,
  sourceCounters: asyncJobSourceCountersSchema,
  error: asyncJobErrorSchema,
});

export const asyncJobOutputSchema = z.object({
  contractVersion: z.literal("async-job.v1"),
  id: identifierSchema,
  kind: asyncJobKindSchema,
  status: asyncJobStatusSchema,
  phase: asyncJobPhaseSchema,
  version: z.string().min(1),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  lastUpdatedAt: z.string().min(1),
  expiresAt: z.string().nullable(),
  nextRunAt: z.string().nullable(),
  attempt: z.number().int().nonnegative(),
  maxAttempts: z.number().int().positive(),
  currentRunId: identifierSchema.nullable(),
  progress: asyncJobProgressSchema.nullable(),
  counters: asyncJobCountersSchema,
  sourceCounters: asyncJobSourceCountersSchema,
  counterInvariant: z.enum(["ROW_PARTITION", "SOURCE_REPORTED_DIFFERENT_UNITS", "UNAVAILABLE"]),
  result: z.record(z.string(), z.unknown()).nullable(),
  warnings: z.array(z.string()),
  error: asyncJobErrorSchema,
  retryable: z.boolean(),
  cancelSupported: z.boolean(),
  capabilities: asyncJobCapabilitiesSchema,
  source: z.object({
    providerKey: z.string().nullable(),
    connectionId: identifierSchema.nullable(),
    moduleKey: z.string().nullable(),
    provider: z.string().nullable(),
  }),
  history: z.array(asyncJobHistoryEntrySchema),
  provenance: asyncJobProvenanceSchema,
});

export const asyncJobListQuerySchema = z.object({
  kind: asyncJobKindSchema.default("PROVIDER_SYNC"),
  cursor: z.string().trim().min(1).max(512).nullable().default(null),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const asyncJobPageOutputSchema = z.object({
  data: z.array(asyncJobOutputSchema),
  meta: z.object({
    requestId: z.string().min(1),
    contractVersion: z.literal("async-job.v1"),
    nextCursor: z.string().nullable(),
  }),
});

export type AsyncJobOutput = z.infer<typeof asyncJobOutputSchema>;
