import { z } from "zod";

import { identifierSchema, isoInstantSchema, sourceTypeSchema } from "@/core/validation/common";

export const eventTypeInputSchema = z.object({
  id: identifierSchema,
  name: z.string().trim().min(1).max(120),
  colorToken: z.string().regex(/^[a-z][a-z0-9-]{0,39}$/).default("event"),
});

export const eventInputSchema = z
  .object({
    id: identifierSchema,
    eventTypeId: identifierSchema,
    areaId: identifierSchema.nullable().default(null),
    businessId: identifierSchema.nullable().default(null),
    title: z.string().trim().min(1).max(240),
    description: z.string().max(20000).default(""),
    startsAt: isoInstantSchema,
    endsAt: isoInstantSchema.nullable().default(null),
    inputTimezone: z.string().min(1).default("Asia/Taipei"),
    sourceReference: z.string().max(2000).nullable().default(null),
    sourceType: sourceTypeSchema.default("MANUAL"),
  })
  .refine((value) => !value.endsAt || value.endsAt >= value.startsAt, {
    message: "結束時間不得早於開始時間。",
    path: ["endsAt"],
  });
