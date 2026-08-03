import { z } from "zod";

import {
  decimalStringSchema,
  identifierSchema,
  isoInstantSchema,
  roleSchema,
  sourceTypeSchema,
} from "@/core/validation/common";

export const metricDefinitionInputSchema = z.object({
  id: identifierSchema,
  key: z.string().regex(/^[a-z][a-z0-9_.-]{1,119}$/),
  name: z.string().trim().min(1).max(160),
  unit: z.string().trim().min(1).max(80),
  valueType: z.enum(["INTEGER", "DECIMAL", "PERCENTAGE", "DURATION", "TEXT"]),
  role: roleSchema,
  domain: z.string().trim().min(1).max(80),
  areaId: identifierSchema.nullable().default(null),
  businessId: identifierSchema.nullable().default(null),
  recordingFrequency: z.string().max(80).default("AD_HOC"),
  sourcePolicy: z.string().max(120).default("MANUAL"),
  precision: z.int().min(0).max(12).default(2),
});

export const metricObservationInputSchema = z
  .object({
    id: identifierSchema,
    metricDefinitionId: identifierSchema,
    observedAt: isoInstantSchema,
    inputLocalDate: z.iso.date().nullable().default(null),
    inputTimezone: z.string().default("Asia/Taipei"),
    valueDecimal: decimalStringSchema.nullable().default(null),
    valueText: z.string().max(20000).nullable().default(null),
    quality: z.enum(["EXACT", "NEAREST", "INTERPOLATED", "INSUFFICIENT", "MANUAL", "SOURCE_REPORTED"]).default("MANUAL"),
    sourceRefType: z.string().max(80).nullable().default(null),
    sourceRefId: z.string().max(160).nullable().default(null),
    sourceType: sourceTypeSchema.default("MANUAL"),
  })
  .refine((value) => (value.valueDecimal === null) !== (value.valueText === null), {
    message: "數值或文字只能填一種。",
  });

export const formulaDefinitionInputSchema = z.object({
  id: identifierSchema,
  metricDefinitionId: identifierSchema,
  formulaVersion: z.int().positive(),
  expression: z.string().trim().min(1).max(1000),
  window: z.record(z.string(), z.unknown()),
  missingPolicy: z.enum(["FAIL", "EXCLUDE", "ZERO"]).default("FAIL"),
});
