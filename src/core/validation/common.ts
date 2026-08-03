import { z } from "zod";

export const identifierSchema = z.uuidv7();
export const operationIdSchema = z.uuid();
export const isoInstantSchema = z.iso.datetime({ offset: true });
export const localDateSchema = z.iso.date();
export const currencySchema = z.string().regex(/^[A-Z]{3}$/);
export const decimalStringSchema = z.string().regex(/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/);
export const sourceTypeSchema = z.enum([
  "MANUAL",
  "CSV_IMPORT",
  "YOUTUBE_API",
  "INSTAGRAM_API",
  "DERIVED",
  "SYSTEM",
]);
export const roleSchema = z.enum(["ACTION", "SYSTEM", "CONDITION", "CAPABILITY", "OUTCOME"]);

export const writeEnvelopeSchema = z.object({
  operationId: operationIdSchema,
  baseVersion: z.int().positive().optional(),
  data: z.record(z.string(), z.unknown()),
});

export type SourceType = z.infer<typeof sourceTypeSchema>;

export function sanitizePlainText(value: string): string {
  return value.replaceAll("\u0000", "").trim();
}
