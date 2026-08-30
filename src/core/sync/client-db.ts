import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { v7 as uuidv7 } from "uuid";

export interface LocalEntity {
  key: string;
  entityType: string;
  entityId: string;
  version: number;
  data: Record<string, unknown>;
  pending: boolean;
  updatedAt: string;
}

export interface OutboxOperation {
  operationId: string;
  deviceId: string;
  entityType: string;
  entityId: string;
  kind: "UPSERT" | "ARCHIVE" | "RESTORE" | "DELETE" | "APPEND";
  baseVersion: number | null;
  payload: Record<string, unknown>;
  clientOccurredAt: string;
  schemaVersion: 1;
  attempts: number;
  lastError: string | null;
}

export interface LocalConflict {
  id: string;
  operationId: string;
  entityType: string;
  entityId: string;
  local: Record<string, unknown>;
  server: Record<string, unknown>;
  createdAt: string;
}

interface SyncMeta {
  key: "state";
  deviceId: string;
  cursor: number;
  lastSyncAt: string | null;
  schemaVersion: 1;
}

interface LifeManagerDb extends DBSchema {
  entities: { key: string; value: LocalEntity; indexes: { byType: string; byPending: number } };
  outbox: { key: string; value: OutboxOperation; indexes: { byCreated: string } };
  syncMeta: { key: string; value: SyncMeta };
  conflicts: { key: string; value: LocalConflict; indexes: { byEntity: string } };
  appSettings: { key: string; value: { key: string; value: unknown } };
  cachedQueries: { key: string; value: { key: string; value: unknown; cachedAt: string } };
}

let databasePromise: Promise<IDBPDatabase<LifeManagerDb>> | null = null;

function notifyOutboxChanged(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("life-manager:outbox-changed"));
}

export function localDatabase(): Promise<IDBPDatabase<LifeManagerDb>> {
  databasePromise ??= openDB<LifeManagerDb>("life-manager", 1, {
    upgrade(db) {
      const entities = db.createObjectStore("entities", { keyPath: "key" });
      entities.createIndex("byType", "entityType");
      entities.createIndex("byPending", "pending");
      const outbox = db.createObjectStore("outbox", { keyPath: "operationId" });
      outbox.createIndex("byCreated", "clientOccurredAt");
      db.createObjectStore("syncMeta", { keyPath: "key" });
      const conflicts = db.createObjectStore("conflicts", { keyPath: "id" });
      conflicts.createIndex("byEntity", "entityId");
      db.createObjectStore("appSettings", { keyPath: "key" });
      db.createObjectStore("cachedQueries", { keyPath: "key" });
    },
  });
  return databasePromise;
}

export async function getOrCreateSyncMeta(): Promise<SyncMeta> {
  const db = await localDatabase();
  const transaction = db.transaction("syncMeta", "readwrite");
  const existing = await transaction.store.get("state");
  if (existing) {
    await transaction.done;
    return existing;
  }
  const created: SyncMeta = { key: "state", deviceId: uuidv7(), cursor: 0, lastSyncAt: null, schemaVersion: 1 };
  await transaction.store.put(created);
  await transaction.done;
  return created;
}

function applyLocalOperation(
  current: Record<string, unknown> | undefined,
  input: { kind: OutboxOperation["kind"]; entityId: string; payload: Record<string, unknown> },
  occurredAt: string,
): Record<string, unknown> {
  if (input.kind === "UPSERT" || input.kind === "APPEND") {
    return { ...(current ?? {}), ...input.payload, id: input.entityId, deletedAt: null };
  }
  if (input.kind === "RESTORE") return { ...(current ?? {}), archivedAt: null, deletedAt: null };
  if (input.kind === "ARCHIVE") return { ...(current ?? {}), archivedAt: occurredAt };
  return { ...(current ?? {}), deletedAt: occurredAt };
}

export async function commitOfflineMutation(input: {
  entityType: string;
  entityId: string;
  kind: OutboxOperation["kind"];
  baseVersion: number | null;
  payload: Record<string, unknown>;
}): Promise<OutboxOperation> {
  const db = await localDatabase();
  const meta = await getOrCreateSyncMeta();
  const occurredAt = new Date().toISOString();
  const transaction = db.transaction(["entities", "outbox"], "readwrite");
  const key = `${input.entityType}:${input.entityId}`;
  const current = await transaction.objectStore("entities").get(key);
  const allOutbox = await transaction.objectStore("outbox").getAll();
  const sameEntity = allOutbox
    .filter((candidate) => candidate.entityType === input.entityType && candidate.entityId === input.entityId)
    .sort((left, right) => left.clientOccurredAt.localeCompare(right.clientOccurredAt));
  const latest = sameEntity.at(-1);

  if (input.kind === "DELETE" && latest?.kind === "UPSERT" && latest.baseVersion === null) {
    for (const operation of sameEntity) await transaction.objectStore("outbox").delete(operation.operationId);
    await transaction.objectStore("entities").delete(key);
    await transaction.done;
    notifyOutboxChanged();
    return {
      operationId: uuidv7(), deviceId: meta.deviceId, entityType: input.entityType, entityId: input.entityId,
      kind: "DELETE", baseVersion: null, payload: {}, clientOccurredAt: occurredAt, schemaVersion: 1,
      attempts: 0, lastError: null,
    };
  }

  if (latest?.kind === "UPSERT" && input.kind === "UPSERT") {
    const merged: OutboxOperation = {
      ...latest,
      payload: { ...latest.payload, ...input.payload },
      clientOccurredAt: occurredAt,
      attempts: 0,
      lastError: null,
    };
    const nextData = applyLocalOperation(current?.data, input, occurredAt);
    await transaction.objectStore("outbox").put(merged);
    await transaction.objectStore("entities").put({
      key,
      entityType: input.entityType,
      entityId: input.entityId,
      version: current?.version ?? input.baseVersion ?? 0,
      data: nextData,
      pending: true,
      updatedAt: occurredAt,
    });
    await transaction.done;
    notifyOutboxChanged();
    return merged;
  }

  if (latest?.kind === "UPSERT" && input.kind === "DELETE" && latest.baseVersion !== null) {
    const collapsed: OutboxOperation = {
      ...latest,
      kind: "DELETE",
      payload: {},
      clientOccurredAt: occurredAt,
      attempts: 0,
      lastError: null,
    };
    await transaction.objectStore("outbox").put(collapsed);
    await transaction.objectStore("entities").put({
      key,
      entityType: input.entityType,
      entityId: input.entityId,
      version: current?.version ?? input.baseVersion ?? 0,
      data: applyLocalOperation(current?.data, input, occurredAt),
      pending: true,
      updatedAt: occurredAt,
    });
    await transaction.done;
    notifyOutboxChanged();
    return collapsed;
  }

  const operation: OutboxOperation = {
    operationId: uuidv7(),
    deviceId: meta.deviceId,
    entityType: input.entityType,
    entityId: input.entityId,
    kind: input.kind,
    baseVersion: input.baseVersion,
    payload: input.payload,
    clientOccurredAt: occurredAt,
    schemaVersion: 1,
    attempts: 0,
    lastError: null,
  };
  await transaction.objectStore("entities").put({
    key,
    entityType: input.entityType,
    entityId: input.entityId,
    version: current?.version ?? input.baseVersion ?? 0,
    data: applyLocalOperation(current?.data, input, occurredAt),
    pending: true,
    updatedAt: occurredAt,
  });
  await transaction.objectStore("outbox").put(operation);
  await transaction.done;
  notifyOutboxChanged();
  return operation;
}

export async function outboxCount(): Promise<number> {
  return (await localDatabase()).count("outbox");
}

export async function listOutbox(limit = 100): Promise<OutboxOperation[]> {
  const db = await localDatabase();
  const operations = await db.getAllFromIndex("outbox", "byCreated");
  const dependencyPriority: Record<string, number> = {
    "task-categories": 10,
    "financial-goals": 10,
    "daily-tasks": 20,
    "financial-history": 20,
    "daily-task-completions": 30,
  };
  return operations.sort((left, right) => {
    const dependency = (dependencyPriority[left.entityType] ?? 50) - (dependencyPriority[right.entityType] ?? 50);
    if (dependency !== 0) return dependency;
    const occurred = left.clientOccurredAt.localeCompare(right.clientOccurredAt);
    return occurred || left.operationId.localeCompare(right.operationId);
  }).slice(0, limit);
}

export async function discardResolvedOperation(operationId: string, conflictId?: string): Promise<void> {
  const db = await localDatabase();
  const transaction = db.transaction(["outbox", "conflicts"], "readwrite");
  await transaction.objectStore("outbox").delete(operationId);
  if (conflictId) await transaction.objectStore("conflicts").delete(conflictId);
  await transaction.done;
  notifyOutboxChanged();
}

export async function applyServerChanges(input: {
  acknowledged: Array<{ operationId: string; entityType: string; entityId: string; status: string; resultVersion?: number; conflictId?: string; server?: Record<string, unknown> }>;
  changes: Array<{ cursor: number; entityType: string; entityId: string; version: number; snapshot: Record<string, unknown> }>;
  nextCursor: number;
}): Promise<void> {
  const db = await localDatabase();
  const transaction = db.transaction(["entities", "outbox", "conflicts", "syncMeta"], "readwrite");
  for (const acknowledgment of input.acknowledged) {
    const operation = await transaction.objectStore("outbox").get(acknowledgment.operationId);
    if (!operation) continue;
    if (acknowledgment.status === "APPLIED") {
      await transaction.objectStore("outbox").delete(acknowledgment.operationId);
      const key = `${acknowledgment.entityType}:${acknowledgment.entityId}`;
      const entity = await transaction.objectStore("entities").get(key);
      if (entity) {
        const remaining = await transaction.objectStore("outbox").getAll();
        await transaction.objectStore("entities").put({
          ...entity,
          version: acknowledgment.resultVersion ?? entity.version,
          pending: remaining.some((candidate) => candidate.entityType === acknowledgment.entityType && candidate.entityId === acknowledgment.entityId),
          updatedAt: new Date().toISOString(),
        });
      }
    } else if (acknowledgment.status === "CONFLICT" && acknowledgment.conflictId && acknowledgment.server) {
      await transaction.objectStore("conflicts").put({
        id: acknowledgment.conflictId,
        operationId: acknowledgment.operationId,
        entityType: acknowledgment.entityType,
        entityId: acknowledgment.entityId,
        local: operation.payload,
        server: acknowledgment.server,
        createdAt: new Date().toISOString(),
      });
      operation.attempts += 1;
      operation.lastError = "SYNC_VERSION_CONFLICT";
      await transaction.objectStore("outbox").put(operation);
    }
  }
  for (const change of input.changes) {
    const key = `${change.entityType}:${change.entityId}`;
    const current = await transaction.objectStore("entities").get(key);
    const pending = (await transaction.objectStore("outbox").getAll()).some((candidate) => candidate.entityType === change.entityType && candidate.entityId === change.entityId);
    if (!pending && (!current || change.version >= current.version)) {
      await transaction.objectStore("entities").put({
        key,
        entityType: change.entityType,
        entityId: change.entityId,
        version: change.version,
        data: change.snapshot,
        pending: false,
        updatedAt: new Date().toISOString(),
      });
    }
  }
  const syncMetaStore = transaction.objectStore("syncMeta");
  const meta = (await syncMetaStore.get("state")) ?? {
    key: "state",
    deviceId: uuidv7(),
    cursor: 0,
    lastSyncAt: null,
    schemaVersion: 1,
  } satisfies SyncMeta;
  await syncMetaStore.put({ ...meta, cursor: input.nextCursor, lastSyncAt: new Date().toISOString() });
  await transaction.done;
  notifyOutboxChanged();
}

export async function cachedEntities(entityType: string): Promise<LocalEntity[]> {
  return (await localDatabase()).getAllFromIndex("entities", "byType", entityType);
}

export async function cacheServerEntities(entityType: string, entities: Array<Record<string, unknown>>): Promise<void> {
  const db = await localDatabase();
  const transaction = db.transaction("entities", "readwrite");
  for (const entity of entities) {
    const id = String(entity.id);
    const key = `${entityType}:${id}`;
    const current = await transaction.store.get(key);
    if (current?.pending) continue;
    await transaction.store.put({
      key,
      entityType,
      entityId: id,
      version: Number(entity.version ?? 0),
      data: entity,
      pending: false,
      updatedAt: String(entity.updatedAt ?? new Date().toISOString()),
    });
  }
  await transaction.done;
}

export async function cachedQuery<T>(key: string): Promise<T | undefined> {
  const record = await (await localDatabase()).get("cachedQueries", key);
  return record?.value as T | undefined;
}

export async function cacheQuery(key: string, value: unknown): Promise<void> {
  await (await localDatabase()).put("cachedQueries", { key, value, cachedAt: new Date().toISOString() });
}
