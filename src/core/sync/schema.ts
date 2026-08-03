import { z } from "zod";

import { identifierSchema, isoInstantSchema, operationIdSchema } from "@/core/validation/common";

export const syncOperationSchema = z.object({
  operationId: operationIdSchema,
  deviceId: identifierSchema,
  entityType: z.string().min(1).max(80),
  entityId: identifierSchema,
  kind: z.enum(["UPSERT", "ARCHIVE", "RESTORE", "DELETE", "APPEND"]),
  baseVersion: z.int().nonnegative().nullable(),
  payload: z.record(z.string(), z.unknown()),
  clientOccurredAt: isoInstantSchema,
  schemaVersion: z.literal(1),
  resolutionConflictId: identifierSchema.optional(),
  resolutionKind: z.enum(["LOCAL", "SERVER", "MERGED"]).optional(),
});

export const syncBatchSchema = z.object({
  operations: z.array(syncOperationSchema).min(1).max(100),
});

export const registerDeviceSchema = z.object({
  operationId: operationIdSchema,
  data: z.object({
    id: identifierSchema,
    displayName: z.string().trim().min(1).max(120),
    userAgentSummary: z.string().max(240),
  }),
});

export type SyncOperation = z.infer<typeof syncOperationSchema>;
