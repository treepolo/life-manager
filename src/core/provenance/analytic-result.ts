import { z } from "zod";

export const analyticQualitySchema = z.enum([
  "EXACT",
  "NEAREST",
  "INTERPOLATED",
  "INSUFFICIENT",
  "ESTIMATED",
  "MANUAL",
  "SOURCE_REPORTED",
]);

export const analyticResultSchema = z.object({
  metricKey: z.string().min(1),
  formulaVersion: z.int().positive(),
  value: z.string().nullable(),
  unit: z.string().min(1),
  precision: z.int().nonnegative(),
  quality: analyticQualitySchema,
  sampleSize: z.int().nonnegative(),
  observationCount: z.int().nonnegative(),
  missingCount: z.int().nonnegative(),
  excludedCount: z.int().nonnegative(),
  window: z.record(z.string(), z.unknown()),
  filters: z.record(z.string(), z.unknown()),
  grouping: z.array(z.string()),
  aggregation: z.string().min(1),
  denominatorDefinition: z.string().nullable(),
  sourceRefs: z.array(z.object({ type: z.string(), id: z.string() })),
  inputValues: z.array(
    z.object({
      key: z.string(),
      value: z.string().nullable(),
      sourceRef: z.object({ type: z.string(), id: z.string() }).nullable(),
    }),
  ),
  calculatedAt: z.iso.datetime({ offset: true }),
});

export type AnalyticResult = z.infer<typeof analyticResultSchema>;
