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

export interface OfflineMutationInput {
  entityType: string;
  entityId: string;
  kind: OutboxOperation["kind"];
  baseVersion: number | null;
  payload: Record<string, unknown>;
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

export async function commitOfflineMutations(inputs: OfflineMutationInput[]): Promise<OutboxOperation[]> {
  if (inputs.length === 0) return [];
  const db = await localDatabase();
  const meta = await getOrCreateSyncMeta();
  const transaction = db.transaction(["entities", "outbox"], "readwrite");
  const operations: OutboxOperation[] = [];
  for (const input of inputs) {
    const operation: OutboxOperation = {
      operationId: uuidv7(),
      deviceId: meta.deviceId,
      entityType: input.entityType,
      entityId: input.entityId,
      kind: input.kind,
      baseVersion: input.baseVersion,
      payload: input.payload,
      clientOccurredAt: new Date().toISOString(),
      schemaVersion: 1,
      attempts: 0,
      lastError: null,
    };
    const key = `${input.entityType}:${input.entityId}`;
    const current = await transaction.objectStore("entities").get(key);
    const nextData = input.kind === "UPSERT" || input.kind === "APPEND"
      ? { ...(current?.data ?? {}), ...input.payload, id: input.entityId }
      : input.kind === "RESTORE"
        ? { ...(current?.data ?? {}), archivedAt: null, deletedAt: null }
        : { ...(current?.data ?? {}), archivedAt: operation.clientOccurredAt };
    await transaction.objectStore("entities").put({
      key,
      entityType: input.entityType,
      entityId: input.entityId,
      version: current?.version ?? input.baseVersion ?? 0,
      data: nextData,
      pending: true,
      updatedAt: operation.clientOccurredAt,
    });
    await transaction.objectStore("outbox").put(operation);
    operations.push(operation);
  }
  await transaction.done;
  notifyOutboxChanged();
  return operations;
}

export async function commitOfflineMutation(input: OfflineMutationInput): Promise<OutboxOperation> {
  return (await commitOfflineMutations([input]))[0];
}

export async function outboxCount(): Promise<number> {
  return (await localDatabase()).count("outbox");
}

export async function listOutbox(limit = 100): Promise<OutboxOperation[]> {
  const db = await localDatabase();
  const operations = await db.getAllFromIndex("outbox", "byCreated");
  const dependencyPriority: Record<string, number> = {
    areas: 10, businesses: 20, "financial-accounts": 20, "finance-categories": 20,
    platforms: 20, tags: 20, "event-types": 20, metrics: 20, tasks: 30,
    "income-sources": 30, "social-accounts": 30, "content-assets": 30,
    "task-schedules": 40, events: 40, "social-metrics": 40, "asset-definitions": 40,
    "platform-posts": 50, "metric-observations": 50, transactions: 50, "asset-snapshots": 50,
    "social-snapshots": 60, conversions: 60, "entity-links": 70,
    "task-completions": 80, "task-deferrals": 80, "deadline-completions": 80,
  };
  return operations.sort((left, right) => {
    const occurred = left.clientOccurredAt.localeCompare(right.clientOccurredAt);
    if (occurred !== 0) return occurred;
    const dependency = (dependencyPriority[left.entityType] ?? 50) - (dependencyPriority[right.entityType] ?? 50);
    return dependency || left.operationId.localeCompare(right.operationId);
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
  const remaining = await transaction.objectStore("outbox").getAll();
  for (const change of input.changes) {
    const key = `${change.entityType}:${change.entityId}`;
    const pending = remaining.some((candidate) => candidate.entityType === change.entityType && candidate.entityId === change.entityId);
    await transaction.objectStore("entities").put({
      key,
      entityType: change.entityType,
      entityId: change.entityId,
      version: change.version,
      data: change.snapshot,
      pending,
      updatedAt: new Date().toISOString(),
    });
  }
  const meta = (await transaction.objectStore("syncMeta").get("state"))!;
  await transaction.objectStore("syncMeta").put({ ...meta, cursor: input.nextCursor, lastSyncAt: new Date().toISOString() });
  await transaction.done;
  notifyOutboxChanged();
}

export async function cachedEntities(entityType: string): Promise<LocalEntity[]> {
  return (await localDatabase()).getAllFromIndex("entities", "byType", entityType);
}

export async function cacheServerEntities(entityType: string, entities: Array<Record<string, unknown>>): Promise<void> {
  const db = await localDatabase();
  const transaction = db.transaction("entities", "readwrite");
  for (const data of entities) {
    if (typeof data.id !== "string") continue;
    const key = `${entityType}:${data.id}`;
    const current = await transaction.store.get(key);
    if (current?.pending) continue;
    await transaction.store.put({
      key,
      entityType,
      entityId: data.id,
      version: typeof data.version === "number" ? data.version : 1,
      data,
      pending: false,
      updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : new Date().toISOString(),
    });
  }
  await transaction.done;
}

export async function cacheQuery(key: string, value: unknown): Promise<void> {
  await (await localDatabase()).put("cachedQueries", { key, value, cachedAt: new Date().toISOString() });
}

export async function readCachedQuery<T>(key: string): Promise<{ value: T; cachedAt: string } | null> {
  const cached = await (await localDatabase()).get("cachedQueries", key);
  return cached ? { value: cached.value as T, cachedAt: cached.cachedAt } : null;
}
