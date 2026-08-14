import { env } from "cloudflare:workers";
import { applyD1Migrations, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { v7 as uuidv7 } from "uuid";

import { asyncJobStatusSchema, isAsyncJobTransitionAllowed } from "@/modules/async-jobs/schema";

async function jsonRequest(path: string, method = "GET", body?: unknown, actor = "local-owner"): Promise<Response> {
  return SELF.fetch(`https://life-manager.test${path}`, {
    method,
    headers: {
      "x-local-access-user": actor,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function bodyOf(response: Response): Promise<Record<string, unknown>> {
  return response.json() as Promise<Record<string, unknown>>;
}

function bodyData(body: Record<string, unknown>): Record<string, unknown> {
  return body.data as Record<string, unknown>;
}

function bodyArray(body: Record<string, unknown>): Array<Record<string, unknown>> {
  return body.data as Array<Record<string, unknown>>;
}

function bodyMeta(body: Record<string, unknown>): Record<string, unknown> {
  return body.meta as Record<string, unknown>;
}

function bodyError(body: Record<string, unknown>): Record<string, unknown> {
  return body.error as Record<string, unknown>;
}

function taskData(id: string, title = "原子任務固定答案") {
  return {
    id,
    areaId: null,
    businessId: null,
    title,
    description: "",
    whyText: "固定答案測試",
    completionCriteria: "完成一項",
    lowClarityGuide: "先做一小步",
    metricRole: "ACTION",
    estimatedMinutes: 10,
    priority: 70,
    pinnedNextAction: true,
  };
}

function scheduleData(id: string, taskDefinitionId: string, startsOnLocalDate = "2026-08-14") {
  return {
    id,
    taskDefinitionId,
    recurrenceKind: "ONCE",
    startsOnLocalDate,
    dueLocalTime: null,
    timezone: "Asia/Taipei",
    weekdays: null,
    monthDay: null,
    rruleText: null,
    intervalValue: 1,
    endsOnLocalDate: null,
  };
}

function atomicBody(operationId: string, task: Record<string, unknown>, schedule: Record<string, unknown> | null) {
  return { operationId, data: { task, schedule } };
}

describe("RETROFIT-W1A task atomic command", () => {
  beforeAll(async () => { await applyD1Migrations(env.LIFE_DB, env.TEST_MIGRATIONS); });

  it("migration 0013保留既有schema並增加actor-bound idempotency欄位", async () => {
    const version = await env.LIFE_DB.prepare("SELECT value FROM schema_metadata WHERE key = 'application_schema_version'").first<{ value: string }>();
    const columns = await env.LIFE_DB.prepare("PRAGMA table_info(api_idempotency)").all<{ name: string }>();
    expect(version?.value).toBe("13");
    expect(columns.results.map((column) => column.name)).toContain("actor_id");
    expect(Number((await env.LIFE_DB.prepare("SELECT COUNT(*) AS count FROM social_platforms").first<{ count: number }>())?.count)).toBe(2);
  });

  it("valid task only exactly creates one task", async () => {
    const taskId = uuidv7();
    const response = await jsonRequest("/api/v1/tasks/with-initial-schedule", "POST", atomicBody(uuidv7(), taskData(taskId), null));
    const body = await bodyOf(response);
    expect(response.status).toBe(201);
    expect(bodyData(body).task).toEqual(expect.objectContaining({ id: taskId, version: 1 }));
    expect(bodyData(body).schedule).toBeNull();
    expect(Number((await env.LIFE_DB.prepare("SELECT COUNT(*) AS count FROM task_definitions WHERE id = ?").bind(taskId).first<{ count: number }>())?.count)).toBe(1);
    expect(Number((await env.LIFE_DB.prepare("SELECT COUNT(*) AS count FROM task_schedules WHERE task_definition_id = ?").bind(taskId).first<{ count: number }>())?.count)).toBe(0);
  });

  it("valid task plus schedule exactly creates linked rows", async () => {
    const taskId = uuidv7();
    const scheduleId = uuidv7();
    const response = await jsonRequest(
      "/api/v1/tasks/with-initial-schedule",
      "POST",
      atomicBody(uuidv7(), taskData(taskId, "原子任務與排程"), scheduleData(scheduleId, taskId)),
    );
    const body = await bodyOf(response);
    expect(response.status).toBe(201);
    expect(bodyData(body).schedule).toEqual(expect.objectContaining({ id: scheduleId, taskDefinitionId: taskId, version: 1 }));
    expect(await env.LIFE_DB.prepare("SELECT task_definition_id FROM task_schedules WHERE id = ?").bind(scheduleId).first()).toEqual({ task_definition_id: taskId });
  });

  it("invalid schedule validation leaves zero task and zero schedule", async () => {
    const taskId = uuidv7();
    const scheduleId = uuidv7();
    const response = await jsonRequest(
      "/api/v1/tasks/with-initial-schedule",
      "POST",
      atomicBody(uuidv7(), taskData(taskId), scheduleData(scheduleId, uuidv7())),
    );
    expect(response.status).toBe(400);
    expect(bodyError(await bodyOf(response)).code).toBe("VALIDATION_FAILED");
    expect(Number((await env.LIFE_DB.prepare("SELECT COUNT(*) AS count FROM task_definitions WHERE id = ?").bind(taskId).first<{ count: number }>())?.count)).toBe(0);
    expect(Number((await env.LIFE_DB.prepare("SELECT COUNT(*) AS count FROM task_schedules WHERE id = ?").bind(scheduleId).first<{ count: number }>())?.count)).toBe(0);
  });

  it("D1 batch第二筆寫入失敗會回滾task與schedule", async () => {
    const taskId = uuidv7();
    const scheduleId = uuidv7();
    const triggerName = `retrofit_fail_${taskId.replaceAll("-", "")}`;
    await env.LIFE_DB.prepare(
      `CREATE TRIGGER ${triggerName} BEFORE INSERT ON task_schedules
       WHEN NEW.id = '${scheduleId}' BEGIN SELECT RAISE(ABORT, 'injected second write failure'); END`,
    ).run();
    try {
      const response = await jsonRequest(
        "/api/v1/tasks/with-initial-schedule",
        "POST",
        atomicBody(uuidv7(), taskData(taskId), scheduleData(scheduleId, taskId)),
      );
      expect(response.status).toBe(500);
      expect(Number((await env.LIFE_DB.prepare("SELECT COUNT(*) AS count FROM task_definitions WHERE id = ?").bind(taskId).first<{ count: number }>())?.count)).toBe(0);
      expect(Number((await env.LIFE_DB.prepare("SELECT COUNT(*) AS count FROM task_schedules WHERE id = ?").bind(scheduleId).first<{ count: number }>())?.count)).toBe(0);
    } finally {
      await env.LIFE_DB.prepare(`DROP TRIGGER ${triggerName}`).run();
    }
  });

  it("same key same payload重播同一結果且row count不變", async () => {
    const taskId = uuidv7();
    const scheduleId = uuidv7();
    const operationId = uuidv7();
    const body = atomicBody(operationId, taskData(taskId, "同key重播"), scheduleData(scheduleId, taskId));
    const first = await jsonRequest("/api/v1/tasks/with-initial-schedule", "POST", body);
    const firstBody = await bodyOf(first);
    const countsBefore = await env.LIFE_DB.prepare(
      "SELECT (SELECT COUNT(*) FROM task_definitions WHERE id = ?) AS tasks, (SELECT COUNT(*) FROM task_schedules WHERE id = ?) AS schedules",
    ).bind(taskId, scheduleId).first<{ tasks: number; schedules: number }>();
    const second = await jsonRequest("/api/v1/tasks/with-initial-schedule", "POST", body);
    const secondBody = await bodyOf(second);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect((bodyData(secondBody).task as Record<string, unknown>).id).toBe((bodyData(firstBody).task as Record<string, unknown>).id);
    expect(bodyMeta(secondBody).idempotentReplay).toBe(true);
    expect(await env.LIFE_DB.prepare(
      "SELECT (SELECT COUNT(*) FROM task_definitions WHERE id = ?) AS tasks, (SELECT COUNT(*) FROM task_schedules WHERE id = ?) AS schedules",
    ).bind(taskId, scheduleId).first()).toEqual(countsBefore);
  });

  it("same key different payload與cross-actor replay皆conflict且不洩漏結果", async () => {
    const taskId = uuidv7();
    const operationId = uuidv7();
    const original = atomicBody(operationId, taskData(taskId, "原始內容"), null);
    expect((await jsonRequest("/api/v1/tasks/with-initial-schedule", "POST", original, "actor-a")).status).toBe(201);
    const different = await jsonRequest("/api/v1/tasks/with-initial-schedule", "POST", atomicBody(operationId, taskData(taskId, "不同內容"), null), "actor-a");
    const crossActor = await jsonRequest("/api/v1/tasks/with-initial-schedule", "POST", original, "actor-b");
    const differentBody = await bodyOf(different);
    const crossActorBody = await bodyOf(crossActor);
    expect(different.status).toBe(409);
    expect(crossActor.status).toBe(409);
    expect(bodyError(differentBody).code).toBe("IDEMPOTENCY_CONFLICT");
    expect(bodyError(crossActorBody).code).toBe("IDEMPOTENCY_CONFLICT");
    expect(crossActorBody.data).toBeUndefined();
    expect(Number((await env.LIFE_DB.prepare("SELECT COUNT(*) AS count FROM task_definitions WHERE id = ?").bind(taskId).first<{ count: number }>())?.count)).toBe(1);
  });
});

describe("RETROFIT-W1A async public contract", () => {
  beforeAll(async () => { await applyD1Migrations(env.LIFE_DB, env.TEST_MIGRATIONS); });

  it("共用status transition表接受合法轉移並拒絕非法轉移", () => {
    expect(asyncJobStatusSchema.safeParse("CANCELLED").success).toBe(true);
    expect(asyncJobStatusSchema.safeParse("READY").success).toBe(false);
    expect(isAsyncJobTransitionAllowed("QUEUED", "RUNNING")).toBe(true);
    expect(isAsyncJobTransitionAllowed("RUNNING", "SUCCEEDED")).toBe(true);
    expect(isAsyncJobTransitionAllowed("SUCCEEDED", "RUNNING")).toBe(false);
    expect(isAsyncJobTransitionAllowed("DEAD_LETTER", "RUNNING")).toBe(false);
  });

  it("provider sync list/get以穩定cursor、真實run counters、history與reload state回應", async () => {
    const connectionId = uuidv7();
    const jobId = uuidv7();
    const runId = uuidv7();
    const now = "2026-08-14T10:00:00.000Z";
    await env.LIFE_DB.batch([
      env.LIFE_DB.prepare(
        `INSERT INTO provider_connections
         (id, provider_key, external_account_id, display_name, status, granted_scopes_json,
          provider_definition_version, created_at, updated_at, version)
         VALUES (?, 'youtube', ?, 'async contract', 'CONNECTED', '[]', 'test-v1', ?, ?, 1)`,
      ).bind(connectionId, `async-${connectionId}`, now, now),
      env.LIFE_DB.prepare(
        `INSERT INTO provider_sync_jobs
         (id, provider_key, connection_id, next_run_at, status, attempt, max_attempts, backoff_seconds,
          dedupe_key, last_error_code, created_at, updated_at)
         VALUES (?, 'youtube', ?, ?, 'RETRY', 2, 5, 60, ?, 'RATE_LIMIT', ?, ?)`,
      ).bind(jobId, connectionId, now, `async-${jobId}`, now, now),
      env.LIFE_DB.prepare(
        `INSERT INTO provider_sync_runs
         (id, provider_key, connection_id, trigger_kind, status, started_at, completed_at, fetched_count,
          created_count, updated_count, ignored_count, error_count, error_code, error_message_redacted, request_id, created_at)
         VALUES (?, 'youtube', ?, 'SCHEDULED', 'PARTIAL', ?, ?, 8, 3, 2, 1, 1, 'RATE_LIMIT', '來源限制，部分資料未取得。', ?, ?)`,
      ).bind(runId, connectionId, now, now, `async-run-${runId}`, now),
    ]);
    const list = await jsonRequest("/api/v1/async-jobs?kind=PROVIDER_SYNC&limit=1");
    const listBody = await bodyOf(list);
    expect(list.status).toBe(200);
    expect(bodyMeta(listBody).contractVersion).toBe("async-job.v1");
    const job = bodyArray(listBody).find((item) => item.id === jobId) as Record<string, unknown>;
    expect(job).toEqual(expect.objectContaining({ status: "RETRY_WAIT", phase: "RETRY_WAIT", currentRunId: runId, progress: null, cancelSupported: false }));
    expect(job.sourceCounters).toEqual(expect.objectContaining({ fetched: 8, created: 3, updated: 2, ignored: 1, errors: 1 }));
    expect(job.history).toHaveLength(1);
    expect(job).not.toHaveProperty("percentage");
    expect(bodyMeta(listBody).nextCursor).toBeNull();

    await env.LIFE_DB.prepare("UPDATE provider_sync_jobs SET status = 'DEAD_LETTER', updated_at = ? WHERE id = ?").bind("2026-08-14T10:01:00.000Z", jobId).run();
    const reloaded = await jsonRequest(`/api/v1/async-jobs/${jobId}?kind=PROVIDER_SYNC`);
    const reloadedBody = await bodyOf(reloaded);
    expect(reloaded.status).toBe(200);
    expect(bodyData(reloadedBody).status).toBe("DEAD_LETTER");
    expect(bodyData(reloadedBody).retryable).toBe(false);
    expect((bodyData(reloadedBody).capabilities as Record<string, unknown>).reloadRecovery).toBe(true);

    await env.LIFE_DB.batch([
      env.LIFE_DB.prepare("DELETE FROM provider_sync_runs WHERE id = ?").bind(runId),
      env.LIFE_DB.prepare("DELETE FROM provider_sync_jobs WHERE id = ?").bind(jobId),
      env.LIFE_DB.prepare("DELETE FROM provider_connections WHERE id = ?").bind(connectionId),
    ]);
  });

  it("provider無total不生成百分比，import batch提供可驗證row partition counters", async () => {
    const connectionId = uuidv7();
    const jobA = uuidv7();
    const jobB = uuidv7();
    const importId = uuidv7();
    const older = "2026-08-13T10:00:00.000Z";
    const newer = "2026-08-14T10:00:00.000Z";
    await env.LIFE_DB.batch([
      env.LIFE_DB.prepare(
        `INSERT INTO provider_connections
         (id, provider_key, external_account_id, display_name, status, granted_scopes_json,
          provider_definition_version, created_at, updated_at, version)
         VALUES (?, 'instagram', ?, 'cursor contract', 'CONNECTED', '[]', 'test-v1', ?, ?, 1)`,
      ).bind(connectionId, `cursor-${connectionId}`, newer, newer),
      env.LIFE_DB.prepare(
        `INSERT INTO provider_sync_jobs
         (id, provider_key, connection_id, next_run_at, status, attempt, max_attempts, backoff_seconds,
          dedupe_key, created_at, updated_at)
         VALUES (?, 'instagram', ?, ?, 'READY', 0, 5, 60, ?, ?, ?)`,
      ).bind(jobA, connectionId, newer, `cursor-${jobA}`, newer, newer),
      env.LIFE_DB.prepare(
        `INSERT INTO provider_sync_jobs
         (id, provider_key, connection_id, next_run_at, status, attempt, max_attempts, backoff_seconds,
          dedupe_key, created_at, updated_at)
         VALUES (?, 'instagram', ?, ?, 'READY', 0, 5, 60, ?, ?, ?)`,
      ).bind(jobB, connectionId, older, `cursor-${jobB}`, older, older),
      env.LIFE_DB.prepare(
        `INSERT INTO import_batches
         (id, module_key, provider_key, account_id, mapping_profile_id, status, original_filename, file_sha256,
          encoding, delimiter, total_rows, imported_rows, duplicate_rows, error_rows, started_at, completed_at,
          created_at, updated_at, version)
         VALUES (?, 'metrics', 'manual_csv', NULL, NULL, 'COMPLETED_WITH_ERRORS', 'fixed.csv', 'hash',
          'UTF-8', ',', 4, 2, 1, 1, ?, ?, ?, ?, 2)`,
      ).bind(importId, older, newer, older, newer),
    ]);
    const first = await bodyOf(await jsonRequest("/api/v1/async-jobs?kind=PROVIDER_SYNC&limit=1"));
    expect(bodyArray(first)[0].id).toBe(jobA);
    expect(bodyMeta(first).nextCursor).toEqual(expect.any(String));
    const second = await bodyOf(await jsonRequest(`/api/v1/async-jobs?kind=PROVIDER_SYNC&limit=1&cursor=${encodeURIComponent(String(bodyMeta(first).nextCursor))}`));
    expect(bodyArray(second)[0].id).toBe(jobB);
    const invalidCursor = await jsonRequest("/api/v1/async-jobs?kind=PROVIDER_SYNC&cursor=stale");
    expect(invalidCursor.status).toBe(409);
    expect(bodyError(await bodyOf(invalidCursor)).code).toBe("ASYNC_CURSOR_STALE");

    const imported = await bodyOf(await jsonRequest(`/api/v1/async-jobs/${importId}?kind=CSV_IMPORT`));
    expect(bodyData(imported)).toEqual(expect.objectContaining({ kind: "CSV_IMPORT", status: "PARTIAL", counterInvariant: "ROW_PARTITION", progress: { processed: 4, total: 4 }, cancelSupported: false }));
    expect(bodyData(imported).counters).toEqual({ processed: 4, total: 4, succeeded: 2, skipped: 1, failed: 1 });
    expect(bodyData(imported).history).toEqual([]);

    await env.LIFE_DB.batch([
      env.LIFE_DB.prepare("DELETE FROM import_batches WHERE id = ?").bind(importId),
      env.LIFE_DB.prepare("DELETE FROM provider_sync_jobs WHERE id IN (?, ?)").bind(jobA, jobB),
      env.LIFE_DB.prepare("DELETE FROM provider_connections WHERE id = ?").bind(connectionId),
    ]);
  });

  it("not-found不洩漏job內容，unsupported cancel/retry保持明示false", async () => {
    const response = await jsonRequest(`/api/v1/async-jobs/${uuidv7()}?kind=PROVIDER_SYNC`);
    const body = await bodyOf(response);
    expect(response.status).toBe(404);
    expect(bodyError(body).code).toBe("NOT_FOUND");
    expect(body.data).toBeUndefined();
  });
});
