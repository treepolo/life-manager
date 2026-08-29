import { v7 as uuidv7 } from "uuid";

import { newId, nowIso } from "@/core/database/d1";
import { ApiError } from "@/core/errors/api-error";
import { syncBatchSchema, type SyncOperation } from "@/core/sync/schema";
import { fromDb, parseEntity, toDbValue, validateResourceReferences } from "@/worker/api/crud";
import { resourceDefinitions, type ResourceDefinition } from "@/worker/api/resources";

type DbRow = Record<string, string | number | null>;

function diffFields(local: Record<string, unknown>, server: Record<string, unknown>): Record<string, { local: unknown; server: unknown }> {
  const diff: Record<string, { local: unknown; server: unknown }> = {};
  for (const key of new Set([...Object.keys(local), ...Object.keys(server)])) {
    if (JSON.stringify(local[key]) !== JSON.stringify(server[key])) diff[key] = { local: local[key], server: server[key] };
  }
  return diff;
}

async function recordConflict(
  db: D1Database,
  operation: SyncOperation,
  server: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const now = nowIso();
  const conflictId = newId();
  await db.batch([
    db.prepare(
      `INSERT INTO sync_operations
       (operation_id, device_id, entity_type, entity_id, operation_kind, base_version, payload_json,
        client_occurred_at, schema_version, status, result_version, error_code, applied_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'CONFLICT', ?, 'SYNC_VERSION_CONFLICT', ?)`,
    ).bind(
      operation.operationId,
      operation.deviceId,
      operation.entityType,
      operation.entityId,
      operation.kind,
      operation.baseVersion,
      JSON.stringify(operation.payload),
      operation.clientOccurredAt,
      operation.schemaVersion,
      Number(server.version),
      now,
    ),
    db.prepare(
      `INSERT INTO conflict_records
       (id, operation_id, device_id, entity_type, entity_id, base_version, server_version,
        local_payload_json, server_payload_json, field_diff_json, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?)`,
    ).bind(
      conflictId,
      operation.operationId,
      operation.deviceId,
      operation.entityType,
      operation.entityId,
      operation.baseVersion,
      Number(server.version),
      JSON.stringify(operation.payload),
      JSON.stringify(server),
      JSON.stringify(diffFields(operation.payload, server)),
      now,
    ),
  ]);
  return { operationId: operation.operationId, status: "CONFLICT", conflictId, server };
}

async function applyResourceOperation(
  db: D1Database,
  definition: ResourceDefinition,
  operation: SyncOperation,
  actorId: string,
  requestId: string,
): Promise<Record<string, unknown>> {
  const prior = await db.prepare(
    "SELECT status, result_version, error_code FROM sync_operations WHERE operation_id = ?",
  ).bind(operation.operationId).first<{ status: string; result_version: number | null; error_code: string | null }>();
  if (prior) {
    return {
      operationId: operation.operationId,
      status: prior.status,
      resultVersion: prior.result_version,
      idempotentReplay: true,
    };
  }

  const existingRow = await db.prepare(`SELECT * FROM ${definition.table} WHERE id = ?`)
    .bind(operation.entityId)
    .first<DbRow>();
  const existing = existingRow ? fromDb(definition, existingRow) : null;

  if (operation.kind === "RESTORE" && !existing) {
    throw new ApiError(404, "NOT_FOUND", "同步恢復目標不存在。", {
      entityType: operation.entityType,
      entityId: operation.entityId,
    });
  }

  if (operation.kind === "UPSERT" && !existing) {
    const entity = parseEntity(definition, { ...operation.payload, id: operation.entityId });
    await validateResourceReferences(db, definition, entity);
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
    const now = nowIso();
    if (definition.timestamps) {
      columns.push("created_at", "updated_at");
      values.push(now, now);
    }
    if (definition.versioned) {
      columns.push("version");
      values.push(1);
    }
    const snapshot = {
      ...entity,
      ...(definition.timestamps ? { createdAt: now, updatedAt: now } : {}),
      ...(definition.versioned ? { version: 1 } : {}),
    };
    await db.batch([
      db.prepare(
        `INSERT INTO ${definition.table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
      ).bind(...values),
      db.prepare(
        `INSERT INTO sync_operations
         (operation_id, device_id, entity_type, entity_id, operation_kind, base_version, payload_json,
          client_occurred_at, schema_version, status, result_version, applied_at)
         VALUES (?, ?, ?, ?, 'UPSERT', ?, ?, ?, ?, 'APPLIED', 1, ?)`,
      ).bind(
        operation.operationId,
        operation.deviceId,
        operation.entityType,
        operation.entityId,
        operation.baseVersion,
        JSON.stringify(operation.payload),
        operation.clientOccurredAt,
        operation.schemaVersion,
        now,
      ),
      db.prepare(
        `INSERT INTO sync_change_log
         (entity_type, entity_id, operation_kind, entity_version, snapshot_json, changed_at, operation_id)
         VALUES (?, ?, 'UPSERT', 1, ?, ?, ?)`,
      ).bind(operation.entityType, operation.entityId, JSON.stringify(snapshot), now, operation.operationId),
      db.prepare(
        `INSERT INTO audit_log
         (id, request_id, actor_id, entity_type, entity_id, action, before_json, after_json, occurred_at)
         VALUES (?, ?, ?, ?, ?, 'UPSERT', NULL, ?, ?)`,
      ).bind(newId(), requestId, actorId, operation.entityType, operation.entityId, JSON.stringify(snapshot), now),
    ]);
    return { operationId: operation.operationId, status: "APPLIED", resultVersion: 1 };
  }

  if (!existing) {
    throw new ApiError(404, "NOT_FOUND", "同步目標不存在。", {
      entityType: operation.entityType,
      entityId: operation.entityId,
    });
  }
  if (!definition.versioned) throw new ApiError(405, "VALIDATION_FAILED", "此同步資料不支援版本修改。");
  if (operation.baseVersion !== Number(existing.version)) return recordConflict(db, operation, existing);
  if (definition.appendOnly) throw new ApiError(405, "VALIDATION_FAILED", "此紀錄不可覆寫。");

  const now = nowIso();
  const nextVersion = Number(existing.version) + 1;
  const assignments: string[] = [];
  const values: Array<string | number | null> = [];
  let snapshot: Record<string, unknown>;

  if (operation.kind === "UPSERT") {
    const invalid = Object.keys(operation.payload).filter((field) => field === "id" || !(field in definition.columns));
    if (invalid.length) {
      throw new ApiError(400, "VALIDATION_FAILED", "同步內容含不允許欄位。", { invalid });
    }
    const full = Object.fromEntries(Object.keys(definition.columns).map((field) => [field, existing[field]]));
    const validated = parseEntity(definition, { ...full, ...operation.payload, id: operation.entityId });
    await validateResourceReferences(db, definition, validated);
    for (const field of Object.keys(operation.payload)) {
      assignments.push(`${definition.columns[field]} = ?`);
      values.push(toDbValue(definition, field, validated[field]));
    }
    snapshot = { ...existing, ...operation.payload, updatedAt: now, version: nextVersion };
  } else if (operation.kind === "ARCHIVE" || operation.kind === "RESTORE") {
    if (!definition.archivable) throw new ApiError(405, "VALIDATION_FAILED", "此資料不支援封存或恢復。");
    const value = operation.kind === "RESTORE" ? null : now;
    assignments.push("archived_at = ?");
    values.push(value);
    snapshot = { ...existing, archivedAt: value, updatedAt: now, version: nextVersion };
  } else if (operation.kind === "DELETE") {
    if (!definition.softDelete) throw new ApiError(405, "VALIDATION_FAILED", "此資料不支援刪除。");
    assignments.push("deleted_at = ?");
    values.push(now);
    snapshot = { ...existing, deletedAt: now, updatedAt: now, version: nextVersion };
  } else {
    throw new ApiError(405, "VALIDATION_FAILED", "不支援的同步操作種類。", { kind: operation.kind });
  }

  if (definition.timestamps) {
    assignments.push("updated_at = ?");
    values.push(now);
  }
  assignments.push("version = version + 1");

  const results = await db.batch([
    db.prepare(
      `UPDATE ${definition.table} SET ${assignments.join(", ")} WHERE id = ? AND version = ?`,
    ).bind(...values, operation.entityId, operation.baseVersion),
    db.prepare(
      `INSERT INTO sync_operations
       (operation_id, device_id, entity_type, entity_id, operation_kind, base_version, payload_json,
        client_occurred_at, schema_version, status, result_version, applied_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, 'APPLIED', ?, ?
       WHERE EXISTS (SELECT 1 FROM ${definition.table} WHERE id = ? AND version = ?)`,
    ).bind(
      operation.operationId,
      operation.deviceId,
      operation.entityType,
      operation.entityId,
      operation.kind,
      operation.baseVersion,
      JSON.stringify(operation.payload),
      operation.clientOccurredAt,
      operation.schemaVersion,
      nextVersion,
      now,
      operation.entityId,
      nextVersion,
    ),
    db.prepare(
      `INSERT INTO sync_change_log
       (entity_type, entity_id, operation_kind, entity_version, snapshot_json, changed_at, operation_id)
       SELECT ?, ?, ?, ?, ?, ?, ?
       WHERE EXISTS (SELECT 1 FROM ${definition.table} WHERE id = ? AND version = ?)`,
    ).bind(
      operation.entityType,
      operation.entityId,
      operation.kind,
      nextVersion,
      JSON.stringify(snapshot),
      now,
      operation.operationId,
      operation.entityId,
      nextVersion,
    ),
    db.prepare(
      `INSERT INTO audit_log
       (id, request_id, actor_id, entity_type, entity_id, action, before_json, after_json, occurred_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
       WHERE EXISTS (SELECT 1 FROM ${definition.table} WHERE id = ? AND version = ?)`,
    ).bind(
      newId(),
      requestId,
      actorId,
      operation.entityType,
      operation.entityId,
      operation.kind,
      JSON.stringify(existing),
      JSON.stringify(snapshot),
      now,
      operation.entityId,
      nextVersion,
    ),
  ]);

  if ((results[0].meta.changes ?? 0) === 0) return recordConflict(db, operation, existing);
  if (operation.resolutionConflictId && operation.resolutionKind) {
    await db.prepare(
      "UPDATE conflict_records SET status = ?, resolution_operation_id = ?, resolved_at = ? WHERE id = ? AND status = 'OPEN'",
    ).bind(`RESOLVED_${operation.resolutionKind}`, operation.operationId, now, operation.resolutionConflictId).run();
  }
  return { operationId: operation.operationId, status: "APPLIED", resultVersion: nextVersion };
}

export async function applySyncBatch(input: {
  db: D1Database;
  body: unknown;
  actorId: string;
  requestId: string;
}): Promise<Record<string, unknown>> {
  const parsed = syncBatchSchema.safeParse(input.body);
  if (!parsed.success) {
    throw new ApiError(400, "VALIDATION_FAILED", "同步批次格式無效。", {
      issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    });
  }
  const results: Record<string, unknown>[] = [];
  for (const operation of parsed.data.operations) {
    const device = await input.db.prepare(
      "SELECT id FROM sync_devices WHERE id = ? AND disabled_at IS NULL",
    ).bind(operation.deviceId).first();
    if (!device) throw new ApiError(403, "ACCESS_UNAUTHORIZED", "同步裝置尚未註冊或已停用。");
    const definition = resourceDefinitions[operation.entityType];
    if (!definition) {
      throw new ApiError(400, "VALIDATION_FAILED", "不支援的同步資料類型。", { entityType: operation.entityType });
    }
    results.push(await applyResourceOperation(input.db, definition, operation, input.actorId, input.requestId));
  }
  return { data: { results }, meta: { requestId: input.requestId } };
}

export async function resolveSyncConflict(input: {
  db: D1Database;
  conflictId: string;
  resolution: "LOCAL" | "SERVER" | "MERGED";
  mergedPayload?: Record<string, unknown>;
  actorId: string;
  requestId: string;
}): Promise<Record<string, unknown>> {
  const conflict = await input.db.prepare(
    `SELECT id, operation_id, device_id, entity_type, entity_id, server_version,
            local_payload_json, server_payload_json
     FROM conflict_records WHERE id = ? AND status = 'OPEN'`,
  ).bind(input.conflictId).first<{
    id: string;
    operation_id: string;
    device_id: string;
    entity_type: string;
    entity_id: string;
    server_version: number;
    local_payload_json: string;
    server_payload_json: string;
  }>();
  if (!conflict) throw new ApiError(404, "NOT_FOUND", "找不到尚未解決的同步衝突。");
  const now = nowIso();

  if (input.resolution === "SERVER") {
    await input.db.prepare(
      "UPDATE conflict_records SET status = 'RESOLVED_SERVER', resolved_at = ? WHERE id = ? AND status = 'OPEN'",
    ).bind(now, input.conflictId).run();
    return {
      data: {
        conflictId: input.conflictId,
        originalOperationId: conflict.operation_id,
        resolution: input.resolution,
        entity: JSON.parse(conflict.server_payload_json),
      },
      meta: { requestId: input.requestId },
    };
  }

  const payload = input.resolution === "LOCAL"
    ? JSON.parse(conflict.local_payload_json) as Record<string, unknown>
    : input.mergedPayload;
  if (!payload || !Object.keys(payload).length) {
    throw new ApiError(400, "VALIDATION_FAILED", "合併內容不能為空。");
  }
  const resolutionOperationId = uuidv7();
  const applied = await applySyncBatch({
    db: input.db,
    actorId: input.actorId,
    requestId: input.requestId,
    body: {
      operations: [{
        operationId: resolutionOperationId,
        deviceId: conflict.device_id,
        entityType: conflict.entity_type,
        entityId: conflict.entity_id,
        kind: "UPSERT",
        baseVersion: conflict.server_version,
        payload,
        clientOccurredAt: now,
        schemaVersion: 1,
        resolutionConflictId: input.conflictId,
        resolutionKind: input.resolution,
      }],
    },
  });
  return {
    data: {
      conflictId: input.conflictId,
      originalOperationId: conflict.operation_id,
      resolutionOperationId,
      resolution: input.resolution,
      applied,
    },
    meta: { requestId: input.requestId },
  };
}

export async function pullChanges(
  db: D1Database,
  deviceId: string,
  afterCursor: number,
  limit = 200,
): Promise<Record<string, unknown>> {
  const device = await db.prepare(
    "SELECT id FROM sync_devices WHERE id = ? AND disabled_at IS NULL",
  ).bind(deviceId).first();
  if (!device) throw new ApiError(403, "ACCESS_UNAUTHORIZED", "同步裝置尚未註冊或已停用。");
  const result = await db.prepare(
    `SELECT cursor, entity_type, entity_id, operation_kind, entity_version, snapshot_json, changed_at
     FROM sync_change_log WHERE cursor > ? ORDER BY cursor ASC LIMIT ?`,
  ).bind(afterCursor, Math.min(Math.max(limit, 1), 500)).all<{
    cursor: number;
    entity_type: string;
    entity_id: string;
    operation_kind: string;
    entity_version: number;
    snapshot_json: string;
    changed_at: string;
  }>();
  const nextCursor = result.results.at(-1)?.cursor ?? afterCursor;
  const pulledAt = nowIso();
  await db.batch([
    db.prepare(
      "UPDATE sync_devices SET last_seen_at = ?, updated_at = ?, version = version + 1 WHERE id = ?",
    ).bind(pulledAt, pulledAt, deviceId),
    db.prepare(
      `INSERT INTO sync_cursors (device_id, last_pulled_cursor, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(device_id) DO UPDATE SET
         last_pulled_cursor = MAX(sync_cursors.last_pulled_cursor, excluded.last_pulled_cursor),
         updated_at = excluded.updated_at`,
    ).bind(deviceId, nextCursor, pulledAt),
  ]);
  return {
    changes: result.results.map((row) => ({
      cursor: row.cursor,
      entityType: row.entity_type,
      entityId: row.entity_id,
      kind: row.operation_kind,
      version: row.entity_version,
      snapshot: JSON.parse(row.snapshot_json),
      changedAt: row.changed_at,
    })),
    nextCursor,
  };
}
