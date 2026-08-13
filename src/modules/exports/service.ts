import { sha256 } from "@/core/crypto/secrets";
import { newId, nowIso } from "@/core/database/d1";
import { ApiError } from "@/core/errors/api-error";
import { operationIdSchema } from "@/core/validation/common";

const exportQueries: Record<string, string> = {
  areas: "SELECT * FROM areas",
  businesses: "SELECT * FROM businesses",
  entity_links: "SELECT * FROM entity_links",
  tags: "SELECT * FROM tags",
  entity_tags: "SELECT * FROM entity_tags",
  event_types: "SELECT * FROM event_types",
  events: "SELECT * FROM events",
  metric_definitions: "SELECT * FROM metric_definitions",
  metric_observations: "SELECT * FROM metric_observations",
  formula_definitions: "SELECT * FROM formula_definitions",
  saved_views: "SELECT * FROM saved_views",
  task_definitions: "SELECT * FROM task_definitions",
  task_schedules: "SELECT * FROM task_schedules",
  task_occurrences: "SELECT * FROM task_occurrences",
  task_completions: "SELECT * FROM task_completions",
  financial_accounts: "SELECT * FROM financial_accounts",
  finance_categories: "SELECT * FROM finance_categories",
  income_sources: "SELECT * FROM income_sources",
  financial_transactions: "SELECT * FROM financial_transactions",
  asset_definitions: "SELECT * FROM asset_definitions",
  asset_snapshots: "SELECT * FROM asset_snapshots",
  fx_rates: "SELECT * FROM fx_rates",
  expense_baselines: "SELECT * FROM expense_baselines",
  brokerage_accounts: "SELECT * FROM brokerage_accounts",
  brokerage_activity: "SELECT * FROM brokerage_activity",
  import_batches: "SELECT * FROM import_batches",
  import_files: "SELECT * FROM import_files",
  import_rows: "SELECT * FROM import_rows",
  import_mapping_profiles: "SELECT * FROM import_mapping_profiles",
  source_reported_values: "SELECT * FROM source_reported_values",
  social_platforms: "SELECT * FROM social_platforms",
  social_accounts: "SELECT * FROM social_accounts",
  content_assets: "SELECT * FROM content_assets",
  platform_posts: "SELECT * FROM platform_posts",
  social_metric_definitions: "SELECT * FROM social_metric_definitions",
  social_metric_snapshots: "SELECT * FROM social_metric_snapshots",
  conversion_records: "SELECT * FROM conversion_records",
  comparison_definitions: "SELECT * FROM comparison_definitions",
  provider_connections: `SELECT id, provider_key, external_account_id, display_name, status, granted_scopes_json,
                                token_expires_at, last_attempt_at, last_success_at, last_error_code,
                                last_error_message_redacted, provider_definition_version, disconnected_at,
                                created_at, updated_at, version FROM provider_connections`,
  provider_raw_payloads: "SELECT * FROM provider_raw_payloads",
  provider_sync_runs: "SELECT * FROM provider_sync_runs",
  provider_sync_run_payloads: "SELECT * FROM provider_sync_run_payloads",
  provider_sync_jobs: "SELECT * FROM provider_sync_jobs",
  deadline_items: "SELECT * FROM deadline_items",
  deadline_completions: "SELECT * FROM deadline_completions",
  deadline_templates: "SELECT * FROM deadline_templates",
  notification_channels: "SELECT * FROM notification_channels",
  notification_preferences: `SELECT id, timezone, local_send_time, repeat_interval_hours,
                                    modal_for_super_critical, confirmed_at, created_at, updated_at, version
                             FROM notification_preferences`,
  push_subscriptions: `SELECT id, device_id, content_encoding, user_agent_summary, status, last_success_at,
                              last_error_code, disabled_at, created_at, updated_at, version FROM push_subscriptions`,
  notification_deliveries: "SELECT * FROM notification_deliveries",
  scheduled_jobs: "SELECT * FROM scheduled_jobs",
  sync_devices: "SELECT * FROM sync_devices",
  sync_operations: "SELECT * FROM sync_operations",
  sync_change_log: "SELECT * FROM sync_change_log",
  sync_cursors: "SELECT * FROM sync_cursors",
  conflict_records: "SELECT * FROM conflict_records",
  app_settings: "SELECT * FROM app_settings",
  audit_log: "SELECT * FROM audit_log",
  cost_guardrail_contract_observations: "SELECT * FROM cost_guardrail_contract_observations",
  cost_guardrail_usage_observations: "SELECT * FROM cost_guardrail_usage_observations",
  cost_guardrail_budget_windows: "SELECT * FROM cost_guardrail_budget_windows",
  cost_guardrail_reservations: "SELECT * FROM cost_guardrail_reservations",
  cost_guardrail_ledger_events: "SELECT * FROM cost_guardrail_ledger_events",
  cost_guardrail_alerts: "SELECT * FROM cost_guardrail_alerts",
  cost_guardrail_breaker_events: "SELECT * FROM cost_guardrail_breaker_events",
  cost_guardrail_overrides: "SELECT * FROM cost_guardrail_overrides",
  cost_guardrail_drift_audits: "SELECT * FROM cost_guardrail_drift_audits",
};

export const moduleTables: Record<string, string[]> = {
  core: ["areas", "businesses", "tags", "event_types", "events"],
  tasks: ["task_definitions", "task_schedules", "task_occurrences", "task_completions"],
  finance: ["financial_accounts", "finance_categories", "income_sources", "financial_transactions", "asset_definitions", "asset_snapshots", "fx_rates", "expense_baselines"],
  investments: ["brokerage_accounts", "brokerage_activity", "import_batches", "import_rows", "source_reported_values"],
  metrics: ["metric_definitions", "metric_observations", "formula_definitions"],
  social: ["social_platforms", "social_accounts", "content_assets", "platform_posts", "social_metric_definitions", "social_metric_snapshots", "conversion_records", "comparison_definitions"],
  deadlines: ["deadline_items", "deadline_completions", "deadline_templates", "notification_deliveries"],
  imports: ["import_batches", "import_rows", "import_mapping_profiles"],
  cost_guardrails: ["cost_guardrail_contract_observations", "cost_guardrail_usage_observations", "cost_guardrail_budget_windows", "cost_guardrail_reservations", "cost_guardrail_ledger_events", "cost_guardrail_alerts", "cost_guardrail_breaker_events", "cost_guardrail_overrides", "cost_guardrail_drift_audits"],
};

const restoreTableOrder = [
  "areas", "businesses", "tags", "event_types", "entity_links", "entity_tags", "events",
  "metric_definitions", "formula_definitions", "metric_observations", "saved_views",
  "task_definitions", "task_schedules", "task_occurrences", "task_completions",
  "financial_accounts", "finance_categories", "income_sources", "financial_transactions",
  "asset_definitions", "fx_rates", "asset_snapshots", "expense_baselines", "brokerage_accounts",
  "import_mapping_profiles", "import_batches", "import_files", "import_rows", "brokerage_activity", "source_reported_values",
  "social_platforms", "social_accounts", "content_assets", "platform_posts", "social_metric_definitions",
  "provider_connections", "provider_sync_runs", "provider_raw_payloads", "provider_sync_run_payloads", "social_metric_snapshots", "conversion_records", "comparison_definitions",
  "provider_sync_jobs", "deadline_templates", "deadline_items", "deadline_completions",
  "notification_channels", "notification_preferences", "notification_deliveries", "scheduled_jobs", "app_settings", "audit_log",
  "cost_guardrail_contract_observations", "cost_guardrail_usage_observations", "cost_guardrail_budget_windows", "cost_guardrail_reservations", "cost_guardrail_ledger_events", "cost_guardrail_alerts", "cost_guardrail_breaker_events", "cost_guardrail_overrides", "cost_guardrail_drift_audits",
] as const;
const restoreTableSet = new Set<string>(restoreTableOrder);
const userRootTables = ["areas", "businesses", "metric_definitions", "task_definitions", "financial_transactions", "content_assets", "platform_posts", "deadline_items", "import_batches"];
const forbiddenRestoreField = /(encrypted|access_token|refresh_token|client_secret|api_key|password|private_key|p256dh|auth$|endpoint)/i;

function primitiveDbValue(value: unknown): string | number | null {
  if (value === null || typeof value === "string" || typeof value === "number") return value;
  throw new ApiError(400, "IMPORT_INVALID", "完整匯入包含不支援的欄位值型別。");
}

export async function importFullExport(input: { db: D1Database; form: FormData; actorId: string; requestId: string }): Promise<Record<string, unknown>> {
  const file = input.form.get("file");
  if (!(file instanceof File)) throw new ApiError(400, "VALIDATION_FAILED", "請選擇完整JSON匯出檔。");
  if (file.size > 20_000_000) throw new ApiError(413, "IMPORT_INVALID", "完整JSON匯入檔不可超過20MB。");
  const operationId = operationIdSchema.parse(input.form.get("operationId"));
  let parsed: unknown;
  try { parsed = JSON.parse(await file.text()); }
  catch { throw new ApiError(400, "IMPORT_INVALID", "完整匯入檔不是有效JSON。"); }
  if (!parsed || typeof parsed !== "object") throw new ApiError(400, "IMPORT_INVALID", "完整匯入格式無效。");
  const source = parsed as { schemaVersion?: unknown; entities?: unknown; entityCounts?: unknown; checksum?: unknown };
  if (!Number.isInteger(source.schemaVersion) || !source.entities || typeof source.entities !== "object" || typeof source.checksum !== "string") throw new ApiError(400, "IMPORT_INVALID", "完整匯入缺少schemaVersion、entities或checksum。");
  const entities = source.entities as Record<string, unknown>;
  const unknownTables = Object.keys(entities).filter((table) => !(table in exportQueries));
  if (unknownTables.length) throw new ApiError(400, "IMPORT_INVALID", "完整匯入包含未知資料表。", { unknownTables });
  for (const [table, rows] of Object.entries(entities)) if (!Array.isArray(rows)) throw new ApiError(400, "IMPORT_INVALID", `${table}資料必須是陣列。`);
  const expectedChecksum = await sha256(JSON.stringify({ schemaVersion: source.schemaVersion, entities }));
  if (expectedChecksum !== source.checksum) throw new ApiError(400, "IMPORT_INVALID", "完整匯入checksum不一致，檔案可能已損毀或被修改。");
  const currentVersion = Number((await input.db.prepare("SELECT value FROM schema_metadata WHERE key = 'application_schema_version'").first<{ value: string }>())?.value ?? 0);
  if (source.schemaVersion !== currentVersion) throw new ApiError(409, "IMPORT_INVALID", "完整匯入schema版本與目前應用程式不一致。", { sourceVersion: source.schemaVersion, currentVersion });
  const requestHash = await sha256(`${source.checksum}|${file.size}`);
  const prior = await input.db.prepare("SELECT request_hash, response_json FROM api_idempotency WHERE operation_id = ?").bind(operationId).first<{ request_hash: string; response_json: string }>();
  if (prior) {
    if (prior.request_hash !== requestHash) throw new ApiError(409, "IDEMPOTENCY_CONFLICT", "operationId已用於不同完整匯入。");
    return JSON.parse(prior.response_json) as Record<string, unknown>;
  }
  const counts = await Promise.all(userRootTables.map(async (table) => Number((await input.db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first<{ count: number }>())?.count ?? 0)));
  if (counts.some((count) => count > 0)) throw new ApiError(409, "IMPORT_INVALID", "完整JSON只能匯入已完成migration且沒有使用者正式資料的資料庫。", { reason: "IMPORT_REQUIRES_EMPTY_DATABASE", nonEmpty: userRootTables.filter((_, index) => counts[index] > 0) });
  const statements: D1PreparedStatement[] = [];
  const restoredCounts: Record<string, number> = {}; const skippedCounts: Record<string, number> = {};
  for (const table of restoreTableOrder) {
    const rows = (entities[table] ?? []) as Array<Record<string, unknown>>;
    if (!rows.length) { restoredCounts[table] = 0; continue; }
    const info = await input.db.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
    const allowedColumns = new Set(info.results.map((column) => column.name));
    for (const originalRow of rows) {
      const row = { ...originalRow };
      if (table === "provider_connections") row.status = "NEEDS_REAUTH";
      const forbidden = Object.keys(row).filter((field) => forbiddenRestoreField.test(field));
      if (forbidden.length) throw new ApiError(400, "IMPORT_INVALID", "完整匯入含禁止的秘密欄位。", { table, forbidden });
      const columns = Object.keys(row).filter((column) => allowedColumns.has(column));
      if (!columns.length) { skippedCounts[table] = (skippedCounts[table] ?? 0) + 1; continue; }
      statements.push(input.db.prepare(`INSERT OR REPLACE INTO ${table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`).bind(...columns.map((column) => primitiveDbValue(row[column]))));
      restoredCounts[table] = (restoredCounts[table] ?? 0) + 1;
    }
  }
  for (const [table, rows] of Object.entries(entities)) if (!restoreTableSet.has(table)) skippedCounts[table] = (rows as unknown[]).length;
  if (statements.length) await input.db.batch(statements);
  const now = nowIso();
  const response = { data: { schemaVersion: source.schemaVersion, sourceChecksum: source.checksum, restoredCounts, skippedCounts, secretsRestored: false, externalConnectionsRequireReauthorization: true }, meta: { requestId: input.requestId } };
  await input.db.batch([
    input.db.prepare("INSERT INTO api_idempotency (operation_id, request_hash, resource_type, resource_id, response_status, response_json, created_at) VALUES (?, ?, 'full-json-import', ?, 201, ?, ?)").bind(operationId, requestHash, String(source.checksum), JSON.stringify(response), now),
    input.db.prepare("INSERT INTO audit_log (id, request_id, actor_id, entity_type, entity_id, action, before_json, after_json, occurred_at) VALUES (?, ?, ?, 'full-json-import', ?, 'RESTORE', NULL, ?, ?)").bind(newId(), input.requestId, input.actorId, String(source.checksum), JSON.stringify({ restoredCounts, skippedCounts }), now),
  ]);
  return response;
}

export async function buildFullExport(db: D1Database): Promise<{
  schemaVersion: number;
  exportedAt: string;
  entities: Record<string, unknown[]>;
  entityCounts: Record<string, number>;
  checksum: string;
}> {
  const version = await db.prepare("SELECT value FROM schema_metadata WHERE key = 'application_schema_version'").first<{ value: string }>();
  const entities: Record<string, unknown[]> = {};
  for (const [name, query] of Object.entries(exportQueries)) {
    entities[name] = (await db.prepare(query).all()).results;
  }
  const entityCounts = Object.fromEntries(Object.entries(entities).map(([name, rows]) => [name, rows.length]));
  const canonical = JSON.stringify({ schemaVersion: Number(version?.value ?? 0), entities });
  return {
    schemaVersion: Number(version?.value ?? 0),
    exportedAt: new Date().toISOString(),
    entities,
    entityCounts,
    checksum: await sha256(canonical),
  };
}

function safeSpreadsheetText(value: string): string {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = safeSpreadsheetText(typeof value === "string" ? value : JSON.stringify(value));
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export async function buildModuleCsv(db: D1Database, moduleKey: string): Promise<string> {
  const tables = moduleTables[moduleKey];
  if (!tables) throw new Error("UNKNOWN_EXPORT_MODULE");
  const sections: string[] = [];
  for (const table of tables) {
    const query = exportQueries[table];
    const rows = (await db.prepare(query).all<Record<string, unknown>>()).results;
    sections.push(`# table:${table}`);
    if (!rows.length) {
      sections.push("# 尚無資料", "");
      continue;
    }
    const headers = Object.keys(rows[0]);
    sections.push(headers.map(csvCell).join(","));
    for (const row of rows) sections.push(headers.map((header) => csvCell(row[header])).join(","));
    sections.push("");
  }
  return `\uFEFF${sections.join("\r\n")}`;
}
