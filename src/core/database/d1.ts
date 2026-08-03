import { v7 as uuidv7 } from "uuid";

import { ApiError } from "@/core/errors/api-error";

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export function newId(): string {
  return uuidv7();
}

export function nowIso(): string {
  return new Date().toISOString();
}

export async function firstOrNotFound<T>(
  statement: D1PreparedStatement,
  entityLabel: string,
): Promise<T> {
  const row = await statement.first<T>();
  if (!row) {
    throw new ApiError(404, "NOT_FOUND", `找不到${entityLabel}。`);
  }
  return row;
}

export function placeholders(count: number): string {
  return Array.from({ length: count }, () => "?").join(", ");
}

export function parseJsonColumn<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  return JSON.parse(value) as T;
}

export function assertSafeTableName(value: string, allowed: ReadonlySet<string>): string {
  if (!allowed.has(value)) {
    throw new ApiError(400, "VALIDATION_FAILED", "不支援的資料類型。", { value });
  }
  return value;
}
