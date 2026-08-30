import { env } from "cloudflare:workers";
import { applyD1Migrations, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { v7 as uuidv7 } from "uuid";

async function jsonRequest(path: string, method = "GET", body?: unknown): Promise<Response> {
  return SELF.fetch(`https://life-manager.test${path}`, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function body<T = Record<string, unknown>>(response: Response): Promise<T> {
  const parsed = await response.json() as T;
  if (!response.ok) throw new Error(`${response.status}: ${JSON.stringify(parsed)}`);
  return parsed;
}

async function createResource(resource: string, data: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await jsonRequest(`/api/v1/${resource}`, "POST", { operationId: uuidv7(), data });
  expect(response.status).toBe(201);
  return (await body<{ data: Record<string, unknown> }>(response)).data;
}

describe("精簡版人生管理器 D1 與 API", () => {
  beforeAll(async () => {
    await applyD1Migrations(env.LIFE_DB, env.TEST_MIGRATIONS);
  });

  it("完整 migration 到 schema 12，只建立結構性設定資料列", async () => {
    const version = await env.LIFE_DB.prepare(
      "SELECT value FROM schema_metadata WHERE key = 'application_schema_version'",
    ).first<{ value: string }>();
    expect(version?.value).toBe("12");

    for (const table of ["task_categories_v2", "daily_tasks_v2", "daily_task_completions_v2", "financial_history_v2"]) {
      const count = await env.LIFE_DB.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first<{ count: number }>();
      expect(Number(count?.count)).toBe(0);
    }
    const goals = await env.LIFE_DB.prepare(
      "SELECT goal_kind, amount_minor FROM financial_goals_v2 ORDER BY goal_kind",
    ).all<{ goal_kind: string; amount_minor: number | null }>();
    expect(goals.results).toEqual([
      { goal_kind: "MONTHLY_INCOME", amount_minor: null },
      { goal_kind: "SAVINGS", amount_minor: null },
    ]);
    const profile = await env.LIFE_DB.prepare(
      "SELECT id, birth_date FROM user_profile_v2",
    ).first<{ id: string; birth_date: string | null }>();
    expect(profile).toEqual({ id: "00000000-0000-7000-8000-000000000003", birth_date: null });

    const columns = await env.LIFE_DB.prepare("PRAGMA table_info(daily_tasks_v2)").all<{ name: string }>();
    expect(columns.results.map((column) => column.name)).toEqual(expect.arrayContaining(["achievement_name", "achievement_unit"]));
  });

  it("每日任務可設定成果與單位，完成紀錄可建立與撤銷", async () => {
    const categoryId = uuidv7();
    const taskId = uuidv7();
    const completionId = uuidv7();

    await createResource("task-categories", { id: categoryId, name: "訓練", description: "每天累積訓練" });
    const task = await createResource("daily-tasks", {
      id: taskId,
      categoryId,
      name: "投球",
      description: "完成今天的投球",
      achievementName: "投球訓練",
      achievementUnit: "次",
    });
    expect(task).toEqual(expect.objectContaining({ achievementName: "投球訓練", achievementUnit: "次" }));

    const completion = await createResource("daily-task-completions", {
      id: completionId,
      taskId,
      completedLocalDate: "2026-08-30",
      completedAt: "2026-08-30T02:00:00.000Z",
    });
    expect(completion).toEqual(expect.objectContaining({ taskId, completedLocalDate: "2026-08-30", version: 1 }));

    const duplicate = await jsonRequest("/api/v1/daily-task-completions", "POST", {
      operationId: uuidv7(),
      data: { id: uuidv7(), taskId, completedLocalDate: "2026-08-30", completedAt: "2026-08-30T03:00:00.000Z" },
    });
    expect(duplicate.ok).toBe(false);

    const future = await jsonRequest("/api/v1/daily-task-completions", "POST", {
      operationId: uuidv7(),
      data: { id: uuidv7(), taskId, completedLocalDate: "2099-01-01", completedAt: "2099-01-01T03:00:00.000Z" },
    });
    expect(future.status).toBe(400);

    const remove = await jsonRequest(`/api/v1/daily-task-completions/${completionId}`, "DELETE", {
      operationId: uuidv7(), baseVersion: 1, data: {},
    });
    expect(remove.status).toBe(200);
    const list = await body<{ data: Array<Record<string, unknown>> }>(await jsonRequest("/api/v1/daily-task-completions"));
    expect(list.data).toHaveLength(0);
    const tombstone = await env.LIFE_DB.prepare(
      "SELECT deleted_at, version FROM daily_task_completions_v2 WHERE id = ?",
    ).bind(completionId).first<{ deleted_at: string | null; version: number }>();
    expect(tombstone?.deleted_at).toBeTruthy();
    expect(tombstone?.version).toBe(2);
  });

  it("個人設定可保存出生年月日", async () => {
    const profile = await body<{ data: Array<Record<string, unknown>> }>(await jsonRequest("/api/v1/user-profile"));
    expect(profile.data).toHaveLength(1);
    const current = profile.data[0];
    const update = await jsonRequest(`/api/v1/user-profile/${current.id}`, "PATCH", {
      operationId: uuidv7(),
      baseVersion: current.version,
      data: { birthDate: "2000-01-01" },
    });
    expect(update.status).toBe(200);
    expect((await body<{ data: Record<string, unknown> }>(update)).data).toEqual(expect.objectContaining({ birthDate: "2000-01-01" }));
  });

  it("財務目前值只有歷史來源，目標與歷史均可修改，歷史可刪除", async () => {
    const incomeGoal = await env.LIFE_DB.prepare(
      "SELECT id, version FROM financial_goals_v2 WHERE goal_kind = 'MONTHLY_INCOME'",
    ).first<{ id: string; version: number }>();
    expect(incomeGoal).not.toBeNull();

    const goalUpdate = await jsonRequest(`/api/v1/financial-goals/${incomeGoal!.id}`, "PATCH", {
      operationId: uuidv7(),
      baseVersion: incomeGoal!.version,
      data: { amountMinor: 50000 },
    });
    expect(goalUpdate.status).toBe(200);

    const firstId = uuidv7();
    const secondId = uuidv7();
    await createResource("financial-history", {
      id: firstId, metricKind: "MONTHLY_INCOME", effectiveLocalDate: "2026-08-01",
      amountMinor: 30000, currencyCode: "TWD", minorUnitScale: 0,
    });
    await createResource("financial-history", {
      id: secondId, metricKind: "MONTHLY_INCOME", effectiveLocalDate: "2026-08-20",
      amountMinor: 35000, currencyCode: "TWD", minorUnitScale: 0,
    });

    const update = await jsonRequest(`/api/v1/financial-history/${firstId}`, "PATCH", {
      operationId: uuidv7(), baseVersion: 1, data: { amountMinor: 32000 },
    });
    expect(update.status).toBe(200);

    const remove = await jsonRequest(`/api/v1/financial-history/${secondId}`, "DELETE", {
      operationId: uuidv7(), baseVersion: 1, data: {},
    });
    expect(remove.status).toBe(200);

    const remaining = await body<{ data: Array<Record<string, unknown>> }>(
      await jsonRequest("/api/v1/financial-history?metricKind=MONTHLY_INCOME"),
    );
    expect(remaining.data).toEqual([
      expect.objectContaining({ id: firstId, amountMinor: 32000, version: 2 }),
    ]);
  });

  it("新版資源可經通用離線同步寫入並由另一裝置拉取", async () => {
    const deviceA = uuidv7();
    const deviceB = uuidv7();
    for (const [id, name] of [[deviceA, "裝置 A"], [deviceB, "裝置 B"]] as const) {
      const register = await jsonRequest("/api/v1/sync/devices", "POST", {
        operationId: uuidv7(),
        data: { id, displayName: name, userAgentSummary: "vitest" },
      });
      expect(register.status).toBe(200);
    }

    const categoryId = uuidv7();
    const taskId = uuidv7();
    const batch = await body<{ data: { results: Array<Record<string, unknown>> } }>(
      await jsonRequest("/api/v1/sync/batch", "POST", {
        operations: [
          {
            operationId: uuidv7(), deviceId: deviceA, entityType: "task-categories", entityId: categoryId,
            kind: "UPSERT", baseVersion: null, payload: { id: categoryId, name: "工作", description: "每天工作" },
            clientOccurredAt: "2026-08-30T01:00:00.000Z", schemaVersion: 1,
          },
          {
            operationId: uuidv7(), deviceId: deviceA, entityType: "daily-tasks", entityId: taskId,
            kind: "UPSERT", baseVersion: null, payload: {
              id: taskId, categoryId, name: "寫作", description: "完成今日寫作", achievementName: "文章", achievementUnit: "篇",
            },
            clientOccurredAt: "2026-08-30T01:00:01.000Z", schemaVersion: 1,
          },
        ],
      }),
    );
    expect(batch.data.results.map((item) => item.status)).toEqual(["APPLIED", "APPLIED"]);

    const pulled = await body<{ data: { changes: Array<{ entityType: string; entityId: string }>; nextCursor: number } }>(
      await jsonRequest(`/api/v1/sync/changes?deviceId=${deviceB}&after=0`),
    );
    expect(pulled.data.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ entityType: "task-categories", entityId: categoryId }),
      expect.objectContaining({ entityType: "daily-tasks", entityId: taskId }),
    ]));
    expect(pulled.data.nextCursor).toBeGreaterThan(0);
  });

  it("舊產品 API 已退出新版 Worker", async () => {
    for (const path of [
      "/api/v1/areas",
      "/api/v1/finance/analysis",
      "/api/v1/social/comparison",
      "/api/v1/integrations",
      "/api/v1/deadline-completions",
    ]) {
      const response = await jsonRequest(path);
      expect(response.status).toBe(404);
    }
  });
});
