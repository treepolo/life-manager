import { z } from "zod";

import { sha256 } from "@/core/crypto/secrets";
import { newId, nowIso } from "@/core/database/d1";
import { ApiError } from "@/core/errors/api-error";
import { identifierSchema, operationIdSchema } from "@/core/validation/common";
import { parseCsv } from "@/integrations/firstrade-csv/importer";

const MAX_CSV_BYTES = 1_500_000;
const mappingSchema = z.object({
  observedAt: z.string().trim().min(1).max(160),
  value: z.string().trim().min(1).max(160),
  targetId: z.string().trim().min(1).max(160).optional(),
});
const moduleSchema = z.enum(["metrics", "social"]);

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer); let result = "";
  for (let offset = 0; offset < bytes.length; offset += 32_768) result += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 32_768, bytes.length)));
  return btoa(result);
}

async function readInput(form: FormData) {
  const file = form.get("file");
  if (!(file instanceof File)) throw new ApiError(400, "VALIDATION_FAILED", "請選擇CSV檔案。");
  if (file.size > MAX_CSV_BYTES) throw new ApiError(413, "IMPORT_INVALID", `CSV不可超過${MAX_CSV_BYTES.toLocaleString()} bytes。`);
  const moduleKey = moduleSchema.parse(form.get("moduleKey"));
  let mappingValue: unknown;
  try { mappingValue = JSON.parse(String(form.get("mapping") ?? "")); }
  catch { throw new ApiError(400, "VALIDATION_FAILED", "CSV欄位映射必須是有效JSON。"); }
  const mapping = mappingSchema.parse(mappingValue);
  if (moduleKey === "social" && !mapping.targetId) throw new ApiError(400, "VALIDATION_FAILED", "社群CSV映射必須指定targetId欄位。");
  const buffer = await file.arrayBuffer();
  const parsed = await parseCsv(buffer);
  const headers = Object.keys(parsed.rows[0] ?? {});
  const missingColumns = Object.values(mapping).filter((column) => column && !headers.includes(column));
  if (missingColumns.length) throw new ApiError(400, "IMPORT_INVALID", "CSV缺少映射欄位。", { missingColumns, headers });
  return { file, buffer, moduleKey, mapping, parsed, headers };
}

function normalizeRow(
  row: Record<string, string>,
  mapping: z.infer<typeof mappingSchema>,
  moduleKey: "metrics" | "social",
  numericRequired = moduleKey === "social",
) {
  const observedDate = new Date(row[mapping.observedAt]);
  if (Number.isNaN(observedDate.valueOf())) throw new Error("觀測時間無效");
  const value = row[mapping.value]?.trim();
  if (!value) throw new Error("值不得空白");
  if (numericRequired && !/^-?(?:\d+\.?\d*|\.\d+)$/.test(value)) throw new Error("值必須是十進位數字");
  const targetId = mapping.targetId ? row[mapping.targetId]?.trim() : null;
  if (moduleKey === "social" && !identifierSchema.safeParse(targetId).success) throw new Error("貼文／帳號ID格式無效");
  return { observedAt: observedDate.toISOString(), value, targetId };
}

export async function previewStructuredCsv(form: FormData): Promise<Record<string, unknown>> {
  const input = await readInput(form);
  const sample = input.parsed.rows.slice(0, 20).map((row, index) => {
    try { return { rowNumber: index + 2, status: "VALID", raw: row, parsed: normalizeRow(row, input.mapping, input.moduleKey) }; }
    catch (error) { return { rowNumber: index + 2, status: "ERROR", raw: row, error: error instanceof Error ? error.message : "無法解析" }; }
  });
  return { data: { moduleKey: input.moduleKey, headers: input.headers, encoding: input.parsed.encoding, delimiter: input.parsed.delimiter, fileSha256: input.parsed.fileSha256, totalRows: input.parsed.totalRows, sample, parseErrors: input.parsed.parseErrors }, meta: {} };
}

export async function importStructuredCsv(input: { db: D1Database; form: FormData; actorId: string; requestId: string }): Promise<Record<string, unknown>> {
  const source = await readInput(input.form);
  const operationId = operationIdSchema.parse(input.form.get("operationId"));
  const definitionId = identifierSchema.parse(input.form.get("definitionId"));
  const targetKind = source.moduleKey === "social" ? z.enum(["POST", "ACCOUNT"]).parse(input.form.get("targetKind")) : null;
  const profileName = z.string().trim().min(1).max(120).parse(input.form.get("profileName"));
  const definition = source.moduleKey === "metrics"
    ? await input.db.prepare("SELECT id, value_type FROM metric_definitions WHERE id = ? AND deleted_at IS NULL").bind(definitionId).first<{ id: string; value_type: string }>()
    : await input.db.prepare("SELECT id, is_cumulative FROM social_metric_definitions WHERE id = ? AND deleted_at IS NULL").bind(definitionId).first<{ id: string; is_cumulative: number }>();
  if (!definition) throw new ApiError(404, "NOT_FOUND", "找不到CSV要寫入的指標定義。");
  const requestHash = await sha256(JSON.stringify({ moduleKey: source.moduleKey, definitionId, targetKind, mapping: source.mapping, fileSha256: source.parsed.fileSha256 }));
  const prior = await input.db.prepare("SELECT request_hash, response_json FROM api_idempotency WHERE operation_id = ?").bind(operationId).first<{ request_hash: string; response_json: string }>();
  if (prior) {
    if (prior.request_hash !== requestHash) throw new ApiError(409, "IDEMPOTENCY_CONFLICT", "operationId已用於不同CSV匯入。");
    return JSON.parse(prior.response_json) as Record<string, unknown>;
  }
  const now = nowIso(); const batchId = newId(); const fileId = newId();
  const profileJson = JSON.stringify({ mapping: source.mapping, definitionId, targetKind });
  const existingProfile = await input.db.prepare("SELECT id, mapping_json FROM import_mapping_profiles WHERE module_key = ? AND provider_key = 'manual_csv' AND name = ? AND profile_version = 1")
    .bind(source.moduleKey, profileName).first<{ id: string; mapping_json: string }>();
  if (existingProfile && existingProfile.mapping_json !== profileJson) throw new ApiError(409, "IMPORT_INVALID", "同名映射設定內容不同，請另存新版本名稱。");
  const profileId = existingProfile?.id ?? newId(); const setup: D1PreparedStatement[] = [];
  if (!existingProfile) setup.push(input.db.prepare("INSERT INTO import_mapping_profiles (id, module_key, provider_key, name, profile_version, mapping_json, created_at, updated_at) VALUES (?, ?, 'manual_csv', ?, 1, ?, ?, ?)").bind(profileId, source.moduleKey, profileName, profileJson, now, now));
  setup.push(
    input.db.prepare(`INSERT INTO import_batches (id, module_key, provider_key, account_id, mapping_profile_id, status, original_filename, file_sha256, encoding, delimiter, total_rows, started_at, created_at, updated_at, version)
      VALUES (?, ?, 'manual_csv', NULL, ?, 'IMPORTING', ?, ?, ?, ?, ?, ?, ?, ?, 1)`).bind(batchId, source.moduleKey, profileId, source.file.name.slice(0, 240), source.parsed.fileSha256, source.parsed.encoding, source.parsed.delimiter, source.parsed.totalRows, now, now, now),
    input.db.prepare("INSERT INTO import_files (id, import_batch_id, file_sha256, byte_length, mime_type, raw_content_base64, retention_policy, created_at) VALUES (?, ?, ?, ?, ?, ?, 'LONG_TERM', ?)").bind(fileId, batchId, source.parsed.fileSha256, source.file.size, source.file.type || "text/csv", bufferToBase64(source.buffer), now),
  );
  await input.db.batch(setup);
  let importedRows = 0; let duplicateRows = 0; let errorRows = 0;
  try {
    for (let index = 0; index < source.parsed.rows.length; index++) {
      const row = source.parsed.rows[index]; const rowNumber = index + 2; const rowId = newId(); const rowHash = await sha256(JSON.stringify(row));
      try {
        const normalized = normalizeRow(
          row,
          source.mapping,
          source.moduleKey,
          source.moduleKey === "social" || (definition as { value_type: string }).value_type !== "TEXT",
        );
        let targetPublishedAt: string | null = null;
        if (source.moduleKey === "social") {
          const target = targetKind === "POST"
            ? await input.db.prepare("SELECT id, published_at FROM platform_posts WHERE id = ? AND deleted_at IS NULL").bind(normalized.targetId).first<{ id: string; published_at: string }>()
            : await input.db.prepare("SELECT id FROM social_accounts WHERE id = ? AND deleted_at IS NULL").bind(normalized.targetId).first<{ id: string }>();
          if (!target) throw new Error(`找不到${targetKind === "POST" ? "貼文" : "帳號"}ID`);
          targetPublishedAt = "published_at" in target ? String(target.published_at) : null;
        }
        const dedupeKey = await sha256([source.moduleKey, definitionId, targetKind ?? "METRIC", normalized.targetId ?? "", normalized.observedAt, normalized.value].join("|"));
        const duplicate = await input.db.prepare(`SELECT r.normalized_entity_id FROM import_rows r JOIN import_batches b ON b.id = r.import_batch_id
          WHERE b.module_key = ? AND r.dedupe_key = ? AND r.status IN ('IMPORTED','DUPLICATE') LIMIT 1`).bind(source.moduleKey, dedupeKey).first<{ normalized_entity_id: string }>();
        if (duplicate) {
          duplicateRows++;
          await input.db.prepare(`INSERT INTO import_rows (id, import_batch_id, row_number, row_hash, dedupe_key, raw_json, parsed_json, status, normalized_entity_type, normalized_entity_id, errors_json, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'DUPLICATE', ?, ?, '[]', ?, ?)`).bind(rowId, batchId, rowNumber, rowHash, dedupeKey, JSON.stringify(row), JSON.stringify(normalized), source.moduleKey === "metrics" ? "metric_observations" : "social_metric_snapshots", duplicate.normalized_entity_id, now, now).run();
          continue;
        }
        const entityId = newId(); const snapshot = source.moduleKey === "metrics"
          ? { id: entityId, metricDefinitionId: definitionId, observedAt: normalized.observedAt, inputLocalDate: normalized.observedAt.slice(0, 10), inputTimezone: "Asia/Taipei", valueDecimal: (definition as { value_type: string }).value_type === "TEXT" ? null : normalized.value, valueText: (definition as { value_type: string }).value_type === "TEXT" ? normalized.value : null, quality: "SOURCE_REPORTED", sourceRefType: "import_row", sourceRefId: rowId, sourceType: "CSV_IMPORT", version: 1 }
          : { id: entityId, socialMetricDefinitionId: definitionId, socialAccountId: targetKind === "ACCOUNT" ? normalized.targetId : null, platformPostId: targetKind === "POST" ? normalized.targetId : null, observedAt: normalized.observedAt, publishedAt: targetPublishedAt, ageSeconds: targetPublishedAt ? Math.max(0, Math.round((Date.parse(normalized.observedAt) - Date.parse(targetPublishedAt)) / 1000)) : null, valueDecimal: normalized.value, isCumulative: Boolean((definition as { is_cumulative: number }).is_cumulative), quality: "SOURCE_REPORTED", rawPayloadId: null, importRowId: rowId, sourceType: "CSV_IMPORT", version: 1 };
        const statements = [input.db.prepare(`INSERT INTO import_rows (id, import_batch_id, row_number, row_hash, dedupe_key, raw_json, parsed_json, status, normalized_entity_type, normalized_entity_id, errors_json, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'IMPORTED', ?, ?, '[]', ?, ?)`).bind(rowId, batchId, rowNumber, rowHash, dedupeKey, JSON.stringify(row), JSON.stringify(normalized), source.moduleKey === "metrics" ? "metric_observations" : "social_metric_snapshots", entityId, now, now)];
        if (source.moduleKey === "metrics") statements.push(input.db.prepare(`INSERT INTO metric_observations (id, metric_definition_id, observed_at, input_local_date, input_timezone, value_decimal, value_text, quality, source_ref_type, source_ref_id, source_type, created_at, updated_at, version)
          VALUES (?, ?, ?, ?, 'Asia/Taipei', ?, ?, 'SOURCE_REPORTED', 'import_row', ?, 'CSV_IMPORT', ?, ?, 1)`).bind(entityId, definitionId, normalized.observedAt, normalized.observedAt.slice(0, 10), (definition as { value_type: string }).value_type === "TEXT" ? null : normalized.value, (definition as { value_type: string }).value_type === "TEXT" ? normalized.value : null, rowId, now, now));
        else statements.push(input.db.prepare(`INSERT INTO social_metric_snapshots (id, social_metric_definition_id, social_account_id, platform_post_id, observed_at, published_at, age_seconds, value_decimal, is_cumulative, quality, raw_payload_id, import_row_id, source_type, created_at, updated_at, version)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'SOURCE_REPORTED', NULL, ?, 'CSV_IMPORT', ?, ?, 1)`).bind(entityId, definitionId, targetKind === "ACCOUNT" ? normalized.targetId : null, targetKind === "POST" ? normalized.targetId : null, normalized.observedAt, targetPublishedAt, targetPublishedAt ? Math.max(0, Math.round((Date.parse(normalized.observedAt) - Date.parse(targetPublishedAt)) / 1000)) : null, normalized.value, (definition as { is_cumulative: number }).is_cumulative, rowId, now, now));
        statements.push(input.db.prepare("INSERT INTO sync_change_log (entity_type, entity_id, operation_kind, entity_version, snapshot_json, changed_at, operation_id) VALUES (?, ?, 'APPEND', 1, ?, ?, NULL)").bind(source.moduleKey === "metrics" ? "metric-observations" : "social-snapshots", entityId, JSON.stringify(snapshot), now));
        await input.db.batch(statements); importedRows++;
      } catch (error) {
        errorRows++;
        await input.db.prepare("INSERT INTO import_rows (id, import_batch_id, row_number, row_hash, raw_json, parsed_json, status, errors_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NULL, 'ERROR', ?, ?, ?)")
          .bind(rowId, batchId, rowNumber, rowHash, JSON.stringify(row), JSON.stringify([error instanceof Error ? error.message : "無法解析"]), now, now).run();
      }
    }
    const status = errorRows ? "COMPLETED_WITH_ERRORS" : "COMPLETED"; const completedAt = nowIso();
    const response = { data: { batchId, moduleKey: source.moduleKey, fileSha256: source.parsed.fileSha256, totalRows: source.parsed.totalRows, importedRows, duplicateRows, errorRows, status }, meta: { requestId: input.requestId } };
    await input.db.batch([
      input.db.prepare("UPDATE import_batches SET status = ?, imported_rows = ?, duplicate_rows = ?, error_rows = ?, completed_at = ?, updated_at = ?, version = version + 1 WHERE id = ?").bind(status, importedRows, duplicateRows, errorRows, completedAt, completedAt, batchId),
      input.db.prepare("INSERT INTO api_idempotency (operation_id, request_hash, resource_type, resource_id, response_status, response_json, created_at) VALUES (?, ?, 'structured-csv-import', ?, 201, ?, ?)").bind(operationId, requestHash, batchId, JSON.stringify(response), completedAt),
      input.db.prepare("INSERT INTO audit_log (id, request_id, actor_id, entity_type, entity_id, action, before_json, after_json, occurred_at) VALUES (?, ?, ?, 'import-batches', ?, 'IMPORT', NULL, ?, ?)").bind(newId(), input.requestId, input.actorId, batchId, JSON.stringify(response.data), completedAt),
    ]);
    return response;
  } catch (error) {
    await input.db.prepare("UPDATE import_batches SET status = 'FAILED', completed_at = ?, updated_at = ?, version = version + 1 WHERE id = ?").bind(nowIso(), nowIso(), batchId).run();
    throw error;
  }
}
