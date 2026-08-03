import { z } from "zod";

import { identifierSchema, sourceTypeSchema } from "@/core/validation/common";

export const areaInputSchema = z.object({
  id: identifierSchema,
  name: z.string().trim().min(1).max(120),
  description: z.string().max(10000).default(""),
  whyText: z.string().max(10000).default(""),
  principlesText: z.string().max(20000).default(""),
  strategyText: z.string().max(20000).default(""),
  nextActionText: z.string().max(5000).default(""),
  lowClarityGuide: z.string().max(5000).default(""),
  sortOrder: z.int().default(0),
  sourceType: sourceTypeSchema.default("MANUAL"),
});

export const areaUpdateSchema = areaInputSchema.omit({ id: true, sourceType: true }).partial();

export const businessInputSchema = z.object({
  id: identifierSchema,
  areaId: identifierSchema,
  name: z.string().trim().min(1).max(160),
  description: z.string().max(10000).default(""),
  status: z.enum(["ACTIVE", "PAUSED", "COMPLETED"]).default("ACTIVE"),
  whyText: z.string().max(10000).default(""),
  principlesText: z.string().max(20000).default(""),
  strategyText: z.string().max(20000).default(""),
  nextActionText: z.string().max(5000).default(""),
  lowClarityGuide: z.string().max(5000).default(""),
  sortOrder: z.int().default(0),
  sourceType: sourceTypeSchema.default("MANUAL"),
});

export const businessUpdateSchema = businessInputSchema.omit({ id: true, areaId: true, sourceType: true }).partial();

export const tagInputSchema = z.object({
  id: identifierSchema,
  name: z.string().trim().min(1).max(120),
  colorToken: z.string().regex(/^[a-z][a-z0-9-]*$/).max(40).default("neutral"),
});

export const savedViewInputSchema = z.object({
  id: identifierSchema,
  name: z.string().trim().min(1).max(160),
  moduleKey: z.enum(["home", "areas", "tasks", "finance", "metrics", "social", "deadlines", "data"]),
  filter: z.record(z.string(), z.unknown()),
  chart: z.record(z.string(), z.unknown()),
});

export const entityLinkInputSchema = z.object({
  id: identifierSchema,
  fromType: z.literal("BUSINESS"),
  fromId: identifierSchema,
  toType: z.enum(["INCOME_SOURCE", "EXPENSE_CATEGORY", "TASK", "EVENT", "METRIC", "CONTENT", "SAVED_VIEW"]),
  toId: identifierSchema,
  relationType: z.literal("RELATED").default("RELATED"),
  sourceType: sourceTypeSchema.default("MANUAL"),
});
