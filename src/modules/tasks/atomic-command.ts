import { sha256 } from "@/core/crypto/secrets";
import { newId, nowIso } from "@/core/database/d1";
import { ApiError } from "@/core/errors/api-error";
import {
  taskWithInitialScheduleInputSchema,
  taskWithInitialScheduleOutputSchema,
} from "@/modules/tasks/schema";

type TaskCommandData = ReturnType<typeof taskWithInitialScheduleInputSchema.parse>;

function validationError(error: { issues: Array<{ path: PropertyKey[]; message: string }> }): ApiError {
  return new ApiError(400, "VALIDATION_FAILED", "任務與初始排程資料驗證失敗。", {
    issues: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
  });
}

function parseCommandData(value: unknown): TaskCommandData {
  const parsed = taskWithInitialScheduleInputSchema.safeParse(value);
  if (!parsed.success) throw validationError(parsed.error);
  return parsed.data;
}

async function validateTaskReferences(db: D1Database, data: TaskCommandData): Promise<void> {
  const checks: Promise<unknown>[] = [];
  if (data.task.areaId) {
    checks.push(db.prepare("SELECT id FROM areas WHERE id = ? AND deleted_at IS NULL").bind(data.task.areaId).first());
  }
  if (data.task.businessId) {
    checks.push(db.prepare("SELECT id FROM businesses WHERE id = ? AND deleted_at IS NULL").bind(data.task.businessId).first());
  }
  const references = await Promise.all(checks);
  if (data.task.areaId && !references.shift()) throw new ApiError(404, "NOT_FOUND", "找不到任務所屬領域。");
  if (data.task.businessId && !references.shift()) throw new ApiError(404, "NOT_FOUND", "找不到任務所屬事業。");
}

async function replayIfPresent(input: {
  db: D1Database;
  operationId: string;
  actorId: string;
  requestHash: string;
  requestId: string;
}): Promise<Record<string, unknown> | null> {
  const prior = await input.db.prepare(
    "SELECT actor_id, request_hash, response_status, response_json FROM api_idempotency WHERE operation_id = ?",
  ).bind(input.operationId).first<{
    actor_id: string | null;
    request_hash: string;
    response_status: number;
    response_json: string;
  }>();
  if (!prior) return null;
  if (prior.actor_id !== input.actorId || prior.request_hash !== input.requestHash) {
    throw new ApiError(409, "IDEMPOTENCY_CONFLICT", "相同operationId已用於其他內容或使用者。", { operationId: input.operationId });
  }
  const stored = JSON.parse(prior.response_json) as Record<string, unknown>;
  const parsed = taskWithInitialScheduleOutputSchema.safeParse(stored);
  if (!parsed.success) {
    throw new ApiError(500, "INTERNAL_ERROR", "已保存的任務操作結果格式無效。", { operationId: input.operationId });
  }
  return {
    ...parsed.data,
    meta: { ...parsed.data.meta, requestId: input.requestId, idempotentReplay: true },
    __status: prior.response_status,
  };
}

function taskOutput(data: TaskCommandData["task"], now: string) {
  return { ...data, createdAt: now, updatedAt: now, version: 1 };
}

function scheduleOutput(data: NonNullable<TaskCommandData["schedule"]>, now: string) {
  return { ...data, createdAt: now, updatedAt: now, version: 1 };
}

export async function createTaskWithInitialSchedule(input: {
  db: D1Database;
  operationId: string;
  actorId: string;
  requestId: string;
  data: unknown;
}): Promise<{ response: Record<string, unknown>; status: number }> {
  const data = parseCommandData(input.data);
  const requestHash = await sha256(JSON.stringify(data));
  const replay = await replayIfPresent({
    db: input.db,
    operationId: input.operationId,
    actorId: input.actorId,
    requestHash,
    requestId: input.requestId,
  });
  if (replay) {
    const status = Number(replay.__status ?? 201);
    delete replay.__status;
    return { response: replay, status };
  }

  await validateTaskReferences(input.db, data);
  const [existingTask, existingSchedule] = await Promise.all([
    input.db.prepare("SELECT id FROM task_definitions WHERE id = ?").bind(data.task.id).first(),
    data.schedule
      ? input.db.prepare("SELECT id FROM task_schedules WHERE id = ?").bind(data.schedule.id).first()
      : Promise.resolve(null),
  ]);
  if (existingTask) throw new ApiError(409, "VERSION_CONFLICT", "指定task.id已存在，不能重複建立。");
  if (existingSchedule) throw new ApiError(409, "VERSION_CONFLICT", "指定schedule.id已存在，不能重複建立。");

  const now = nowIso();
  const task = taskOutput(data.task, now);
  const schedule = data.schedule ? scheduleOutput(data.schedule, now) : null;
  const response = taskWithInitialScheduleOutputSchema.parse({
    data: { task, schedule },
    meta: { requestId: input.requestId },
  });
  const responseJson = JSON.stringify(response);
  const statements: D1PreparedStatement[] = [
    input.db.prepare(
      `INSERT INTO task_definitions
       (id, area_id, business_id, title, description, why_text, completion_criteria, low_clarity_guide,
        metric_role, estimated_minutes, priority, pinned_next_action, source_type, created_at, updated_at, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'MANUAL', ?, ?, 1)`,
    ).bind(
      data.task.id, data.task.areaId, data.task.businessId, data.task.title, data.task.description,
      data.task.whyText, data.task.completionCriteria, data.task.lowClarityGuide, data.task.metricRole,
      data.task.estimatedMinutes, data.task.priority, data.task.pinnedNextAction ? 1 : 0, now, now,
    ),
  ];
  if (schedule) {
    statements.push(input.db.prepare(
      `INSERT INTO task_schedules
       (id, task_definition_id, recurrence_kind, starts_on_local_date, due_local_time, timezone, weekdays_json,
        month_day, rrule_text, interval_value, ends_on_local_date, source_type, created_at, updated_at, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'MANUAL', ?, ?, 1)`,
    ).bind(
      schedule.id, schedule.taskDefinitionId, schedule.recurrenceKind, schedule.startsOnLocalDate,
      schedule.dueLocalTime, schedule.timezone, schedule.weekdays ? JSON.stringify(schedule.weekdays) : null,
      schedule.monthDay, schedule.rruleText, schedule.intervalValue, schedule.endsOnLocalDate, now, now,
    ));
  }
  statements.push(
    input.db.prepare(
      `INSERT INTO audit_log
       (id, request_id, actor_id, entity_type, entity_id, action, before_json, after_json, occurred_at)
       VALUES (?, ?, ?, 'tasks', ?, 'CREATE_WITH_INITIAL_SCHEDULE', NULL, ?, ?)`,
    ).bind(newId(), input.requestId, input.actorId, data.task.id, JSON.stringify(response.data), now),
  );
  if (schedule) {
    statements.push(input.db.prepare(
      `INSERT INTO audit_log
       (id, request_id, actor_id, entity_type, entity_id, action, before_json, after_json, occurred_at)
       VALUES (?, ?, ?, 'task-schedules', ?, 'CREATE_WITH_TASK', NULL, ?, ?)`,
    ).bind(newId(), input.requestId, input.actorId, schedule.id, JSON.stringify(schedule), now));
  }
  statements.push(
    input.db.prepare(
      `INSERT INTO api_idempotency
       (operation_id, request_hash, resource_type, resource_id, response_status, response_json, created_at, actor_id)
       VALUES (?, ?, 'task-with-initial-schedule', ?, 201, ?, ?, ?)`,
    ).bind(input.operationId, requestHash, data.task.id, responseJson, now, input.actorId),
    input.db.prepare(
      `INSERT INTO sync_change_log
       (entity_type, entity_id, operation_kind, entity_version, snapshot_json, changed_at, operation_id)
       VALUES ('tasks', ?, 'UPSERT', 1, ?, ?, NULL)`,
    ).bind(data.task.id, JSON.stringify(task), now),
  );
  if (schedule) {
    statements.push(input.db.prepare(
      `INSERT INTO sync_change_log
       (entity_type, entity_id, operation_kind, entity_version, snapshot_json, changed_at, operation_id)
       VALUES ('task-schedules', ?, 'UPSERT', 1, ?, ?, NULL)`,
    ).bind(schedule.id, JSON.stringify(schedule), now));
  }

  // D1 batch is the transaction boundary: task, optional schedule, audit,
  // idempotency and sync records are committed together or rolled back.
  await input.db.batch(statements);
  return { response, status: 201 };
}
