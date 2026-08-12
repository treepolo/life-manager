import Papa from "papaparse";
import { z } from "zod";

import { sha256 } from "@/core/crypto/secrets";
import { ApiError } from "@/core/errors/api-error";

export const brokerageActivityTypeSchema = z.enum([
  "BUY",
  "SELL",
  "DIVIDEND",
  "INTEREST",
  "DEPOSIT",
  "WITHDRAWAL",
  "FEE",
  "OTHER",
  "UNCLASSIFIED",
]);

export interface MappingProfile {
  date: string;
  type: string;
  description?: string;
  symbol?: string;
  quantity?: string;
  amount: string;
  currency?: string;
  transactionId?: string;
  typeMap: Record<string, z.infer<typeof brokerageActivityTypeSchema>>;
  dateFormat: "ISO" | "US" | "AUTO";
  defaultCurrency: string;
  minorUnitScale: number;
}

export const mappingProfileSchema = z.object({
  date: z.string().min(1),
  type: z.string().min(1),
  description: z.string().min(1).optional(),
  symbol: z.string().min(1).optional(),
  quantity: z.string().min(1).optional(),
  amount: z.string().min(1),
  currency: z.string().min(1).optional(),
  transactionId: z.string().min(1).optional(),
  typeMap: z.record(z.string(), brokerageActivityTypeSchema),
  dateFormat: z.enum(["ISO", "US", "AUTO"]),
  defaultCurrency: z.string().regex(/^[A-Z]{3}$/),
  minorUnitScale: z.int().min(0).max(6),
});

export interface ImportPreview {
  encoding: string;
  delimiter: string;
  headers: string[];
  rows: Record<string, string>[];
  parseErrors: Array<{ row: number; code: string; message: string }>;
  fileSha256: string;
  totalRows: number;
}

export interface NormalizedActivity {
  rowNumber: number;
  rowHash: string;
  stableDedupeKey: string;
  activityType: z.infer<typeof brokerageActivityTypeSchema>;
  occurredAt: string;
  symbol: string | null;
  description: string;
  quantityDecimal: string | null;
  amountMinor: number;
  currencyCode: string;
  minorUnitScale: number;
  requiresReview: boolean;
  raw: Record<string, string>;
}

function detectAndDecode(buffer: ArrayBuffer): { text: string; encoding: string } {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { text: new TextDecoder("utf-16le").decode(bytes.subarray(2)), encoding: "UTF-16LE" };
  }
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { text: new TextDecoder("utf-8").decode(bytes.subarray(3)), encoding: "UTF-8-BOM" };
  }
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes), encoding: "UTF-8" };
  } catch {
    try {
      return { text: new TextDecoder("big5", { fatal: true }).decode(bytes), encoding: "BIG5" };
    } catch {
      throw new ApiError(422, "IMPORT_INVALID", "無法辨識CSV編碼；支援UTF-8、UTF-16LE與Big5。");
    }
  }
}

async function parseCsvBuffer(buffer: ArrayBuffer): Promise<ImportPreview> {
  const decoded = detectAndDecode(buffer);
  const result = Papa.parse<Record<string, string>>(decoded.text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header) => header.trim(),
  });
  const headers = result.meta.fields ?? [];
  if (headers.length === 0) throw new ApiError(422, "IMPORT_INVALID", "CSV沒有欄名列。");
  return {
    encoding: decoded.encoding,
    delimiter: result.meta.delimiter,
    headers,
    rows: result.data,
    parseErrors: result.errors.map((error) => ({ row: error.row ?? 0, code: error.code, message: error.message })),
    fileSha256: await sha256(buffer),
    totalRows: result.data.length,
  };
}

export async function parseCsv(buffer: ArrayBuffer): Promise<ImportPreview> {
  return parseCsvBuffer(buffer);
}

export async function previewCsv(buffer: ArrayBuffer, maxRows = 50): Promise<ImportPreview> {
  const parsed = await parseCsvBuffer(buffer);
  return { ...parsed, rows: parsed.rows.slice(0, maxRows) };
}

function parseDate(value: string, format: MappingProfile["dateFormat"]): string {
  const trimmed = value.trim();
  if (format === "ISO" || (format === "AUTO" && /^\d{4}-\d{2}-\d{2}/.test(trimmed))) {
    const date = new Date(trimmed.length === 10 ? `${trimmed}T00:00:00.000Z` : trimmed);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  const us = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (us) {
    const [, month, day, year, hour = "0", minute = "0", second = "0"] = us;
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second))).toISOString();
  }
  throw new ApiError(422, "IMPORT_INVALID", `無法解析日期：${trimmed}`);
}

function parseAmountMinor(value: string, scale: number): number {
  const normalized = value.replaceAll(",", "").replaceAll("$", "").replace(/^\((.*)\)$/, "-$1").trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) throw new ApiError(422, "IMPORT_INVALID", `無法解析金額：${value}`);
  const [whole, fraction = ""] = normalized.split(".");
  const padded = fraction.padEnd(scale, "0");
  if (padded.length > scale && /[1-9]/.test(padded.slice(scale))) {
    throw new ApiError(422, "IMPORT_INVALID", `金額小數位超過幣別允許精度：${value}`);
  }
  const sign = whole.startsWith("-") ? -1 : 1;
  const absoluteWhole = whole.replace("-", "");
  const amount = sign * (Number(absoluteWhole) * 10 ** scale + Number(padded.slice(0, scale) || "0"));
  if (!Number.isSafeInteger(amount)) throw new ApiError(422, "IMPORT_INVALID", "CSV金額超出安全整數範圍。");
  return amount;
}

export async function normalizeBrokerageRows(
  preview: ImportPreview,
  profile: MappingProfile,
  accountStableId: string,
): Promise<{ activities: NormalizedActivity[]; errors: Array<{ rowNumber: number; message: string }> }> {
  const required = [profile.date, profile.type, profile.amount];
  const missingHeaders = required.filter((header) => !preview.headers.includes(header));
  if (missingHeaders.length) {
    throw new ApiError(422, "IMPORT_INVALID", "CSV缺少必要欄位。", { missingHeaders });
  }
  const activities: NormalizedActivity[] = [];
  const errors: Array<{ rowNumber: number; message: string }> = [];
  const occurrenceByBaseDedupeKey = new Map<string, number>();
  for (const [index, row] of preview.rows.entries()) {
    const rowNumber = index + 2;
    try {
      const rawType = row[profile.type]?.trim() ?? "";
      const activityType = profile.typeMap[rawType] ?? "UNCLASSIFIED";
      const occurredAt = parseDate(row[profile.date] ?? "", profile.dateFormat);
      const currencyCode = (profile.currency ? row[profile.currency] : profile.defaultCurrency)?.trim().toUpperCase();
      if (!/^[A-Z]{3}$/.test(currencyCode)) throw new ApiError(422, "IMPORT_INVALID", `無效幣別：${currencyCode}`);
      const amountMinor = parseAmountMinor(row[profile.amount] ?? "", profile.minorUnitScale);
      const symbol = profile.symbol ? row[profile.symbol]?.trim() || null : null;
      const description = profile.description ? row[profile.description]?.trim() ?? "" : "";
      const quantityDecimal = profile.quantity ? row[profile.quantity]?.replaceAll(",", "").trim() || null : null;
      const transactionId = profile.transactionId ? row[profile.transactionId]?.trim() ?? "" : "";
      const rawSerialized = JSON.stringify(row);
      const rowHash = await sha256(rawSerialized);
      const baseDedupeKey = await sha256(
        [accountStableId, occurredAt, activityType, amountMinor, currencyCode, symbol ?? "", quantityDecimal ?? "", transactionId, rowHash].join("|"),
      );
      const duplicateOccurrence = occurrenceByBaseDedupeKey.get(baseDedupeKey) ?? 0;
      occurrenceByBaseDedupeKey.set(baseDedupeKey, duplicateOccurrence + 1);
      const stableDedupeKey = await sha256([baseDedupeKey, duplicateOccurrence].join("|"));
      activities.push({
        rowNumber,
        rowHash,
        stableDedupeKey,
        activityType,
        occurredAt,
        symbol,
        description,
        quantityDecimal,
        amountMinor,
        currencyCode,
        minorUnitScale: profile.minorUnitScale,
        requiresReview: activityType === "UNCLASSIFIED",
        raw: row,
      });
    } catch (error) {
      errors.push({ rowNumber, message: error instanceof Error ? error.message : "無法解析此列" });
    }
  }
  return { activities, errors };
}
