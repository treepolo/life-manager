import { z } from "zod";

import { sha256 } from "@/core/crypto/secrets";
import { firstOrNotFound, newId, nowIso } from "@/core/database/d1";
import { ApiError } from "@/core/errors/api-error";
import { operationIdSchema } from "@/core/validation/common";
import type { ResourceDefinition } from "@/worker/api/resources";
import { resourceDefinitions } from "@/worker/api/resources";

const writeRequestSchema = z.object({
  operationId: operationIdSchema,
  baseVersion: z.int().positive().optional(),
  data: z.record(z.string(), z.unknown()),
});

const responseSchema = z.object({
  data: z.record(z.string(), z.unknown()),
  meta: z.object({ requestId: z.string(), idempotentReplay: z.boolean().optional() }),
});

type DbRow = Record<string, string | number | null>;

export function fromDb(definition: ResourceDefinition, row: DbRow): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [field, column] of Object.entries(definition.columns)) {
    const raw = row[column];
    if (definition.booleanFields?.has(field)) result[field] = raw === 1;
    else if (definition.jsonFields?.has(field)) result[field] = typeof raw === "string" ? JSON.parse(raw) : raw;
    else result[field] = raw;
  }
  for (const [field, column] of [
    ["sourceType", "source_type"],
    ["archivedAt", "archived_at"],
    ["deletedAt", "deleted_at"],
    ["createdAt", "created_at"],
    ["updatedAt", "updated_at"],
    ["version", "version"],
  ] as const) {
    if (column in row && !(field in result)) result[field] = row[column];
  }
  return result;
}

export function toDbValue(definition: ResourceDefinition, field: string, value: unknown): string | number | null {
  if (value === undefined || value === null) return null;
  if (definition.booleanFields?.has(field)) return value ? 1 : 0;
  if (definition.jsonFields?.has(field)) return JSON.stringify(value);
  if (typeof value === "string" || typeof value === "number") return value;
  throw new ApiError(400, "VALIDATION_FAILED", `欄位${field}的資料型別無效。`);
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ApiError(400, "VALIDATION_FAILED", "請求內容必須是有效JSON。");
  }
}

function parseWriteRequest(value: unknown): z.infer<typeof writeRequestSchema> {
  const parsed = writeRequestSchema.safeParse(value);
  if (!parsed.success) {
    throw new ApiError(400, "VALIDATION_FAILED", "寫入資料驗證失敗。", {
      issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    });
  }
  return parsed.data;
}

export function parseEntity(definition: ResourceDefinition, value: unknown): Record<string, unknown> {
  const parsed = definition.inputSchema.safeParse(value);
  if (!parsed.success) {
    throw new ApiError(400, "VALIDATION_FAILED", `${definition.label}資料驗證失敗。`, {
      issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    });
  }
  return parsed.data as Record<string, unknown>;
}

export async function validateResourceReferences(db: D1Database, definition: ResourceDefinition, entity: Record<string, unknown>): Promise<void> {
  if (definition.key === "daily-tasks") {
    const category = await db.prepare(
      "SELECT id FROM task_categories_v2 WHERE id = ? AND deleted_at IS NULL AND archived_at IS NULL",
    ).bind(entity.categoryId).first();
    if (!category) throw new ApiError(404, "NOT_FOUND", "找不到使用中的任務分類。");
  }
  if (definition.key === "daily-task-completions") {
    const task = await db.prepare(
      `SELECT t.id FROM daily_tasks_v2 t
       JOIN task_categories_v2 c ON c.id = t.category_id
       WHERE t.id = ? AND t.deleted_at IS NULL AND t.archived_at IS NULL
         AND c.deleted_at IS NULL AND c.archived_at IS NULL`,
    ).bind(entity.taskId).first();
    if (!task) throw new ApiError(404, "NOT_FOUND", "找不到使用中的每日任務。");
  }
}

async function replayIfPresent(
  db: D1Database,
  operationId: string,
  requestHash: string,
  requestId: string,
): Promise<Response | null> {
  const stored = await db
    .prepare("SELECT request_hash, response_status, response_json FROM api_idempotency WHERE operation_id = ?")
    .bind(operationId)
    .first<{ request_hash: string; response_status: number; response_json: string }>();
  if (!stored) return null;
  if (stored.request_hash !== requestHash) {
    throw new ApiError(409, "IDEMPOTENCY_CONFLICT", "相同operationId已用於不同內容。", { operationId });
  }
  const body = JSON.parse(stored.response_json) as { data: Record<string, unknown>; meta: Record<string, unknown> };
  body.meta = { ...body.meta, requestId, idempotentReplay: true };
  return Response.json(responseSchema.parse(body), { status: stored.response_status });
}

async function getRow(db: D1Database, definition: ResourceDefinition, id: string): Promise<DbRow> {
  return firstOrNotFound<DbRow>(
    db.prepare(`SELECT * FROM ${definition.table} WHERE id = ? AND ${definition.softDelete ? "deleted_at IS NULL" : "1 = 1"}`).bind(id),
    definition.label,
  );
}

async function createResource(
  request: Request,
  db: D1Database,
  definition: ResourceDefinition,
  actorId: string,
  requestId: string,
): Promise<Response> {
  const write = parseWriteRequest(await readJson(request));
  const entity = parseEntity(definition, write.data);
  await validateResourceReferences(db, definition, entity);
  const requestHash = await sha256(`${request.method}:${definition.key}:${JSON.stringify(write.data)}`);
  const replay = await replayIfPresent(db, write.operationId, requestHash, requestId);
  if (replay) return replay;
  const now = nowIso();
  const columns: string[] = [];
  const values: Array<string | number | null> = [];
  for (const [field, column] of Object.entries(definition.columns)) {
    if (entity[field] !== undefined) {
      columns.push(column);
      values.push(toDbValue(definition, field, entity[field]));
    }
  }
  if (definition.defaultSourceType && !columns.includes("source_type")) {
    columns.push("source_type");
    values.push(definition.defaultSourceType);
  }
  if (definition.timestamps) {
    columns.push("created_at", "updated_at");
    values.push(now, now);
  }
  if (definition.versioned) {
    columns.push("version");
    values.push(1);
  }
  const responseBody = responseSchema.parse({
    data: { ...entity, createdAt: now, updatedAt: now, version: definition.versioned ? 1 : undefined },
    meta: { requestId },
  });
  const responseJson = JSON.stringify(responseBody);
  const insert = db
    .prepare(`INSERT INTO ${definition.table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`)
    .bind(...values);
  const audit = db
    .prepare(
      "INSERT INTO audit_log (id, request_id, actor_id, entity_type, entity_id, action, before_json, after_json, occurred_at) VALUES (?, ?, ?, ?, ?, 'CREATE', NULL, ?, ?)",
    )
    .bind(newId(), requestId, actorId, definition.key, String(entity.id), JSON.stringify(entity), now);
  const idem = db
    .prepare(
      "INSERT INTO api_idempotency (operation_id, request_hash, resource_type, resource_id, response_status, response_json, created_at) VALUES (?, ?, ?, ?, 201, ?, ?)",
    )
    .bind(write.operationId, requestHash, definition.key, String(entity.id), responseJson, now);
  const change = db.prepare(
    "INSERT INTO sync_change_log (entity_type, entity_id, operation_kind, entity_version, snapshot_json, changed_at, operation_id) VALUES (?, ?, 'UPSERT', 1, ?, ?, NULL)",
  ).bind(definition.key, String(entity.id), JSON.stringify(responseBody.data), now);
  await db.batch([insert, audit, idem, change]);
  return Response.json(responseBody, { status: 201 });
}

async function updateResource(
  request: Request,
  db: D1Database,
  definition: ResourceDefinition,
  id: string,
  actorId: string,
  requestId: string,
): Promise<Response> {
  if (definition.appendOnly) throw new ApiError(405, "VALIDATION_FAILED", `${definition.label}是只新增紀錄，不能覆寫。`);
  const write = parseWriteRequest(await readJson(request));
  if (!write.baseVersion) throw new ApiError(400, "VALIDATION_FAILED", "更新必須提供baseVersion。");
  if (Object.keys(write.data).length === 0) throw new ApiError(400, "VALIDATION_FAILED", "沒有要更新的欄位。");
  const invalidFields = Object.keys(write.data).filter((field) => field === "id" || !(field in definition.columns));
  if (invalidFields.length) throw new ApiError(400, "VALIDATION_FAILED", "更新包含不允許的欄位。", { invalidFields });
  const requestHash = await sha256(`${request.method}:${definition.key}:${id}:${JSON.stringify(write)}`);
  const replay = await replayIfPresent(db, write.operationId, requestHash, requestId);
  if (replay) return replay;
  const currentRow = await getRow(db, definition, id);
  const current = fromDb(definition, currentRow);
  if (Number(current.version) !== write.baseVersion) {
    throw new ApiError(409, "VERSION_CONFLICT", "資料已在其他裝置更新，請比較版本後再決定。", {
      baseVersion: write.baseVersion,
      serverVersion: current.version,
      server: current,
    });
  }
  const mergedInput = Object.fromEntries(Object.keys(definition.columns).map((field) => [field, current[field]]));
  Object.assign(mergedInput, write.data, { id });
  const validated = parseEntity(definition, mergedInput);
  await validateResourceReferences(db, definition, validated);
  const fields = Object.keys(write.data);
  const assignments = fields.map((field) => `${definition.columns[field]} = ?`);
  const values = fields.map((field) => toDbValue(definition, field, validated[field]));
  const now = nowIso();
  if (definition.timestamps) {
    assignments.push("updated_at = ?");
    values.push(now);
  }
  assignments.push("version = version + 1");
  const nextVersion = write.baseVersion + 1;
  const next = { ...current, ...write.data, updatedAt: now, version: nextVersion };
  const responseBody = responseSchema.parse({ data: next, meta: { requestId } });
  const responseJson = JSON.stringify(responseBody);
  const deleteClause = definition.softDelete ? "AND deleted_at IS NULL" : "";
  const update = db
    .prepare(`UPDATE ${definition.table} SET ${assignments.join(", ")} WHERE id = ? AND version = ? ${deleteClause}`)
    .bind(...values, id, write.baseVersion);
  const audit = db
    .prepare(
      `INSERT INTO audit_log (id, request_id, actor_id, entity_type, entity_id, action, before_json, after_json, occurred_at)
       SELECT ?, ?, ?, ?, ?, 'UPDATE', ?, ?, ? WHERE EXISTS (SELECT 1 FROM ${definition.table} WHERE id = ? AND version = ?)`,
    )
    .bind(newId(), requestId, actorId, definition.key, id, JSON.stringify(current), JSON.stringify(next), now, id, nextVersion);
  const idem = db
    .prepare(
      `INSERT INTO api_idempotency (operation_id, request_hash, resource_type, resource_id, response_status, response_json, created_at)
       SELECT ?, ?, ?, ?, 200, ?, ? WHERE EXISTS (SELECT 1 FROM ${definition.table} WHERE id = ? AND version = ?)`,
    )
    .bind(write.operationId, requestHash, definition.key, id, responseJson, now, id, nextVersion);
  const change = db.prepare(
    `INSERT INTO sync_change_log (entity_type, entity_id, operation_kind, entity_version, snapshot_json, changed_at, operation_id)
     SELECT ?, ?, 'UPSERT', ?, ?, ?, NULL WHERE EXISTS (SELECT 1 FROM ${definition.table} WHERE id = ? AND version = ?)`,
  ).bind(definition.key, id, nextVersion, JSON.stringify(next), now, id, nextVersion);
  const results = await db.batch([update, audit, idem, change]);
  if ((results[0].meta.changes ?? 0) === 0) {
    throw new ApiError(409, "VERSION_CONFLICT", "更新時資料版本已改變，請重新同步。", { baseVersion: write.baseVersion });
  }
  return Response.json(responseBody);
}

async function archiveOrDeleteResource(
  request: Request,
  db: D1Database,
  definition: ResourceDefinition,
  id: string,
  actorId: string,
  requestId: string,
  restore: boolean,
): Promise<Response> {
  if (definition.appendOnly || !definition.versioned) throw new ApiError(405, "VALIDATION_FAILED", `${definition.label}不支援此操作。`);
  const write = parseWriteRequest(await readJson(request));
  if (!write.baseVersion) throw new ApiError(400, "VALIDATION_FAILED", "封存、恢復或刪除必須提供baseVersion。");
  const requestHash = await sha256(`${request.method}:${definition.key}:${id}:${restore}:${JSON.stringify(write)}`);
  const replay = await replayIfPresent(db, write.operationId, requestHash, requestId);
  if (replay) return replay;
  const currentRow = await getRow(db, definition, id);
  const current = fromDb(definition, currentRow);
  if (Number(current.version) !== write.baseVersion) {
    throw new ApiError(409, "VERSION_CONFLICT", "資料版本已改變，不能直接覆蓋。", { server: current });
  }
  const column = definition.archivable ? "archived_at" : "deleted_at";
  const value = restore ? null : nowIso();
  const now = nowIso();
  const nextVersion = write.baseVersion + 1;
  const next = { ...current, [definition.archivable ? "archivedAt" : "deletedAt"]: value, updatedAt: now, version: nextVersion };
  const responseBody = responseSchema.parse({ data: next, meta: { requestId } });
  const update = db
    .prepare(`UPDATE ${definition.table} SET ${column} = ?, updated_at = ?, version = version + 1 WHERE id = ? AND version = ?`)
    .bind(value, now, id, write.baseVersion);
  const audit = db
    .prepare(
      `INSERT INTO audit_log (id, request_id, actor_id, entity_type, entity_id, action, before_json, after_json, occurred_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM ${definition.table} WHERE id = ? AND version = ?)`,
    )
    .bind(newId(), requestId, actorId, definition.key, id, restore ? "RESTORE" : definition.archivable ? "ARCHIVE" : "DELETE", JSON.stringify(current), JSON.stringify(next), now, id, nextVersion);
  const idem = db
    .prepare(
      `INSERT INTO api_idempotency (operation_id, request_hash, resource_type, resource_id, response_status, response_json, created_at)
       SELECT ?, ?, ?, ?, 200, ?, ? WHERE EXISTS (SELECT 1 FROM ${definition.table} WHERE id = ? AND version = ?)`,
    )
    .bind(write.operationId, requestHash, definition.key, id, JSON.stringify(responseBody), now, id, nextVersion);
  const change = db.prepare(
    `INSERT INTO sync_change_log (entity_type, entity_id, operation_kind, entity_version, snapshot_json, changed_at, operation_id)
     SELECT ?, ?, ?, ?, ?, ?, NULL WHERE EXISTS (SELECT 1 FROM ${definition.table} WHERE id = ? AND version = ?)`,
  ).bind(definition.key, id, restore ? "RESTORE" : definition.archivable ? "ARCHIVE" : "DELETE",
    nextVersion, JSON.stringify(next), now, id, nextVersion);
  const results = await db.batch([update, audit, idem, change]);
  if ((results[0].meta.changes ?? 0) === 0) throw new ApiError(409, "VERSION_CONFLICT", "操作時資料版本已改變。");
  return Response.json(responseBody);
}

async function listResources(request: Request, db: D1Database, definition: ResourceDefinition, requestId: string): Promise<Response> {
  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? "50"), 1), 100);
  const clauses: string[] = [];
  const values: Array<string | number> = [];
  if (definition.softDelete) clauses.push("deleted_at IS NULL");
  if (definition.archivable && url.searchParams.get("includeArchived") !== "true") clauses.push("archived_at IS NULL");
  const cursor = url.searchParams.get("cursor");
  if (cursor) {
    clauses.push("id > ?");
    values.push(cursor);
  }
  for (const field of definition.filterFields ?? []) {
    const value = url.searchParams.get(field);
    if (value !== null) {
      clauses.push(`${definition.columns[field]} = ?`);
      values.push(definition.booleanFields?.has(field) ? (value === "true" ? 1 : 0) : value);
    }
  }
  if (definition.dateColumn) {
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    if (from) { clauses.push(`${definition.dateColumn} >= ?`); values.push(from); }
    if (to) { clauses.push(`${definition.dateColumn} <= ?`); values.push(to); }
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const result = await db
    .prepare(`SELECT * FROM ${definition.table} ${where} ORDER BY id ASC LIMIT ?`)
    .bind(...values, limit + 1)
    .all<DbRow>();
  const rows = result.results;
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit).map((row) => fromDb(definition, row));
  return Response.json({ data: items, meta: { requestId, nextCursor: hasMore ? String(items.at(-1)?.id) : null } });
}

export async function handleCrudRoute(input: {
  request: Request;
  db: D1Database;
  path: string;
  actorId: string;
  requestId: string;
}): Promise<Response | null> {
  const segments = input.path.split("/").filter(Boolean);
  if (segments[0] !== "api" || segments[1] !== "v1") return null;
  const definition = resourceDefinitions[segments[2]];
  if (!definition) return null;
  const id = segments[3];
  const action = segments[4];
  if (!id) {
    if (input.request.method === "GET") return listResources(input.request, input.db, definition, input.requestId);
    if (input.request.method === "POST") return createResource(input.request, input.db, definition, input.actorId, input.requestId);
  } else {
    if (input.request.method === "GET" && !action) {
      return Response.json({ data: fromDb(definition, await getRow(input.db, definition, id)), meta: { requestId: input.requestId } });
    }
    if (input.request.method === "PATCH" && !action) {
      return updateResource(input.request, input.db, definition, id, input.actorId, input.requestId);
    }
    if (input.request.method === "POST" && action === "archive") {
      return archiveOrDeleteResource(input.request, input.db, definition, id, input.actorId, input.requestId, false);
    }
    if (input.request.method === "POST" && action === "restore") {
      return archiveOrDeleteResource(input.request, input.db, definition, id, input.actorId, input.requestId, true);
    }
    if (input.request.method === "DELETE" && !action) {
      return archiveOrDeleteResource(input.request, input.db, { ...definition, archivable: false }, id, input.actorId, input.requestId, false);
    }
  }
  throw new ApiError(405, "VALIDATION_FAILED", "此資源不支援該操作。");
}
