import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  applyServerChanges,
  cacheServerEntities,
  cachedEntities,
  commitOfflineMutation,
  getOrCreateSyncMeta,
  listOutbox,
  localDatabase,
} from "@/core/sync/client-db";
import { createSyncPassSignal, syncNow } from "@/core/sync/sync-manager";

describe("新版 IndexedDB 離線同步", () => {
  beforeEach(async () => {
    const db = await localDatabase();
    await Promise.all([
      db.clear("entities"),
      db.clear("outbox"),
      db.clear("syncMeta"),
      db.clear("conflicts"),
      db.clear("cachedQueries"),
    ]);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("五種新版資料可以離線保存且依相依順序送出", async () => {
    const ids = {
      category: "019fc1d9-d4e7-7c11-94e2-198d9fcd7201",
      task: "019fc1d9-d4e7-7c11-94e2-198d9fcd7202",
      completion: "019fc1d9-d4e7-7c11-94e2-198d9fcd7203",
      goal: "019fc1d9-d4e7-7c11-94e2-198d9fcd7204",
      history: "019fc1d9-d4e7-7c11-94e2-198d9fcd7205",
    };
    await commitOfflineMutation({ entityType: "task-categories", entityId: ids.category, kind: "UPSERT", baseVersion: null, payload: { id: ids.category, name: "訓練", description: "" } });
    await commitOfflineMutation({ entityType: "daily-tasks", entityId: ids.task, kind: "UPSERT", baseVersion: null, payload: { id: ids.task, categoryId: ids.category, name: "投球", description: "" } });
    await commitOfflineMutation({ entityType: "daily-task-completions", entityId: ids.completion, kind: "UPSERT", baseVersion: null, payload: { id: ids.completion, taskId: ids.task, completedLocalDate: "2026-08-30", completedAt: "2026-08-30T00:00:00.000Z" } });
    await commitOfflineMutation({ entityType: "financial-goals", entityId: ids.goal, kind: "UPSERT", baseVersion: null, payload: { id: ids.goal, goalKind: "NET_WORTH", amountMinor: 100000, currencyCode: "TWD", minorUnitScale: 0 } });
    await commitOfflineMutation({ entityType: "financial-history", entityId: ids.history, kind: "UPSERT", baseVersion: null, payload: { id: ids.history, metricKind: "NET_WORTH", effectiveLocalDate: "2026-08-30", amountMinor: -20000, currencyCode: "TWD", minorUnitScale: 0 } });

    const outbox = await listOutbox();
    expect(outbox.map((item) => item.entityType)).toEqual([
      "task-categories",
      "financial-goals",
      "daily-tasks",
      "financial-history",
      "daily-task-completions",
    ]);
    expect((await cachedEntities("daily-tasks"))[0]).toMatchObject({ pending: true, data: { name: "投球" } });
  });

  it("同一資料連續離線修改會合併成一筆 UPSERT", async () => {
    const id = "019fc1d9-d4e7-7c11-94e2-198d9fcd7210";
    const first = await commitOfflineMutation({ entityType: "task-categories", entityId: id, kind: "UPSERT", baseVersion: 3, payload: { name: "原名稱" } });
    const second = await commitOfflineMutation({ entityType: "task-categories", entityId: id, kind: "UPSERT", baseVersion: 3, payload: { description: "新敘述" } });
    expect(second.operationId).toBe(first.operationId);
    expect(await listOutbox()).toEqual([
      expect.objectContaining({ baseVersion: 3, payload: { name: "原名稱", description: "新敘述" } }),
    ]);
  });

  it("尚未同步的新資料離線刪除會直接取消建立，不留下無效 outbox", async () => {
    const id = "019fc1d9-d4e7-7c11-94e2-198d9fcd7211";
    await commitOfflineMutation({ entityType: "financial-history", entityId: id, kind: "UPSERT", baseVersion: null, payload: { id, metricKind: "NET_WORTH", effectiveLocalDate: "2026-08-30", amountMinor: 1 } });
    await commitOfflineMutation({ entityType: "financial-history", entityId: id, kind: "DELETE", baseVersion: 0, payload: {} });
    expect(await listOutbox()).toEqual([]);
    expect(await cachedEntities("financial-history")).toEqual([]);
  });

  it("已存在資料離線刪除使用 deletedAt，不會誤標成 archivedAt", async () => {
    const id = "019fc1d9-d4e7-7c11-94e2-198d9fcd7212";
    await cacheServerEntities("financial-history", [{ id, metricKind: "NET_WORTH", amountMinor: 10, version: 4, deletedAt: null }]);
    await commitOfflineMutation({ entityType: "financial-history", entityId: id, kind: "DELETE", baseVersion: 4, payload: {} });
    const cached = (await cachedEntities("financial-history"))[0];
    expect(cached.data.deletedAt).toEqual(expect.any(String));
    expect(cached.data.archivedAt).toBeUndefined();
    expect((await listOutbox())[0]).toMatchObject({ kind: "DELETE", baseVersion: 4 });
  });

  it("伺服器快取不覆蓋尚待同步的本機版本", async () => {
    const id = "019fc1d9-d4e7-7c11-94e2-198d9fcd7213";
    await commitOfflineMutation({ entityType: "daily-tasks", entityId: id, kind: "UPSERT", baseVersion: 1, payload: { name: "本機修改" } });
    await cacheServerEntities("daily-tasks", [{ id, name: "伺服器舊值", version: 2 }]);
    expect((await cachedEntities("daily-tasks"))[0].data.name).toBe("本機修改");
  });

  it("伺服器確認操作後清除待同步並更新版本", async () => {
    const id = "019fc1d9-d4e7-7c11-94e2-198d9fcd7214";
    const operation = await commitOfflineMutation({ entityType: "task-categories", entityId: id, kind: "UPSERT", baseVersion: null, payload: { id, name: "同步完成", description: "" } });
    await applyServerChanges({
      acknowledged: [{ operationId: operation.operationId, entityType: "task-categories", entityId: id, status: "APPLIED", resultVersion: 1 }],
      changes: [{ cursor: 1, entityType: "task-categories", entityId: id, version: 1, snapshot: { id, name: "同步完成", version: 1 } }],
      nextCursor: 1,
    });
    expect(await listOutbox()).toEqual([]);
    expect(await cachedEntities("task-categories")).toEqual([expect.objectContaining({ entityId: id, version: 1, pending: false })]);
  });

  it("舊版尚未送出的 SAVINGS 操作會在送出時升級成 NET_WORTH", async () => {
    await getOrCreateSyncMeta();
    const id = "019fc1d9-d4e7-7c11-94e2-198d9fcd7216";
    await commitOfflineMutation({
      entityType: "financial-history",
      entityId: id,
      kind: "UPSERT",
      baseVersion: null,
      payload: { id, metricKind: "SAVINGS", effectiveLocalDate: "2026-08-30", amountMinor: 12345 },
    });
    let uploadedMetricKind: unknown;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/sync/batch")) {
        const requestBody = JSON.parse(String(init?.body)) as { operations: Array<{ operationId: string; entityType: string; entityId: string; payload: Record<string, unknown> }> };
        uploadedMetricKind = requestBody.operations[0]?.payload.metricKind;
        return Response.json({ data: { results: requestBody.operations.map((operation) => ({ ...operation, status: "APPLIED", resultVersion: 1 })) } });
      }
      return Response.json({ data: { changes: [], nextCursor: 0 } });
    });
    vi.stubGlobal("fetch", fetchMock);
    await syncNow();
    expect(uploadedMetricKind).toBe("NET_WORTH");
  });

  it("同步進行中再次觸發會補跑一輪並上傳稍後加入的操作", async () => {
    await getOrCreateSyncMeta();
    let releaseFirstPull!: () => void;
    let markFirstPullStarted!: () => void;
    const firstPullGate = new Promise<void>((resolve) => { releaseFirstPull = resolve; });
    const firstPullStarted = new Promise<void>((resolve) => { markFirstPullStarted = resolve; });
    let pullCount = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/sync/devices")) return Response.json({ data: {}, meta: {} });
      if (url.includes("/sync/batch")) {
        const requestBody = JSON.parse(String(init?.body)) as { operations: Array<{ operationId: string; entityType: string; entityId: string }> };
        return Response.json({ data: { results: requestBody.operations.map((operation) => ({ ...operation, status: "APPLIED", resultVersion: 1 })) } });
      }
      pullCount += 1;
      if (pullCount === 1) {
        markFirstPullStarted();
        await firstPullGate;
      }
      return Response.json({ data: { changes: [], nextCursor: 0 } });
    });
    vi.stubGlobal("fetch", fetchMock);

    const firstSync = syncNow();
    await firstPullStarted;
    const id = "019fc1d9-d4e7-7c11-94e2-198d9fcd7215";
    await commitOfflineMutation({ entityType: "task-categories", entityId: id, kind: "UPSERT", baseVersion: null, payload: { id, name: "稍後加入", description: "" } });
    const secondSync = syncNow();
    releaseFirstPull();
    await Promise.all([firstSync, secondSync]);

    expect(fetchMock.mock.calls.filter(([input]) => String(input).includes("/sync/batch"))).toHaveLength(1);
    expect(pullCount).toBe(2);
    expect(await listOutbox()).toEqual([]);
  });

  it("同步每一輪 30 秒後以可讀逾時原因中止", () => {
    vi.useFakeTimers();
    const pass = createSyncPassSignal();
    expect(pass.signal.aborted).toBe(false);
    vi.advanceTimersByTime(30_000);
    expect(pass.signal.aborted).toBe(true);
    expect(pass.signal.reason).toMatchObject({ name: "TimeoutError", message: expect.stringContaining("同步逾時") });
    pass.dispose();
  });
});
