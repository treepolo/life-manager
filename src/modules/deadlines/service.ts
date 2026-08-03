import { newId, nowIso } from "@/core/database/d1";
import { ApiError } from "@/core/errors/api-error";
import { deadlineCompletionInputSchema } from "@/modules/deadlines/schema";

export async function completeDeadline(input: {
  db: D1Database;
  operationId: string;
  actorId: string;
  requestId: string;
  data: unknown;
  recordChange?: boolean;
}): Promise<Record<string, unknown>> {
  const parsed = deadlineCompletionInputSchema.safeParse(input.data);
  if (!parsed.success) {
    throw new ApiError(400, "VALIDATION_FAILED", "期限完成資料驗證失敗。", {
      issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    });
  }
  const data = parsed.data;
  const existing = await input.db.prepare("SELECT response_json FROM api_idempotency WHERE operation_id = ?").bind(input.operationId).first<{ response_json: string }>();
  if (existing) return JSON.parse(existing.response_json) as Record<string, unknown>;
  const deadline = await input.db.prepare("SELECT * FROM deadline_items WHERE id = ? AND deleted_at IS NULL").bind(data.deadlineItemId).first<Record<string, unknown>>();
  if (!deadline) throw new ApiError(404, "NOT_FOUND", "找不到重要期限。");
  const now = nowIso();
  const response = { data: { ...data, createdAt: now }, meta: { requestId: input.requestId } };
  const statements = [
    input.db.prepare(
      `INSERT INTO deadline_completions
       (id, deadline_item_id, completed_at, note, evidence_ref, next_occurrence_local_date, source_type, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'MANUAL', ?)`,
    ).bind(data.id, data.deadlineItemId, data.completedAt, data.note, data.evidenceRef, data.nextOccurrenceLocalDate, now),
    input.db.prepare(
      "UPDATE deadline_items SET status = 'COMPLETED', completed_at = ?, next_occurrence_local_date = ?, updated_at = ?, version = version + 1 WHERE id = ? AND status = 'OPEN'",
    ).bind(data.completedAt, data.nextOccurrenceLocalDate, now, data.deadlineItemId),
    input.db.prepare(
      "INSERT INTO audit_log (id, request_id, actor_id, entity_type, entity_id, action, before_json, after_json, occurred_at) VALUES (?, ?, ?, 'deadline-completions', ?, 'APPEND', ?, ?, ?)",
    ).bind(newId(), input.requestId, input.actorId, data.id, JSON.stringify(deadline), JSON.stringify(data), now),
    input.db.prepare(
      "INSERT INTO api_idempotency (operation_id, request_hash, resource_type, resource_id, response_status, response_json, created_at) VALUES (?, ?, 'deadline-completions', ?, 201, ?, ?)",
    ).bind(input.operationId, input.operationId, data.id, JSON.stringify(response), now),
  ];
  if (input.recordChange !== false) {
    statements.push(input.db.prepare(
      "INSERT INTO sync_change_log (entity_type, entity_id, operation_kind, entity_version, snapshot_json, changed_at, operation_id) VALUES ('deadline-completions', ?, 'APPEND', 1, ?, ?, NULL)",
    ).bind(data.id, JSON.stringify(response.data), now));
  }
  const results = await input.db.batch(statements);
  if ((results[1].meta.changes ?? 0) === 0) {
    throw new ApiError(409, "VERSION_CONFLICT", "此期限已完成或狀態已變更。");
  }
  return response;
}

export async function activeDeadlineWarnings(db: D1Database, today: string): Promise<Record<string, unknown>[]> {
  const result = await db.prepare(
    `SELECT id, name, institution, actionable_from_local_date, due_local_date, importance,
            completion_condition, instructions, confirmed_due_local_date, calculated_due_local_date, version
     FROM deadline_items
     WHERE deleted_at IS NULL AND archived_at IS NULL AND parent_deadline_id IS NULL AND status = 'OPEN' AND actionable_from_local_date <= ?
     ORDER BY CASE importance WHEN 'SUPER_CRITICAL' THEN 0 ELSE 1 END,
              COALESCE(confirmed_due_local_date, due_local_date, calculated_due_local_date, '9999-12-31'), id`,
  ).bind(today).all<Record<string, unknown>>();
  return result.results;
}
