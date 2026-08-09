import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiPostLongRunning } from "@/app/api/client";
import { acquireRequestSlot } from "@/core/network/request-gate";
import { applyServerChanges, cacheServerEntities, cachedEntities, commitOfflineMutation, getOrCreateSyncMeta, listOutbox, localDatabase } from "@/core/sync/client-db";
import { createSyncPassSignal, syncNow } from "@/core/sync/sync-manager";

describe("IndexedDB離線輸入", () => {
  beforeEach(async () => {
    const db = await localDatabase();
    await Promise.all([db.clear("entities"), db.clear("outbox"), db.clear("syncMeta"), db.clear("conflicts"), db.clear("cachedQueries")]);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("本機entity與outbox在同一transaction保存，重啟讀取仍存在", async () => {
    const meta = await getOrCreateSyncMeta();
    const entityId = "019fc1d9-d4e7-7c11-94e2-198d9fcd7201";
    const operation = await commitOfflineMutation({ entityType: "areas", entityId, kind: "UPSERT", baseVersion: null, payload: { id: entityId, name: "離線領域" } });
    expect(operation.deviceId).toBe(meta.deviceId);
    expect(await listOutbox()).toEqual([expect.objectContaining({ entityType: "areas", entityId, kind: "UPSERT" })]);
    expect(await cachedEntities("areas")).toEqual([expect.objectContaining({ entityId, pending: true, data: expect.objectContaining({ name: "離線領域" }) })]);
  });

  it("併發初始化只建立一個穩定裝置身分", async () => {
    const identities = await Promise.all(Array.from({ length: 8 }, () => getOrCreateSyncMeta()));
    expect(new Set(identities.map((identity) => identity.deviceId))).toHaveLength(1);
  });

  it("伺服器快取不覆蓋尚待同步的本機版本", async () => {
    const entityId = "019fc1d9-d4e7-7c11-94e2-198d9fcd7202";
    await commitOfflineMutation({ entityType: "tasks", entityId, kind: "UPSERT", baseVersion: 1, payload: { title: "本機修改" } });
    await cacheServerEntities("tasks", [{ id: entityId, title: "伺服器舊值", version: 2 }]);
    expect((await cachedEntities("tasks"))[0].data.title).toBe("本機修改");
  });

  it("伺服器確認最後一筆操作後清除待同步狀態並更新版本", async () => {
    const entityId = "019fc1d9-d4e7-7c11-94e2-198d9fcd7203";
    const operation = await commitOfflineMutation({ entityType: "areas", entityId, kind: "UPSERT", baseVersion: null, payload: { id: entityId, name: "完成同步" } });
    await applyServerChanges({
      acknowledged: [{ operationId: operation.operationId, entityType: "areas", entityId, status: "APPLIED", resultVersion: 1 }],
      changes: [{ cursor: 1, entityType: "areas", entityId, version: 1, snapshot: { id: entityId, name: "完成同步", version: 1 } }],
      nextCursor: 1,
    });
    expect(await listOutbox()).toEqual([]);
    expect(await cachedEntities("areas")).toEqual([expect.objectContaining({ entityId, version: 1, pending: false })]);
  });

  it("同一資料仍有後續操作時維持待同步狀態", async () => {
    const entityId = "019fc1d9-d4e7-7c11-94e2-198d9fcd7204";
    const first = await commitOfflineMutation({ entityType: "areas", entityId, kind: "UPSERT", baseVersion: 1, payload: { name: "第一次" } });
    await commitOfflineMutation({ entityType: "areas", entityId, kind: "UPSERT", baseVersion: 1, payload: { strategyText: "第二次" } });
    await applyServerChanges({
      acknowledged: [{ operationId: first.operationId, entityType: "areas", entityId, status: "APPLIED", resultVersion: 2 }],
      changes: [{ cursor: 2, entityType: "areas", entityId, version: 2, snapshot: { id: entityId, name: "第一次", version: 2 } }],
      nextCursor: 2,
    });
    expect(await listOutbox()).toHaveLength(1);
    expect((await cachedEntities("areas"))[0].pending).toBe(true);
  });

  it("同步進行中再次觸發時會補跑一輪並上傳稍後加入的操作", async () => {
    await getOrCreateSyncMeta();
    let releaseFirstPull!: () => void;
    let markFirstPullStarted!: () => void;
    const firstPullGate = new Promise<void>((resolve) => { releaseFirstPull = resolve; });
    const firstPullStarted = new Promise<void>((resolve) => { markFirstPullStarted = resolve; });
    let pullCount = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/sync/batch")) {
        const body = JSON.parse(String(init?.body)) as { operations: Array<{ operationId: string }> };
        return new Response(JSON.stringify({ data: { results: body.operations.map((operation) => ({
          operationId: operation.operationId,
          status: "APPLIED",
          resultVersion: 1,
        })) } }), { status: 200, headers: { "content-type": "application/json" } });
      }
      pullCount += 1;
      if (pullCount === 1) {
        markFirstPullStarted();
        await firstPullGate;
      }
      return new Response(JSON.stringify({ data: { changes: [], nextCursor: 0 } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const firstSync = syncNow();
    await firstPullStarted;
    const entityId = "019fc1d9-d4e7-7c11-94e2-198d9fcd7205";
    await commitOfflineMutation({ entityType: "areas", entityId, kind: "UPSERT", baseVersion: null, payload: { id: entityId, name: "競態後加入" } });
    const secondSync = syncNow();
    releaseFirstPull();
    await Promise.all([firstSync, secondSync]);

    expect(fetchMock.mock.calls.filter(([input]) => String(input).includes("/sync/batch"))).toHaveLength(1);
    expect(pullCount).toBe(2);
    expect(await listOutbox()).toEqual([]);
  });

  it("同步每一輪30秒後會以可讀逾時原因中止", () => {
    vi.useFakeTimers();
    const pass = createSyncPassSignal();
    expect(pass.signal.aborted).toBe(false);
    vi.advanceTimersByTime(30_000);
    expect(pass.signal.aborted).toBe(true);
    expect(pass.signal.reason).toMatchObject({ name: "TimeoutError", message: expect.stringContaining("同步逾時") });
    pass.dispose();
  });

  it("長時間provider同步不占用核心outbox的序列請求通道", async () => {
    const release = await acquireRequestSlot();
    const fetchMock = vi.fn(async () => Response.json({ data: { status: "SUCCEEDED" } }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      await expect(apiPostLongRunning("/api/v1/integrations/connection/sync", { operationId: "operation" }))
        .resolves.toEqual({ data: { status: "SUCCEEDED" } });
      expect(fetchMock).toHaveBeenCalledOnce();
    } finally {
      release();
    }
  });

  it("第一批核心輸入類型可離線保存修改與封存操作，恢復會清除本機封存旗標", async () => {
    const coreInputTypes = [
      "areas", "businesses", "tasks", "task-schedules", "financial-accounts", "finance-categories",
      "income-sources", "transactions", "fx-rates", "asset-definitions", "asset-snapshots", "expense-baselines",
      "brokerage-accounts", "metrics", "metric-observations", "event-types", "tags", "events", "platforms",
      "social-accounts", "content-assets", "platform-posts", "social-metrics", "social-snapshots", "conversions",
      "deadlines", "entity-links",
    ];
    for (const [index, entityType] of coreInputTypes.entries()) {
      const entityId = `019fc1d9-d4e7-7c11-94e2-${String(index + 100).padStart(12, "0")}`;
      await commitOfflineMutation({ entityType, entityId, kind: "UPSERT", baseVersion: null, payload: { id: entityId, label: `${entityType}-create` } });
      await commitOfflineMutation({ entityType, entityId, kind: "UPSERT", baseVersion: 1, payload: { label: `${entityType}-update` } });
      await commitOfflineMutation({ entityType, entityId, kind: "ARCHIVE", baseVersion: 1, payload: {} });
      await commitOfflineMutation({ entityType, entityId, kind: "RESTORE", baseVersion: 1, payload: {} });
      const cached = (await cachedEntities(entityType))[0];
      expect(cached).toMatchObject({ entityId, pending: true, data: { label: `${entityType}-update`, archivedAt: null, deletedAt: null } });
    }
    expect(await listOutbox(200)).toHaveLength(coreInputTypes.length * 4);
  });
});
