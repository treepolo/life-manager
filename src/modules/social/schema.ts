import { z } from "zod";

import { decimalStringSchema, identifierSchema, isoInstantSchema, sourceTypeSchema } from "@/core/validation/common";

export const platformInputSchema = z.object({
  id: identifierSchema,
  key: z.string().regex(/^[a-z][a-z0-9_-]{1,79}$/),
  name: z.string().trim().min(1).max(120),
  providerKind: z.enum(["MANUAL", "CSV", "YOUTUBE", "INSTAGRAM", "FUTURE"]),
  metricNamespace: z.string().trim().min(1).max(120),
});

export const socialAccountInputSchema = z.object({
  id: identifierSchema,
  platformId: identifierSchema,
  displayName: z.string().trim().min(1).max(160),
  externalAccountId: z.string().max(240).nullable().default(null),
  accountKind: z.enum(["PROFESSIONAL", "CHANNEL", "PAGE", "UNKNOWN"]).default("UNKNOWN"),
  timezone: z.string().default("Asia/Taipei"),
  sourceType: sourceTypeSchema.default("MANUAL"),
});

export const socialMetricDefinitionInputSchema = z.object({
  id: identifierSchema,
  platformId: identifierSchema,
  metricKey: z.string().regex(/^[a-z][a-z0-9_.-]{1,119}$/),
  providerMetricName: z.string().trim().min(1).max(160),
  providerDefinition: z.string().trim().min(1).max(4000),
  providerDefinitionVersion: z.string().trim().min(1).max(80),
  unit: z.string().trim().min(1).max(80),
  scope: z.enum(["ACCOUNT", "POST"]),
  isCumulative: z.boolean(),
  comparableFamily: z.string().max(120).nullable().default(null),
  sourceType: sourceTypeSchema.default("MANUAL"),
});

export const contentAssetInputSchema = z.object({
  id: identifierSchema,
  businessId: identifierSchema.nullable().default(null),
  title: z.string().trim().min(1).max(240),
  description: z.string().max(20000).default(""),
  topic: z.string().max(160).default(""),
  style: z.string().max(160).default(""),
  format: z.string().max(120).default(""),
  lengthValue: z.int().nonnegative().nullable().default(null),
  lengthUnit: z.string().max(80).nullable().default(null),
  campaign: z.string().max(160).default(""),
});

export const platformPostInputSchema = z.object({
  id: identifierSchema,
  contentAssetId: identifierSchema,
  socialAccountId: identifierSchema,
  externalPostId: z.string().max(240).nullable().default(null),
  permalink: z.url().nullable().default(null),
  platformFormat: z.string().max(120).default(""),
  publishedAt: isoInstantSchema,
  publishedTimezone: z.string().default("Asia/Taipei"),
  sourceType: sourceTypeSchema.default("MANUAL"),
});

export const socialSnapshotInputSchema = z.object({
  id: identifierSchema,
  socialMetricDefinitionId: identifierSchema,
  socialAccountId: identifierSchema.nullable().default(null),
  platformPostId: identifierSchema.nullable().default(null),
  observedAt: isoInstantSchema,
  publishedAt: isoInstantSchema.nullable().default(null),
  ageSeconds: z.int().nonnegative().nullable().default(null),
  valueDecimal: decimalStringSchema,
  isCumulative: z.boolean(),
  quality: z.enum(["EXACT", "NEAREST", "INTERPOLATED", "INSUFFICIENT", "SOURCE_REPORTED", "MANUAL"]),
  rawPayloadId: identifierSchema.nullable().default(null),
  importRowId: identifierSchema.nullable().default(null),
  sourceType: sourceTypeSchema,
}).refine((value) => (value.socialAccountId === null) !== (value.platformPostId === null), {
  message: "快照必須只關聯帳號或貼文其中一種。",
});

export const conversionInputSchema = z.object({
  id: identifierSchema,
  platformPostId: identifierSchema.nullable().default(null),
  contentAssetId: identifierSchema.nullable().default(null),
  campaign: z.string().max(160).nullable().default(null),
  confirmedAt: isoInstantSchema,
  countValue: z.int().nonnegative(),
  amountMinor: z.int().safe().nullable().default(null),
  currencyCode: z.string().regex(/^[A-Z]{3}$/).nullable().default(null),
  minorUnitScale: z.int().min(0).max(6).nullable().default(null),
  attributionNote: z.string().trim().min(1).max(10000),
  denominatorMetricKey: z.string().trim().min(1).max(160),
  windowFromHours: z.int().nonnegative().default(0),
  windowToHours: z.int().positive().default(24),
}).refine((value) => value.platformPostId !== null || value.contentAssetId !== null, {
  message: "成交必須歸因到內容或平台貼文。",
});

export const comparisonDefinitionInputSchema = z.object({
  id: identifierSchema,
  name: z.string().trim().min(1).max(160),
  metricKey: z.string().trim().min(1).max(160),
  aggregation: z.enum(["MEAN", "SUM", "MEDIAN", "DISTRIBUTION", "RATIO_OF_SUMS", "MEAN_OF_RATIOS"]),
  groupBy: z.array(z.enum(["style", "topic", "platformKey", "accountId", "businessId", "tag"])).min(1).max(3),
  filters: z.record(z.string(), z.string().nullable()),
  windowFromHours: z.int().min(0).max(8760).default(0),
  windowToHours: z.int().min(1).max(8760).default(24),
  toleranceMinutes: z.int().min(0).max(1440).default(15),
});
