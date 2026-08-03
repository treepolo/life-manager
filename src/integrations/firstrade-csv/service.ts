import { sha256 } from "@/core/crypto/secrets";
import { newId, nowIso } from "@/core/database/d1";
import { ApiError } from "@/core/errors/api-error";
import { operationIdSchema } from "@/core/validation/common";
import { mappingProfileSchema, normalizeBrokerageRows, parseCsv } from "@/integrations/firstrade-csv/importer";

const MAX_CSV_BYTES = 1_500_000;

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let result = "";
  for (let offset = 0; offset < bytes.length; offset += 32_768) {
    result += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 32_768, bytes.length)));
  }
  return btoa(result);
}

export async function importFirstradeCsv(input: {
  db: D1Database;
  form: FormData;
  actorId: string;
  requestId: string;
}): Promise<Record<string, unknown>> {
  const file = input.form.get("file");
  if (!(file instanceof File)) throw new ApiError(400, "VALIDATION_FAILED", "請選擇CSV檔案。");
  if (file.size > MAX_CSV_BYTES) throw new ApiError(413, "IMPORT_INVALID", `CSV不可超過${MAX_CSV_BYTES.toLocaleString()} bytes，以確保原始證據可完整保存於D1。`);
  const operationId = operationIdSchema.parse(input.form.get("operationId"));
  const brokerageAccountId = operationIdSchema.parse(input.form.get("brokerageAccountId"));
  const profileName = String(input.form.get("profileName") ?? "").trim();
  if (!profileName || profileName.length > 120) throw new ApiError(400, "VALIDATION_FAILED", "映射設定名稱必須為1至120字。");
  let profileValue: unknown;
  try { profileValue = JSON.parse(String(input.form.get("profile") ?? "")); }
  catch { throw new ApiError(400, "VALIDATION_FAILED", "欄位映射必須是有效JSON。"); }
  const profileResult = mappingProfileSchema.safeParse(profileValue);
  if (!profileResult.success) throw new ApiError(400, "VALIDATION_FAILED", "欄位映射驗證失敗。", { issues: profileResult.error.issues });
  const profile = profileResult.data;
  const account = await input.db.prepare("SELECT id FROM brokerage_accounts WHERE id = ? AND deleted_at IS NULL AND archived_at IS NULL")
    .bind(brokerageAccountId).first<{ id: string }>();
  if (!account) throw new ApiError(404, "NOT_FOUND", "找不到可匯入的券商帳戶。");
  const buffer = await file.arrayBuffer();
  const parsed = await parseCsv(buffer);
  const requestHash = await sha256(JSON.stringify({ brokerageAccountId, profile, fileSha256: parsed.fileSha256 }));
  const prior = await input.db.prepare("SELECT request_hash, response_json FROM api_idempotency WHERE operation_id = ?")
    .bind(operationId).first<{ request_hash: string; response_json: string }>();
  if (prior) {
    if (prior.request_hash !== requestHash) throw new ApiError(409, "IDEMPOTENCY_CONFLICT", "operationId已用於不同的CSV匯入。");
    return JSON.parse(prior.response_json) as Record<string, unknown>;
  }
  const normalized = await normalizeBrokerageRows(parsed, profile, brokerageAccountId);
  const now = nowIso();
  const batchId = newId();
  const fileId = newId();
  const profileJson = JSON.stringify(profile);
  const profileHash = await sha256(profileJson);
  const existingProfile = await input.db.prepare(
    "SELECT id, mapping_json FROM import_mapping_profiles WHERE module_key = 'investments' AND provider_key = 'firstrade' AND name = ? AND profile_version = 1",
  ).bind(profileName).first<{ id: string; mapping_json: string }>();
  if (existingProfile && await sha256(existingProfile.mapping_json) !== profileHash) {
    throw new ApiError(409, "IMPORT_INVALID", "同名映射設定已存在但內容不同；請改用新名稱以保存版本證據。");
  }
  const profileId = existingProfile?.id ?? newId();
  const setupStatements: D1PreparedStatement[] = [];
  if (!existingProfile) setupStatements.push(input.db.prepare(
    `INSERT INTO import_mapping_profiles (id, module_key, provider_key, name, profile_version, mapping_json, created_at, updated_at)
     VALUES (?, 'investments', 'firstrade', ?, 1, ?, ?, ?)`,
  ).bind(profileId, profileName, profileJson, now, now));
  setupStatements.push(
    input.db.prepare(
      `INSERT INTO import_batches
       (id, module_key, provider_key, account_id, mapping_profile_id, status, original_filename, file_sha256,
        encoding, delimiter, total_rows, started_at, created_at, updated_at, version)
       VALUES (?, 'investments', 'firstrade', ?, ?, 'IMPORTING', ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    ).bind(batchId, brokerageAccountId, profileId, file.name.slice(0, 240), parsed.fileSha256, parsed.encoding, parsed.delimiter, parsed.totalRows, now, now, now),
    input.db.prepare(
      `INSERT INTO import_files (id, import_batch_id, file_sha256, byte_length, mime_type, raw_content_base64, retention_policy, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'LONG_TERM', ?)`,
    ).bind(fileId, batchId, parsed.fileSha256, file.size, file.type || "text/csv", bufferToBase64(buffer), now),
  );
  await input.db.batch(setupStatements);

  let importedRows = 0;
  let duplicateRows = 0;
  const activityByRow = new Map(normalized.activities.map((activity) => [activity.rowNumber, activity]));
  const errorByRow = new Map(normalized.errors.map((error) => [error.rowNumber, error.message]));
  try {
    for (let index = 0; index < parsed.rows.length; index++) {
      const rowNumber = index + 2;
      const raw = parsed.rows[index];
      const activity = activityByRow.get(rowNumber);
      const error = errorByRow.get(rowNumber) ?? parsed.parseErrors.find((entry) => entry.row + 2 === rowNumber)?.message;
      const rowId = newId();
      if (!activity || error) {
        await input.db.prepare(
          `INSERT INTO import_rows
           (id, import_batch_id, row_number, row_hash, raw_json, parsed_json, status, errors_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, NULL, 'ERROR', ?, ?, ?)`,
        ).bind(rowId, batchId, rowNumber, await sha256(JSON.stringify(raw)), JSON.stringify(raw), JSON.stringify([error ?? "無法正規化此列"]), now, now).run();
        continue;
      }
      const duplicate = await input.db.prepare(
        "SELECT id FROM brokerage_activity WHERE brokerage_account_id = ? AND stable_dedupe_key = ? AND deleted_at IS NULL",
      ).bind(brokerageAccountId, activity.stableDedupeKey).first<{ id: string }>();
      if (duplicate) {
        duplicateRows++;
        await input.db.prepare(
          `INSERT INTO import_rows
           (id, import_batch_id, row_number, row_hash, dedupe_key, raw_json, parsed_json, status,
            normalized_entity_type, normalized_entity_id, errors_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'DUPLICATE', 'brokerage_activity', ?, '[]', ?, ?)`,
        ).bind(rowId, batchId, rowNumber, activity.rowHash, activity.stableDedupeKey, JSON.stringify(raw), JSON.stringify(activity), duplicate.id, now, now).run();
        continue;
      }
      const activityId = newId();
      await input.db.batch([
        input.db.prepare(
          `INSERT INTO import_rows
           (id, import_batch_id, row_number, row_hash, dedupe_key, raw_json, parsed_json, status,
            normalized_entity_type, normalized_entity_id, errors_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'brokerage_activity', ?, '[]', ?, ?)`,
        ).bind(rowId, batchId, rowNumber, activity.rowHash, activity.stableDedupeKey, JSON.stringify(raw), JSON.stringify(activity), activity.requiresReview ? "NEEDS_REVIEW" : "IMPORTED", activityId, now, now),
        input.db.prepare(
          `INSERT INTO brokerage_activity
           (id, brokerage_account_id, import_row_id, activity_type, occurred_at, symbol, description, quantity_decimal,
            amount_minor, currency_code, minor_unit_scale, stable_dedupe_key, source_type, created_at, updated_at, version)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'CSV_IMPORT', ?, ?, 1)`,
        ).bind(activityId, brokerageAccountId, rowId, activity.activityType, activity.occurredAt, activity.symbol,
          activity.description, activity.quantityDecimal, activity.amountMinor, activity.currencyCode,
          activity.minorUnitScale, activity.stableDedupeKey, now, now),
      ]);
      importedRows++;
    }
    const errorRows = parsed.totalRows - importedRows - duplicateRows;
    const status = errorRows > 0 ? "COMPLETED_WITH_ERRORS" : "COMPLETED";
    const response = { data: { batchId, fileSha256: parsed.fileSha256, totalRows: parsed.totalRows, importedRows, duplicateRows, errorRows, status }, meta: { requestId: input.requestId } };
    await input.db.batch([
      input.db.prepare(
        `UPDATE import_batches SET status = ?, imported_rows = ?, duplicate_rows = ?, error_rows = ?, completed_at = ?, updated_at = ?, version = version + 1 WHERE id = ?`,
      ).bind(status, importedRows, duplicateRows, errorRows, nowIso(), nowIso(), batchId),
      input.db.prepare(
        "INSERT INTO api_idempotency (operation_id, request_hash, resource_type, resource_id, response_status, response_json, created_at) VALUES (?, ?, 'firstrade-import', ?, 201, ?, ?)",
      ).bind(operationId, requestHash, batchId, JSON.stringify(response), nowIso()),
      input.db.prepare(
        "INSERT INTO audit_log (id, request_id, actor_id, entity_type, entity_id, action, before_json, after_json, occurred_at) VALUES (?, ?, ?, 'import-batches', ?, 'IMPORT', NULL, ?, ?)",
      ).bind(newId(), input.requestId, input.actorId, batchId, JSON.stringify(response.data), nowIso()),
    ]);
    return response;
  } catch (error) {
    await input.db.prepare("UPDATE import_batches SET status = 'FAILED', completed_at = ?, updated_at = ?, version = version + 1 WHERE id = ?")
      .bind(nowIso(), nowIso(), batchId).run();
    throw error;
  }
}
