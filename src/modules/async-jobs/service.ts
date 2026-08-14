import { z } from "zod";

import { ApiError } from "@/core/errors/api-error";
import { identifierSchema } from "@/core/validation/common";
import {
  asyncJobKindSchema,
  asyncJobListQuerySchema,
  asyncJobOutputSchema,
  type AsyncJobOutput,
} from "@/modules/async-jobs/schema";

const CURSOR_VERSION = 1;
const HISTORY_LIMIT = 20;

interface Cursor {
  version: number;
  updatedAt: string;
  id: string;
}

interface ProviderJobRow {
  id: string;
  provider_key: string;
  connection_id: string;
  next_run_at: string;
  status: "READY" | "RUNNING" | "RETRY" | "PAUSED" | "DEAD_LETTER";
  attempt: number;
  max_attempts: number;
  last_error_code: string | null;
  created_at: string;
  updated_at: string;
}

interface ProviderRunRow {
  id: string;
  status: "RUNNING" | "SUCCEEDED" | "PARTIAL" | "FAILED";
  started_at: string;
  completed_at: string | null;
  fetched_count: number;
  created_count: number;
  updated_count: number;
  ignored_count: number;
  error_count: number;
  error_code: string | null;
  error_message_redacted: string | null;
}

interface ImportBatchRow {
  id: string;
  module_key: string;
  provider_key: string;
  status: "PREVIEW" | "VALIDATED" | "IMPORTING" | "COMPLETED" | "COMPLETED_WITH_ERRORS" | "FAILED";
  total_rows: number;
  imported_rows: number;
  duplicate_rows: number;
  error_rows: number;
  started_at: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

const cursorSchema = z.object({
  version: z.literal(CURSOR_VERSION),
  updatedAt: z.string().min(1),
  id: identifierSchema,
});

function encodeCursor(cursor: Omit<Cursor, "version">): string {
  return btoa(JSON.stringify({ version: CURSOR_VERSION, ...cursor }));
}

function decodeCursor(value: string | null): Cursor | null {
  if (!value) return null;
  try {
    const parsed = cursorSchema.safeParse(JSON.parse(atob(value)));
    if (!parsed.success) throw new Error("invalid");
    return parsed.data;
  } catch {
    throw new ApiError(409, "ASYNC_CURSOR_STALE", "非同步工作游標已失效，請重新載入工作歷史。", { cursorStatus: "STALE" });
  }
}

function sourceCountersForRun(run: ProviderRunRow) {
  return {
    fetched: run.fetched_count,
    created: run.created_count,
    updated: run.updated_count,
    ignored: run.ignored_count,
    errors: run.error_count,
  };
}

function providerRunStatus(status: ProviderRunRow["status"]): AsyncJobOutput["status"] {
  if (status === "RUNNING") return "RUNNING";
  if (status === "SUCCEEDED") return "SUCCEEDED";
  if (status === "PARTIAL") return "PARTIAL";
  return "FAILED";
}

function providerJobStatus(status: ProviderJobRow["status"]): AsyncJobOutput["status"] {
  if (status === "READY") return "QUEUED";
  if (status === "RETRY") return "RETRY_WAIT";
  if (status === "RUNNING") return "RUNNING";
  if (status === "PAUSED") return "PAUSED";
  return "DEAD_LETTER";
}

function phaseForStatus(status: AsyncJobOutput["status"]): AsyncJobOutput["phase"] {
  if (status === "QUEUED") return "QUEUED";
  if (status === "RETRY_WAIT") return "RETRY_WAIT";
  if (status === "PAUSED") return "PAUSED";
  if (status === "DEAD_LETTER") return "DEAD_LETTER";
  if (status === "PARTIAL") return "PARTIAL";
  if (status === "SUCCEEDED") return "SUCCEEDED";
  if (status === "FAILED") return "FAILED";
  if (status === "CANCELLED") return "CANCELLED";
  if (status === "CLAIMED") return "CLAIMED";
  return "RUNNING";
}

function runHistoryEntry(run: ProviderRunRow) {
  const status = providerRunStatus(run.status);
  return {
    id: run.id,
    status,
    phase: phaseForStatus(status),
    startedAt: run.started_at,
    completedAt: run.completed_at,
    counters: { processed: null, total: null, succeeded: null, skipped: null, failed: null },
    sourceCounters: sourceCountersForRun(run),
    error: run.error_code ? { code: run.error_code, message: run.error_message_redacted ?? "provider同步失敗" } : null,
  };
}

async function providerRuns(db: D1Database, connectionId: string): Promise<ProviderRunRow[]> {
  const result = await db.prepare(
    `SELECT id, status, started_at, completed_at, fetched_count, created_count, updated_count,
            ignored_count, error_count, error_code, error_message_redacted
     FROM provider_sync_runs
     WHERE connection_id = ?
     ORDER BY started_at DESC, id DESC
     LIMIT ?`,
  ).bind(connectionId, HISTORY_LIMIT).all<ProviderRunRow>();
  return result.results;
}

async function buildProviderJob(db: D1Database, row: ProviderJobRow): Promise<AsyncJobOutput> {
  const runs = await providerRuns(db, row.connection_id);
  const latest = runs[0] ?? null;
  const status = providerJobStatus(row.status);
  const latestError = latest?.error_code
    ? { code: latest.error_code, message: latest.error_message_redacted ?? "provider同步失敗" }
    : row.last_error_code
      ? { code: row.last_error_code, message: "provider同步需要重試或人工處理。" }
      : null;
  const warnings = latest?.status === "PARTIAL" && latest.error_message_redacted ? [latest.error_message_redacted] : [];
  const result = latest && ["SUCCEEDED", "PARTIAL"].includes(latest.status)
    ? {
      runId: latest.id,
      status: latest.status,
      fetchedCount: latest.fetched_count,
      createdCount: latest.created_count,
      updatedCount: latest.updated_count,
      ignoredCount: latest.ignored_count,
      errorCount: latest.error_count,
    }
    : null;
  return asyncJobOutputSchema.parse({
    contractVersion: "async-job.v1",
    id: row.id,
    kind: "PROVIDER_SYNC",
    status,
    phase: phaseForStatus(status),
    version: row.updated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastUpdatedAt: row.updated_at,
    expiresAt: null,
    nextRunAt: row.next_run_at,
    attempt: row.attempt,
    maxAttempts: row.max_attempts,
    currentRunId: latest?.id ?? null,
    progress: null,
    counters: { processed: null, total: null, succeeded: null, skipped: null, failed: null },
    sourceCounters: latest ? sourceCountersForRun(latest) : { fetched: null, created: null, updated: null, ignored: null, errors: null },
    counterInvariant: "SOURCE_REPORTED_DIFFERENT_UNITS",
    result,
    warnings,
    error: status === "DEAD_LETTER" || status === "PAUSED" || status === "RETRY_WAIT" || latest?.status === "FAILED" ? latestError : null,
    retryable: row.status === "RETRY",
    cancelSupported: false,
    capabilities: {
      retrySupported: false,
      cancelSupported: false,
      reloadRecovery: true,
      historyPersisted: true,
      backgroundContinuation: true,
    },
    source: { providerKey: row.provider_key, connectionId: row.connection_id, moduleKey: null, provider: row.provider_key },
    history: runs.map(runHistoryEntry),
    provenance: {
      sourceTable: latest ? "provider_sync_runs" : "provider_sync_jobs",
      sourceId: latest?.id ?? row.id,
      sourceUpdatedAt: row.updated_at,
      counterSemantics: "provider_sync_runs counters are source-reported payload/entity counters; they are not a shared row partition, so no processed/total percentage is emitted.",
    },
  });
}

function importStatus(status: ImportBatchRow["status"]): AsyncJobOutput["status"] {
  if (status === "PREVIEW" || status === "VALIDATED") return "QUEUED";
  if (status === "IMPORTING") return "RUNNING";
  if (status === "COMPLETED") return "SUCCEEDED";
  if (status === "COMPLETED_WITH_ERRORS") return "PARTIAL";
  return "FAILED";
}

function importCounters(row: ImportBatchRow) {
  return {
    processed: row.imported_rows + row.duplicate_rows + row.error_rows,
    total: row.total_rows,
    succeeded: row.imported_rows,
    skipped: row.duplicate_rows,
    failed: row.error_rows,
  };
}

async function buildImportJob(row: ImportBatchRow): Promise<AsyncJobOutput> {
  const status = importStatus(row.status);
  const counters = importCounters(row);
  return asyncJobOutputSchema.parse({
    contractVersion: "async-job.v1",
    id: row.id,
    kind: "CSV_IMPORT",
    status,
    phase: row.status === "PREVIEW" || row.status === "VALIDATED" ? "VALIDATING" : phaseForStatus(status),
    version: row.updated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastUpdatedAt: row.updated_at,
    expiresAt: null,
    nextRunAt: null,
    attempt: 0,
    maxAttempts: 1,
    currentRunId: null,
    progress: row.total_rows > 0 ? { processed: counters.processed, total: row.total_rows } : null,
    counters,
    sourceCounters: {
      imported: row.imported_rows,
      duplicates: row.duplicate_rows,
      errorRows: row.error_rows,
      totalRows: row.total_rows,
    },
    counterInvariant: "ROW_PARTITION",
    result: status === "SUCCEEDED" || status === "PARTIAL"
      ? { batchId: row.id, totalRows: row.total_rows, importedRows: row.imported_rows, duplicateRows: row.duplicate_rows, errorRows: row.error_rows, status: row.status }
      : null,
    warnings: row.error_rows > 0 ? [`${row.error_rows}列匯入失敗。`] : [],
    error: status === "FAILED" ? { code: "IMPORT_FAILED", message: "CSV匯入失敗，請查看匯入列錯誤。" } : null,
    retryable: false,
    cancelSupported: false,
    capabilities: {
      retrySupported: false,
      cancelSupported: false,
      reloadRecovery: true,
      historyPersisted: false,
      backgroundContinuation: false,
    },
    source: { providerKey: null, connectionId: null, moduleKey: row.module_key, provider: row.provider_key },
    history: [],
    provenance: {
      sourceTable: "import_batches",
      sourceId: row.id,
      sourceUpdatedAt: row.updated_at,
      counterSemantics: "import_batches counters partition total_rows into imported, duplicate and error rows; the partition is exact only after the operation has finished processing.",
    },
  });
}

async function providerJobById(db: D1Database, id: string): Promise<ProviderJobRow | null> {
  return db.prepare(
    `SELECT id, provider_key, connection_id, next_run_at, status, attempt, max_attempts,
            last_error_code, created_at, updated_at
     FROM provider_sync_jobs WHERE id = ?`,
  ).bind(id).first<ProviderJobRow>();
}

async function importBatchById(db: D1Database, id: string): Promise<ImportBatchRow | null> {
  return db.prepare(
    `SELECT id, module_key, provider_key, status, total_rows, imported_rows, duplicate_rows,
            error_rows, started_at, completed_at, created_at, updated_at
     FROM import_batches WHERE id = ?`,
  ).bind(id).first<ImportBatchRow>();
}

export async function listAsyncJobs(input: {
  db: D1Database;
  query: unknown;
}): Promise<{ items: AsyncJobOutput[]; nextCursor: string | null }> {
  const parsed = asyncJobListQuerySchema.safeParse(input.query);
  if (!parsed.success) {
    throw new ApiError(400, "VALIDATION_FAILED", "非同步工作查詢格式錯誤。", {
      issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    });
  }
  const cursor = decodeCursor(parsed.data.cursor);
  const values: Array<string | number> = [];
  const cursorClause = cursor
    ? "WHERE (updated_at < ? OR (updated_at = ? AND id < ?))"
    : "";
  if (cursor) values.push(cursor.updatedAt, cursor.updatedAt, cursor.id);
  const table = parsed.data.kind === "PROVIDER_SYNC" ? "provider_sync_jobs" : "import_batches";
  const rows = await input.db.prepare(
    `SELECT * FROM ${table} ${cursorClause} ORDER BY updated_at DESC, id DESC LIMIT ?`,
  ).bind(...values, parsed.data.limit + 1).all<ProviderJobRow | ImportBatchRow>();
  const hasMore = rows.results.length > parsed.data.limit;
  const pageRows = rows.results.slice(0, parsed.data.limit);
  const items = parsed.data.kind === "PROVIDER_SYNC"
    ? await Promise.all((pageRows as ProviderJobRow[]).map((row) => buildProviderJob(input.db, row)))
    : await Promise.all((pageRows as ImportBatchRow[]).map((row) => buildImportJob(row)));
  const tail = pageRows.at(-1);
  return {
    items,
    nextCursor: hasMore && tail ? encodeCursor({ updatedAt: String(tail.updated_at), id: String(tail.id) }) : null,
  };
}

export async function getAsyncJob(input: {
  db: D1Database;
  id: string;
  kind: unknown;
}): Promise<AsyncJobOutput> {
  const parsedId = identifierSchema.safeParse(input.id);
  if (!parsedId.success) throw new ApiError(404, "NOT_FOUND", "找不到非同步工作。");
  const parsedKind = asyncJobKindSchema.safeParse(input.kind ?? "PROVIDER_SYNC");
  if (!parsedKind.success) throw new ApiError(400, "VALIDATION_FAILED", "非同步工作類型無效。", { kind: input.kind });
  if (parsedKind.data === "PROVIDER_SYNC") {
    const row = await providerJobById(input.db, parsedId.data);
    if (!row) throw new ApiError(404, "NOT_FOUND", "找不到非同步工作。");
    return buildProviderJob(input.db, row);
  }
  const row = await importBatchById(input.db, parsedId.data);
  if (!row) throw new ApiError(404, "NOT_FOUND", "找不到非同步工作。");
  return buildImportJob(row);
}
