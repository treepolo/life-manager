import { newId, nowIso } from "@/core/database/d1";
import { ApiError } from "@/core/errors/api-error";
import { generateOccurrenceDates } from "@/modules/tasks/recurrence";
import { taskCompletionInputSchema, taskDeferralInputSchema, taskScheduleInputSchema } from "@/modules/tasks/schema";

interface ScheduleRow {
  id: string;
  task_definition_id: string;
  recurrence_kind: string;
  starts_on_local_date: string;
  due_local_time: string | null;
  timezone: string;
  weekdays_json: string | null;
  month_day: number | null;
  rrule_text: string | null;
  interval_value: number;
  ends_on_local_date: string | null;
  version: number;
}

export async function ensureTaskOccurrences(db: D1Database, fromLocalDate: string, toLocalDate: string): Promise<number> {
  const schedules = await db
    .prepare("SELECT * FROM task_schedules WHERE deleted_at IS NULL")
    .all<ScheduleRow>();
  const statements: D1PreparedStatement[] = [];
  const createdAt = nowIso();
  for (const row of schedules.results) {
    const schedule = taskScheduleInputSchema.parse({
      id: row.id,
      taskDefinitionId: row.task_definition_id,
      recurrenceKind: row.recurrence_kind,
      startsOnLocalDate: row.starts_on_local_date,
      dueLocalTime: row.due_local_time,
      timezone: row.timezone,
      weekdays: row.weekdays_json ? JSON.parse(row.weekdays_json) : null,
      monthDay: row.month_day,
      rruleText: row.rrule_text,
      intervalValue: row.interval_value,
      endsOnLocalDate: row.ends_on_local_date,
    });
    for (const date of generateOccurrenceDates(schedule, fromLocalDate, toLocalDate)) {
      statements.push(
        db.prepare(
          `INSERT OR IGNORE INTO task_occurrences
           (id, task_definition_id, task_schedule_id, scheduled_local_date, due_at, status, generated_from_schedule_version, source_type, created_at, updated_at, version)
           VALUES (?, ?, ?, ?, NULL, 'OPEN', ?, 'SYSTEM', ?, ?, 1)`,
        ).bind(newId(), row.task_definition_id, row.id, date, row.version, createdAt, createdAt),
      );
    }
  }
  if (!statements.length) return 0;
  const results = await db.batch(statements);
  return results.reduce((count, result) => count + (result.meta.changes ?? 0), 0);
}

export async function listTodayActions(db: D1Database, today: string): Promise<Record<string, unknown>[]> {
  const earliest = await db.prepare(
    `SELECT MIN(s.starts_on_local_date) AS starts_on_local_date
     FROM task_schedules s JOIN task_definitions t ON t.id = s.task_definition_id
     WHERE s.deleted_at IS NULL AND t.deleted_at IS NULL AND t.archived_at IS NULL`,
  ).first<{ starts_on_local_date: string | null }>();
  await ensureTaskOccurrences(db, earliest?.starts_on_local_date ?? today, today);
  const result = await db.prepare(
    `SELECT o.id AS occurrence_id, o.scheduled_local_date, o.deferred_to_local_date,
            COALESCE(o.deferred_to_local_date, o.scheduled_local_date) AS effective_local_date,
            o.status AS occurrence_status, o.version AS occurrence_version,
            t.id AS task_id, t.title, t.description, t.why_text, t.completion_criteria,
            t.low_clarity_guide, t.estimated_minutes, t.priority, t.pinned_next_action,
            t.area_id, t.business_id, t.version AS task_version
     FROM task_occurrences o
     JOIN task_definitions t ON t.id = o.task_definition_id
     WHERE o.deleted_at IS NULL AND t.deleted_at IS NULL AND t.archived_at IS NULL
       AND o.status IN ('OPEN','DEFERRED') AND COALESCE(o.deferred_to_local_date, o.scheduled_local_date) <= ?
     ORDER BY CASE WHEN COALESCE(o.deferred_to_local_date, o.scheduled_local_date) < ? THEN 0 ELSE 1 END,
              t.pinned_next_action DESC, t.priority DESC,
              COALESCE(o.deferred_to_local_date, o.scheduled_local_date) ASC, t.id ASC`,
  ).bind(today, today).all<Record<string, unknown>>();
  return result.results;
}

export async function deferTask(input: {
  db: D1Database;
  operationId: string;
  actorId: string;
  requestId: string;
  data: unknown;
}): Promise<Record<string, unknown>> {
  const parsed = taskDeferralInputSchema.safeParse(input.data);
  if (!parsed.success) {
    throw new ApiError(400, "VALIDATION_FAILED", "任務延後資料驗證失敗。", {
      issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    });
  }
  const data = parsed.data;
  const prior = await input.db.prepare("SELECT response_json FROM api_idempotency WHERE operation_id = ?")
    .bind(input.operationId).first<{ response_json: string }>();
  if (prior) return JSON.parse(prior.response_json) as Record<string, unknown>;
  const occurrence = await input.db.prepare(
    `SELECT o.id, o.task_definition_id, o.scheduled_local_date, o.deferred_to_local_date, o.status, o.version
     FROM task_occurrences o JOIN task_definitions t ON t.id = o.task_definition_id
     WHERE o.id = ? AND o.deleted_at IS NULL AND t.deleted_at IS NULL AND t.archived_at IS NULL`,
  ).bind(data.taskOccurrenceId).first<{
    id: string; task_definition_id: string; scheduled_local_date: string; deferred_to_local_date: string | null; status: string; version: number;
  }>();
  if (!occurrence) throw new ApiError(404, "NOT_FOUND", "找不到可延後的任務發生項目。");
  if (!['OPEN', 'DEFERRED'].includes(occurrence.status)) throw new ApiError(409, "VERSION_CONFLICT", "只有尚未完成的任務可以延後。");
  if (occurrence.version !== data.baseVersion) {
    throw new ApiError(409, "VERSION_CONFLICT", "任務發生項目已在其他裝置更新。", { baseVersion: data.baseVersion, serverVersion: occurrence.version });
  }
  const effectiveDate = occurrence.deferred_to_local_date ?? occurrence.scheduled_local_date;
  if (data.deferredToLocalDate <= effectiveDate) {
    throw new ApiError(400, "VALIDATION_FAILED", "延後日期必須晚於目前排定日期。", { effectiveDate });
  }
  const now = nowIso();
  const nextVersion = occurrence.version + 1;
  const next = {
    id: occurrence.id,
    taskDefinitionId: occurrence.task_definition_id,
    scheduledLocalDate: occurrence.scheduled_local_date,
    deferredToLocalDate: data.deferredToLocalDate,
    status: "DEFERRED",
    version: nextVersion,
    updatedAt: now,
  };
  const response = { data: next, meta: { requestId: input.requestId } };
  const results = await input.db.batch([
    input.db.prepare(
      `UPDATE task_occurrences SET status = 'DEFERRED', deferred_to_local_date = ?, updated_at = ?, version = version + 1
       WHERE id = ? AND version = ? AND status IN ('OPEN','DEFERRED')`,
    ).bind(data.deferredToLocalDate, now, occurrence.id, data.baseVersion),
    input.db.prepare(
      `INSERT INTO audit_log (id, request_id, actor_id, entity_type, entity_id, action, before_json, after_json, occurred_at)
       SELECT ?, ?, ?, 'task-occurrences', ?, 'DEFER', ?, ?, ? WHERE EXISTS
       (SELECT 1 FROM task_occurrences WHERE id = ? AND version = ?)`,
    ).bind(newId(), input.requestId, input.actorId, occurrence.id, JSON.stringify(occurrence), JSON.stringify(next), now, occurrence.id, nextVersion),
    input.db.prepare(
      `INSERT INTO api_idempotency (operation_id, request_hash, resource_type, resource_id, response_status, response_json, created_at)
       SELECT ?, ?, 'task-deferrals', ?, 200, ?, ? WHERE EXISTS
       (SELECT 1 FROM task_occurrences WHERE id = ? AND version = ?)`,
    ).bind(input.operationId, input.operationId, occurrence.id, JSON.stringify(response), now, occurrence.id, nextVersion),
    input.db.prepare(
      `INSERT INTO sync_change_log (entity_type, entity_id, operation_kind, entity_version, snapshot_json, changed_at, operation_id)
       SELECT 'task-occurrences', ?, 'UPSERT', ?, ?, ?, NULL WHERE EXISTS
       (SELECT 1 FROM task_occurrences WHERE id = ? AND version = ?)`,
    ).bind(occurrence.id, nextVersion, JSON.stringify(next), now, occurrence.id, nextVersion),
  ]);
  if ((results[0].meta.changes ?? 0) === 0) throw new ApiError(409, "VERSION_CONFLICT", "延後時任務版本已改變，請重新同步。");
  return response;
}

export async function completeTask(input: {
  db: D1Database;
  operationId: string;
  actorId: string;
  requestId: string;
  data: unknown;
  recordChange?: boolean;
}): Promise<Record<string, unknown>> {
  const parsed = taskCompletionInputSchema.safeParse(input.data);
  if (!parsed.success) {
    throw new ApiError(400, "VALIDATION_FAILED", "任務完成資料驗證失敗。", {
      issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    });
  }
  const data = parsed.data;
  const prior = await input.db.prepare("SELECT response_json FROM api_idempotency WHERE operation_id = ?").bind(input.operationId).first<{ response_json: string }>();
  if (prior) return JSON.parse(prior.response_json) as Record<string, unknown>;
  const now = nowIso();
  const response = { data: { ...data, createdAt: now }, meta: { requestId: input.requestId } };
  const statements: D1PreparedStatement[] = [
    input.db.prepare(
      `INSERT INTO task_completions
       (id, task_definition_id, task_occurrence_id, scheduled_local_date, completed_at, note, numeric_value, metric_definition_id, source_type, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'MANUAL', ?)`,
    ).bind(data.id, data.taskDefinitionId, data.taskOccurrenceId, data.scheduledLocalDate, data.completedAt, data.note, data.numericValue, data.metricDefinitionId, now),
  ];
  if (data.taskOccurrenceId) {
    statements.push(
      input.db.prepare("UPDATE task_occurrences SET status = 'COMPLETED', updated_at = ?, version = version + 1 WHERE id = ? AND status != 'COMPLETED'")
        .bind(now, data.taskOccurrenceId),
    );
  }
  statements.push(
    input.db.prepare(
      "INSERT INTO audit_log (id, request_id, actor_id, entity_type, entity_id, action, before_json, after_json, occurred_at) VALUES (?, ?, ?, 'task-completions', ?, 'APPEND', NULL, ?, ?)",
    ).bind(newId(), input.requestId, input.actorId, data.id, JSON.stringify(data), now),
    input.db.prepare(
      "INSERT INTO api_idempotency (operation_id, request_hash, resource_type, resource_id, response_status, response_json, created_at) VALUES (?, ?, 'task-completions', ?, 201, ?, ?)",
    ).bind(input.operationId, input.operationId, data.id, JSON.stringify(response), now),
  );
  if (input.recordChange !== false) {
    statements.push(input.db.prepare(
      "INSERT INTO sync_change_log (entity_type, entity_id, operation_kind, entity_version, snapshot_json, changed_at, operation_id) VALUES ('task-completions', ?, 'APPEND', 1, ?, ?, NULL)",
    ).bind(data.id, JSON.stringify(response.data), now));
  }
  await input.db.batch(statements);
  return response;
}
