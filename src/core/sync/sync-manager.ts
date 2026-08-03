import { applyServerChanges, getOrCreateSyncMeta, listOutbox } from "@/core/sync/client-db";
import { acquireRequestSlot } from "@/core/network/request-gate";

let activeSync: Promise<void> | null = null;
let rerunRequested = false;
const SYNC_PASS_TIMEOUT_MS = 30_000;
const SYNC_BATCH_SIZE = 100;
const SYNC_PULL_LIMIT = 200;

export function createSyncPassSignal(parent?: AbortSignal): { signal: AbortSignal; dispose: () => void } {
  const controller = new AbortController();
  const abortFromParent = () => controller.abort(parent?.reason);
  if (parent?.aborted) abortFromParent();
  else parent?.addEventListener("abort", abortFromParent, { once: true });
  const timeout = setTimeout(() => {
    controller.abort(new DOMException("同步逾時，資料仍保留在此裝置。", "TimeoutError"));
  }, SYNC_PASS_TIMEOUT_MS);
  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timeout);
      parent?.removeEventListener("abort", abortFromParent);
    },
  };
}

async function runSyncPass(signal?: AbortSignal): Promise<void> {
  const pass = createSyncPassSignal(signal);
  let release: (() => void) | undefined;
  try {
    release = await acquireRequestSlot(pass.signal);
    const meta = await getOrCreateSyncMeta();
    const operations = await listOutbox(SYNC_BATCH_SIZE);
    let acknowledged: Array<{
      operationId: string; entityType: string; entityId: string; status: string; resultVersion?: number; conflictId?: string; server?: Record<string, unknown>;
    }> = [];
    if (operations.length) {
      const response = await fetch("/api/v1/sync/batch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ operations: operations.map((operation) => ({
          operationId: operation.operationId,
          deviceId: operation.deviceId,
          entityType: operation.entityType,
          entityId: operation.entityId,
          kind: operation.kind,
          baseVersion: operation.baseVersion,
          payload: operation.payload,
          clientOccurredAt: operation.clientOccurredAt,
          schemaVersion: operation.schemaVersion,
        })) }),
        signal: pass.signal,
      });
      if (!response.ok) throw new Error(`同步上傳失敗：${response.status}`);
      const body = await response.json() as { data: { results: typeof acknowledged } };
      acknowledged = body.data.results.map((result) => ({
        ...result,
        entityType: operations.find((operation) => operation.operationId === result.operationId)!.entityType,
        entityId: operations.find((operation) => operation.operationId === result.operationId)!.entityId,
      }));
    }
    const pull = await fetch(`/api/v1/sync/changes?deviceId=${encodeURIComponent(meta.deviceId)}&after=${meta.cursor}&limit=${SYNC_PULL_LIMIT}`, { signal: pass.signal });
    if (!pull.ok) throw new Error(`同步下載失敗：${pull.status}`);
    const pulled = await pull.json() as { data: { changes: Parameters<typeof applyServerChanges>[0]["changes"]; nextCursor: number } };
    await applyServerChanges({ acknowledged, changes: pulled.data.changes, nextCursor: pulled.data.nextCursor });
  } finally {
    release?.();
    pass.dispose();
  }
}

export async function syncNow(signal?: AbortSignal): Promise<void> {
  if (activeSync) {
    rerunRequested = true;
    return activeSync;
  }
  activeSync = (async () => {
    do {
      rerunRequested = false;
      await runSyncPass(signal);
    } while (rerunRequested && !signal?.aborted);
  })().finally(() => { activeSync = null; });
  return activeSync;
}

export function installSyncTriggers(
  onError: (error: unknown) => void,
  onSuccess?: () => void | Promise<void>,
): () => void {
  const trigger = () => {
    if (navigator.onLine) void syncNow().then(onSuccess).catch(onError);
  };
  const visibility = () => { if (document.visibilityState === "visible") trigger(); };
  window.addEventListener("online", trigger);
  document.addEventListener("visibilitychange", visibility);
  return () => {
    window.removeEventListener("online", trigger);
    document.removeEventListener("visibilitychange", visibility);
  };
}
