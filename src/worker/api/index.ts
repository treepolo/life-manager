import { z } from "zod";

import { encryptSecret, sha256 } from "@/core/crypto/secrets";
import { newId, nowIso } from "@/core/database/d1";
import { ApiError } from "@/core/errors/api-error";
import { pullChanges, applySyncBatch, resolveSyncConflict } from "@/core/sync/server";
import { registerDeviceSchema } from "@/core/sync/schema";
import { localDateAt } from "@/core/time/taipei";
import { identifierSchema, localDateSchema, operationIdSchema } from "@/core/validation/common";
import { previewCsv } from "@/integrations/firstrade-csv/importer";
import { importFirstradeCsv } from "@/integrations/firstrade-csv/service";
import { importStructuredCsv, previewStructuredCsv } from "@/integrations/structured-csv/service";
import { activeDeadlineWarnings, completeDeadline } from "@/modules/deadlines/service";
import { notificationPreferenceInputSchema } from "@/modules/deadlines/schema";
import { buildFullExport, buildModuleCsv, importFullExport, moduleTables } from "@/modules/exports/service";
import { financeAnalysis, netWorthAnalysis, netWorthTrend } from "@/modules/finance/query";
import { financeAnalysisQuerySchema } from "@/modules/finance/schema";
import { evaluateFormula, formulaMetricKeys, parseFormula } from "@/modules/metrics/formula/engine";
import { formulaDefinitionInputSchema } from "@/modules/metrics/schema";
import { socialComparisonQuery } from "@/modules/social/query";
import { completeTask, deferTask, listTodayActions } from "@/modules/tasks/service";
import { handleCrudRoute } from "@/worker/api/crud";
import { connectionCredentials, startOAuth } from "@/worker/api/oauth";
import { syncProviderConnection } from "@/worker/api/provider-sync";
import { sendDeadlineNotificationTest } from "@/worker/scheduled";
import type { Env } from "@/worker/env";

const operationEnvelopeSchema = z.object({
  operationId: operationIdSchema,
  data: z.record(z.string(), z.unknown()),
});

async function jsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ApiError(400, "VALIDATION_FAILED", "請求內容必須是有效JSON。");
  }
}

function parseEnvelope(value: unknown): z.infer<typeof operationEnvelopeSchema> {
  const parsed = operationEnvelopeSchema.safeParse(value);
  if (!parsed.success) throw new ApiError(400, "VALIDATION_FAILED", "寫入操作格式無效。", {
    issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
  });
  return parsed.data;
}

function enforceSameOrigin(request: Request, env: Env): void {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method) || env.ENVIRONMENT === "local" || env.ENVIRONMENT === "test") return;
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    throw new ApiError(403, "ACCESS_UNAUTHORIZED", "跨來源寫入請求已拒絕。");
  }
}

async function registerDevice(request: Request, env: Env, requestId: string): Promise<Response> {
  const parsed = registerDeviceSchema.safeParse(await jsonBody(request));
  if (!parsed.success) throw new ApiError(400, "VALIDATION_FAILED", "裝置資料驗證失敗。", {
    issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
  });
  const { operationId, data } = parsed.data;
  const prior = await env.LIFE_DB.prepare("SELECT response_json FROM api_idempotency WHERE operation_id = ?").bind(operationId).first<{ response_json: string }>();
  if (prior) return Response.json(JSON.parse(prior.response_json));
  const now = nowIso();
  const response = { data: { ...data, lastSeenAt: now }, meta: { requestId } };
  await env.LIFE_DB.batch([
    env.LIFE_DB.prepare(
      `INSERT INTO sync_devices (id, display_name, user_agent_summary, last_seen_at, created_at, updated_at, version)
       VALUES (?, ?, ?, ?, ?, ?, 1)
       ON CONFLICT(id) DO UPDATE SET display_name = excluded.display_name, user_agent_summary = excluded.user_agent_summary,
       last_seen_at = excluded.last_seen_at, updated_at = excluded.updated_at, version = sync_devices.version + 1`,
    ).bind(data.id, data.displayName, data.userAgentSummary, now, now, now),
    env.LIFE_DB.prepare("INSERT OR IGNORE INTO sync_cursors (device_id, last_pulled_cursor, updated_at) VALUES (?, 0, ?)").bind(data.id, now),
    env.LIFE_DB.prepare(
      "INSERT INTO api_idempotency (operation_id, request_hash, resource_type, resource_id, response_status, response_json, created_at) VALUES (?, ?, 'sync-device', ?, 200, ?, ?)",
    ).bind(operationId, await sha256(JSON.stringify(data)), data.id, JSON.stringify(response), now),
  ]);
  return Response.json(response);
}

async function saveNotificationPreferences(request: Request, env: Env, requestId: string): Promise<Response> {
  const envelope = parseEnvelope(await jsonBody(request));
  const parsed = notificationPreferenceInputSchema.safeParse(envelope.data);
  if (!parsed.success) throw new ApiError(400, "VALIDATION_FAILED", "通知偏好驗證失敗。", {
    issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
  });
  const data = parsed.data;
  const existing = await env.LIFE_DB.prepare("SELECT response_json FROM api_idempotency WHERE operation_id = ?").bind(envelope.operationId).first<{ response_json: string }>();
  if (existing) return Response.json(JSON.parse(existing.response_json));
  const now = nowIso();
  const encryptedEmail = data.emailRecipient ? await encryptSecret(data.emailRecipient, env.TOKEN_ENCRYPTION_KEY) : null;
  const response = { data: { ...data, emailRecipient: data.emailRecipient ? "已安全保存" : null }, meta: { requestId } };
  await env.LIFE_DB.batch([
    env.LIFE_DB.prepare(
      `INSERT INTO notification_preferences
       (id, timezone, local_send_time, repeat_interval_hours, email_recipient_encrypted,
        modal_for_super_critical, confirmed_at, created_at, updated_at, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
       ON CONFLICT(id) DO UPDATE SET timezone = excluded.timezone, local_send_time = excluded.local_send_time,
       repeat_interval_hours = excluded.repeat_interval_hours, email_recipient_encrypted = excluded.email_recipient_encrypted,
       modal_for_super_critical = excluded.modal_for_super_critical, confirmed_at = excluded.confirmed_at,
       updated_at = excluded.updated_at, version = notification_preferences.version + 1`,
    ).bind(data.id, data.timezone, data.localSendTime, data.repeatIntervalHours, encryptedEmail,
      data.modalForSuperCritical ? 1 : 0, data.confirmedAt, now, now),
    env.LIFE_DB.prepare(
      "INSERT INTO api_idempotency (operation_id, request_hash, resource_type, resource_id, response_status, response_json, created_at) VALUES (?, ?, 'notification-preferences', ?, 200, ?, ?)",
    ).bind(envelope.operationId, await sha256(JSON.stringify(data)), data.id, JSON.stringify(response), now),
    env.LIFE_DB.prepare(
      "UPDATE notification_channels SET enabled = ?, status = ?, updated_at = ?, version = version + 1 WHERE channel_kind = 'EMAIL'",
    ).bind(data.emailRecipient ? 1 : 0, data.emailRecipient && env.RESEND_API_KEY && env.RESEND_FROM ? "READY" : data.emailRecipient ? "UNCONFIGURED" : "DISABLED", now),
  ]);
  return Response.json(response);
}

async function savePushSubscription(request: Request, env: Env, requestId: string): Promise<Response> {
  const schema = z.object({
    operationId: operationIdSchema,
    data: z.object({
      id: z.uuidv7(), deviceId: z.uuidv7(), endpoint: z.url(), expirationTime: z.number().nullable(),
      keys: z.object({ p256dh: z.string().min(20), auth: z.string().min(8) }),
      userAgentSummary: z.string().max(240),
    }),
  });
  const parsed = schema.safeParse(await jsonBody(request));
  if (!parsed.success) throw new ApiError(400, "VALIDATION_FAILED", "Push訂閱資料驗證失敗。", {
    issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
  });
  const { operationId, data } = parsed.data;
  const prior = await env.LIFE_DB.prepare("SELECT response_json FROM api_idempotency WHERE operation_id = ?").bind(operationId).first<{ response_json: string }>();
  if (prior) return Response.json(JSON.parse(prior.response_json));
  const now = nowIso();
  const [endpoint, p256dh, auth] = await Promise.all([
    encryptSecret(data.endpoint, env.TOKEN_ENCRYPTION_KEY),
    encryptSecret(data.keys.p256dh, env.TOKEN_ENCRYPTION_KEY),
    encryptSecret(data.keys.auth, env.TOKEN_ENCRYPTION_KEY),
  ]);
  const response = { data: { id: data.id, deviceId: data.deviceId, status: "ACTIVE", lastSuccessAt: null }, meta: { requestId } };
  await env.LIFE_DB.batch([
    env.LIFE_DB.prepare("UPDATE push_subscriptions SET status = 'DISABLED', disabled_at = ?, updated_at = ?, version = version + 1 WHERE device_id = ? AND status = 'ACTIVE'").bind(now, now, data.deviceId),
    env.LIFE_DB.prepare(
      `INSERT INTO push_subscriptions
       (id, device_id, endpoint_encrypted, p256dh_encrypted, auth_encrypted, content_encoding,
        user_agent_summary, status, created_at, updated_at, version)
       VALUES (?, ?, ?, ?, ?, 'aes128gcm', ?, 'ACTIVE', ?, ?, 1)`,
    ).bind(data.id, data.deviceId, endpoint, p256dh, auth, data.userAgentSummary, now, now),
    env.LIFE_DB.prepare("UPDATE notification_channels SET enabled = 1, status = ?, updated_at = ?, version = version + 1 WHERE channel_kind = 'WEB_PUSH'")
      .bind(env.WEB_PUSH_VAPID_PUBLIC_KEY && env.WEB_PUSH_VAPID_PRIVATE_KEY && env.WEB_PUSH_VAPID_SUBJECT ? "READY" : "UNCONFIGURED", now),
    env.LIFE_DB.prepare(
      "INSERT INTO api_idempotency (operation_id, request_hash, resource_type, resource_id, response_status, response_json, created_at) VALUES (?, ?, 'push-subscription', ?, 201, ?, ?)",
    ).bind(operationId, await sha256(data.endpoint), data.id, JSON.stringify(response), now),
  ]);
  return Response.json(response, { status: 201 });
}

async function performExport(request: Request, env: Env, requestId: string, moduleKey: string | null): Promise<Response> {
  const body = z.object({ operationId: operationIdSchema }).safeParse(await jsonBody(request));
  if (!body.success) throw new ApiError(400, "VALIDATION_FAILED", "匯出操作缺少有效operationId。");
  const now = nowIso();
  if (moduleKey) {
    if (!moduleTables[moduleKey]) throw new ApiError(404, "NOT_FOUND", "不支援的CSV模組。");
    const csv = await buildModuleCsv(env.LIFE_DB, moduleKey);
    const checksum = await sha256(csv);
    await env.LIFE_DB.prepare(
      "INSERT OR IGNORE INTO export_history (id, export_kind, module_key, schema_version, entity_counts_json, checksum, exported_at) VALUES (?, 'MODULE_CSV', ?, 8, '{}', ?, ?)",
    ).bind(body.data.operationId, moduleKey, checksum, now).run();
    return new Response(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="life-manager-${moduleKey}-${now.slice(0, 10)}.csv"`,
        "x-request-id": requestId,
      },
    });
  }
  const exported = await buildFullExport(env.LIFE_DB);
  await env.LIFE_DB.prepare(
    "INSERT OR IGNORE INTO export_history (id, export_kind, module_key, schema_version, entity_counts_json, checksum, exported_at) VALUES (?, 'FULL_JSON', NULL, ?, ?, ?, ?)",
  ).bind(body.data.operationId, exported.schemaVersion, JSON.stringify(exported.entityCounts), exported.checksum, now).run();
  return new Response(JSON.stringify(exported), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="life-manager-full-${now.slice(0, 10)}.json"`,
      "x-request-id": requestId,
    },
  });
}

export async function handleApi(input: {
  request: Request;
  env: Env;
  actorId: string;
  requestId: string;
}): Promise<Response> {
  enforceSameOrigin(input.request, input.env);
  const url = new URL(input.request.url);
  const path = url.pathname;
  if (path === "/api/v1/health" && input.request.method === "GET") {
    const schema = await input.env.LIFE_DB.prepare("SELECT value FROM schema_metadata WHERE key = 'application_schema_version'").first<{ value: string }>();
    return Response.json({ data: { status: "ok", environment: input.env.ENVIRONMENT, schemaVersion: Number(schema?.value ?? 0) }, meta: { requestId: input.requestId } });
  }
  if (path === "/api/v1/dashboard" && input.request.method === "GET") {
    const today = url.searchParams.get("today") ?? localDateAt(new Date(), input.env.APP_TIMEZONE);
    const [todayActions, deadlineWarnings, connections] = await Promise.all([
      listTodayActions(input.env.LIFE_DB, today),
      activeDeadlineWarnings(input.env.LIFE_DB, today),
      input.env.LIFE_DB.prepare(
        "SELECT id, provider_key, display_name, status, token_expires_at, last_attempt_at, last_success_at, last_error_code, provider_definition_version, version FROM provider_connections WHERE disconnected_at IS NULL",
      ).all(),
    ]);
    return Response.json({ data: { today, todayActions, deadlineWarnings, providerConnections: connections.results }, meta: { requestId: input.requestId } });
  }
  if (path === "/api/v1/task-completions" && input.request.method === "POST") {
    const envelope = parseEnvelope(await jsonBody(input.request));
    return Response.json(await completeTask({ db: input.env.LIFE_DB, operationId: envelope.operationId, actorId: input.actorId, requestId: input.requestId, data: envelope.data }), { status: 201 });
  }
  const taskDeferralMatch = path.match(/^\/api\/v1\/task-occurrences\/([0-9a-f-]+)\/defer$/);
  if (taskDeferralMatch && input.request.method === "POST") {
    const envelope = parseEnvelope(await jsonBody(input.request));
    return Response.json(await deferTask({
      db: input.env.LIFE_DB,
      operationId: envelope.operationId,
      actorId: input.actorId,
      requestId: input.requestId,
      data: { ...envelope.data, taskOccurrenceId: identifierSchema.parse(taskDeferralMatch[1]) },
    }));
  }
  if (path === "/api/v1/deadline-completions" && input.request.method === "POST") {
    const envelope = parseEnvelope(await jsonBody(input.request));
    return Response.json(await completeDeadline({ db: input.env.LIFE_DB, operationId: envelope.operationId, actorId: input.actorId, requestId: input.requestId, data: envelope.data }), { status: 201 });
  }
  if (path === "/api/v1/finance/analysis" && input.request.method === "GET") {
    const to = url.searchParams.get("to") ?? localDateAt(new Date(), input.env.APP_TIMEZONE);
    const from = url.searchParams.get("from") ?? `${to.slice(0, 4)}-01-01`;
    const options = financeAnalysisQuerySchema.parse({
      from, to,
      granularity: url.searchParams.get("granularity") ?? "MONTH",
      currencyMode: url.searchParams.get("currencyMode") ?? "TWD",
      nominalCurrency: url.searchParams.get("nominalCurrency") || null,
      accountId: url.searchParams.get("accountId") || null,
      categoryId: url.searchParams.get("categoryId") || null,
      incomeSourceId: url.searchParams.get("incomeSourceId") || null,
      businessId: url.searchParams.get("businessId") || null,
    });
    return Response.json({ data: await financeAnalysis(input.env.LIFE_DB, options), meta: { requestId: input.requestId } });
  }
  if (path === "/api/v1/finance/net-worth" && input.request.method === "GET") {
    return Response.json({ data: await netWorthAnalysis(input.env.LIFE_DB, url.searchParams.get("asOf") ?? nowIso()), meta: { requestId: input.requestId } });
  }
  if (path === "/api/v1/finance/net-worth-trend" && input.request.method === "GET") {
    const to = localDateSchema.parse(url.searchParams.get("to") ?? localDateAt(new Date(), input.env.APP_TIMEZONE));
    const from = localDateSchema.parse(url.searchParams.get("from") ?? `${to.slice(0, 4)}-01-01`);
    if (from > to) throw new ApiError(400, "VALIDATION_FAILED", "結束日期不得早於開始日期。");
    return Response.json({ data: await netWorthTrend(input.env.LIFE_DB, from, to), meta: { requestId: input.requestId } });
  }
  if (path === "/api/v1/social/comparison" && input.request.method === "GET") {
    const to = url.searchParams.get("to") ?? nowIso();
    const from = url.searchParams.get("from") ?? `${to.slice(0, 4)}-01-01T00:00:00.000Z`;
    const query = z.object({
      metricKey: z.string().trim().min(1).max(160), toleranceMinutes: z.coerce.number().int().min(0).max(1440),
      from: z.iso.datetime({ offset: true }), to: z.iso.datetime({ offset: true }),
      groupBy: z.enum(["style", "topic", "platformKey", "accountId", "businessId", "tag"]),
      aggregation: z.enum(["MEAN", "SUM", "MEDIAN", "DISTRIBUTION"]),
      platformKey: z.string().max(120).nullable(), accountId: identifierSchema.nullable(), businessId: identifierSchema.nullable(),
      style: z.string().max(160).nullable(), topic: z.string().max(160).nullable(), tag: z.string().max(160).nullable(),
    }).parse({ metricKey: url.searchParams.get("metricKey"), toleranceMinutes: url.searchParams.get("toleranceMinutes") ?? "15", from, to, groupBy: url.searchParams.get("groupBy") ?? "style", aggregation: url.searchParams.get("aggregation") ?? "MEAN", platformKey: url.searchParams.get("platformKey"), accountId: url.searchParams.get("accountId"), businessId: url.searchParams.get("businessId"), style: url.searchParams.get("style"), topic: url.searchParams.get("topic"), tag: url.searchParams.get("tag") });
    return Response.json({ data: await socialComparisonQuery({ db: input.env.LIFE_DB, exposureMetricKey: query.metricKey, toleranceMinutes: query.toleranceMinutes, from: query.from, to: query.to, groupBy: query.groupBy, exposureAggregation: query.aggregation, filters: { platformKey: query.platformKey, accountId: query.accountId, businessId: query.businessId, style: query.style, topic: query.topic, tag: query.tag } }), meta: { requestId: input.requestId } });
  }
  if (path === "/api/v1/formulas/validate" && input.request.method === "POST") {
    const body = z.object({ expression: z.string().min(1).max(1000) }).parse(await jsonBody(input.request));
    return Response.json({ data: { ast: parseFormula(body.expression) }, meta: { requestId: input.requestId } });
  }
  if (path === "/api/v1/formulas" && input.request.method === "GET") {
    const result = await input.env.LIFE_DB.prepare(
      `SELECT f.id, f.metric_definition_id, f.formula_version, f.expression, f.ast_json, f.window_json,
              f.missing_policy, f.rounding_mode, f.created_at, f.created_by,
              m.key AS metric_key, m.name AS metric_name, m.unit, m.precision
       FROM formula_definitions f JOIN metric_definitions m ON m.id = f.metric_definition_id
       ORDER BY m.key, f.formula_version`,
    ).all<Record<string, unknown>>();
    return Response.json({ data: result.results.map((row) => ({ ...row, ast_json: JSON.parse(String(row.ast_json)), window_json: JSON.parse(String(row.window_json)) })), meta: { requestId: input.requestId } });
  }
  if (path === "/api/v1/formulas" && input.request.method === "POST") {
    const envelope = parseEnvelope(await jsonBody(input.request));
    const parsed = formulaDefinitionInputSchema.safeParse(envelope.data);
    if (!parsed.success) throw new ApiError(400, "VALIDATION_FAILED", "公式定義驗證失敗。", { issues: parsed.error.issues });
    const data = parsed.data;
    const ast = parseFormula(data.expression);
    const referencedKeys = formulaMetricKeys(ast);
    const definitions = referencedKeys.length ? await input.env.LIFE_DB.prepare(
      `SELECT key FROM metric_definitions WHERE key IN (${referencedKeys.map(() => "?").join(",")}) AND deleted_at IS NULL`,
    ).bind(...referencedKeys).all<{ key: string }>() : { results: [] };
    const known = new Set(definitions.results.map((item) => item.key));
    const missing = referencedKeys.filter((key) => !known.has(key));
    if (missing.length) throw new ApiError(422, "FORMULA_MISSING_INPUT", "公式引用尚未建立的指標。", { missing });
    const hash = await sha256(JSON.stringify(data));
    const prior = await input.env.LIFE_DB.prepare("SELECT request_hash, response_json FROM api_idempotency WHERE operation_id = ?").bind(envelope.operationId).first<{ request_hash: string; response_json: string }>();
    if (prior) {
      if (prior.request_hash !== hash) throw new ApiError(409, "IDEMPOTENCY_CONFLICT", "operationId已用於其他公式。");
      return Response.json(JSON.parse(prior.response_json));
    }
    const now = nowIso(); const response = { data: { ...data, ast, createdAt: now, createdBy: input.actorId }, meta: { requestId: input.requestId } };
    await input.env.LIFE_DB.batch([
      input.env.LIFE_DB.prepare(
        `INSERT INTO formula_definitions (id, metric_definition_id, formula_version, expression, ast_json, window_json, missing_policy, rounding_mode, created_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'HALF_UP', ?, ?)`,
      ).bind(data.id, data.metricDefinitionId, data.formulaVersion, data.expression, JSON.stringify(ast), JSON.stringify(data.window), data.missingPolicy, now, input.actorId),
      input.env.LIFE_DB.prepare(
        "INSERT INTO api_idempotency (operation_id, request_hash, resource_type, resource_id, response_status, response_json, created_at) VALUES (?, ?, 'formulas', ?, 201, ?, ?)",
      ).bind(envelope.operationId, hash, data.id, JSON.stringify(response), now),
      input.env.LIFE_DB.prepare(
        "INSERT INTO audit_log (id, request_id, actor_id, entity_type, entity_id, action, before_json, after_json, occurred_at) VALUES (?, ?, ?, 'formulas', ?, 'CREATE', NULL, ?, ?)",
      ).bind(newId(), input.requestId, input.actorId, data.id, JSON.stringify(response.data), now),
      input.env.LIFE_DB.prepare(
        "INSERT INTO sync_change_log (entity_type, entity_id, operation_kind, entity_version, snapshot_json, changed_at, operation_id) VALUES ('formulas', ?, 'APPEND', 1, ?, ?, NULL)",
      ).bind(data.id, JSON.stringify(response.data), now),
    ]);
    return Response.json(response, { status: 201 });
  }
  const calculateFormulaMatch = path.match(/^\/api\/v1\/formulas\/([0-9a-f-]+)\/calculate$/);
  if (calculateFormulaMatch && input.request.method === "POST") {
    const body = z.object({ from: z.iso.datetime({ offset: true }), to: z.iso.datetime({ offset: true }) }).parse(await jsonBody(input.request));
    const formulaId = identifierSchema.parse(calculateFormulaMatch[1]);
    const formula = await input.env.LIFE_DB.prepare(
      `SELECT f.formula_version, f.expression, f.window_json, f.missing_policy, m.key AS metric_key, m.unit, m.precision
       FROM formula_definitions f JOIN metric_definitions m ON m.id = f.metric_definition_id WHERE f.id = ?`,
    ).bind(formulaId).first<{ formula_version: number; expression: string; window_json: string; missing_policy: "FAIL" | "EXCLUDE" | "ZERO"; metric_key: string; unit: string; precision: number }>();
    if (!formula) throw new ApiError(404, "NOT_FOUND", "找不到公式定義。");
    const keys = formulaMetricKeys(parseFormula(formula.expression));
    const inputs: Record<string, { values: string[]; sourceRefs: Array<{ type: string; id: string }> }> = {};
    for (const key of keys) {
      const observations = await input.env.LIFE_DB.prepare(
        `SELECT o.id, o.value_decimal FROM metric_observations o JOIN metric_definitions m ON m.id = o.metric_definition_id
         WHERE m.key = ? AND o.deleted_at IS NULL AND o.value_decimal IS NOT NULL AND o.observed_at BETWEEN ? AND ? ORDER BY o.observed_at`,
      ).bind(key, body.from, body.to).all<{ id: string; value_decimal: string }>();
      if (!observations.results.length && formula.missing_policy === "ZERO") inputs[key] = { values: ["0"], sourceRefs: [] };
      else inputs[key] = { values: observations.results.map((row) => row.value_decimal), sourceRefs: observations.results.map((row) => ({ type: "metric_observation", id: row.id })) };
    }
    const missing = keys.filter((key) => !inputs[key].values.length);
    if (missing.length && formula.missing_policy === "EXCLUDE") {
      return Response.json({ data: { metricKey: formula.metric_key, formulaVersion: formula.formula_version, value: null, unit: formula.unit, precision: formula.precision, quality: "INSUFFICIENT", sampleSize: 0, observationCount: 0, missingCount: missing.length, excludedCount: missing.length, window: { ...JSON.parse(formula.window_json), from: body.from, to: body.to }, filters: {}, grouping: [], aggregation: "FORMULA_AST", denominatorDefinition: formula.expression.includes("/") ? "公式AST中的除法右側運算式" : null, sourceRefs: [], inputValues: [], calculatedAt: nowIso(), ast: parseFormula(formula.expression) }, meta: { requestId: input.requestId } });
    }
    return Response.json({ data: evaluateFormula(formula.metric_key, formula.formula_version, formula.expression, inputs, { unit: formula.unit, precision: formula.precision, window: { ...JSON.parse(formula.window_json), from: body.from, to: body.to } }), meta: { requestId: input.requestId } });
  }
  if (path === "/api/v1/formulas/evaluate" && input.request.method === "POST") {
    const body = z.object({
      metricKey: z.string(), formulaVersion: z.int().positive(), expression: z.string().min(1).max(1000),
      inputs: z.record(z.string(), z.object({ values: z.array(z.string()), sourceRefs: z.array(z.object({ type: z.string(), id: z.string() })) })),
      unit: z.string(), precision: z.int().min(0).max(12), window: z.record(z.string(), z.unknown()),
      filters: z.record(z.string(), z.unknown()).optional(),
    }).parse(await jsonBody(input.request));
    return Response.json({ data: evaluateFormula(body.metricKey, body.formulaVersion, body.expression, body.inputs, body), meta: { requestId: input.requestId } });
  }
  if (path === "/api/v1/imports/csv/preview" && input.request.method === "POST") {
    const form = await input.request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError(400, "VALIDATION_FAILED", "請選擇CSV檔案。");
    return Response.json({ data: await previewCsv(await file.arrayBuffer()), meta: { requestId: input.requestId } });
  }
  if (path === "/api/v1/imports/firstrade" && input.request.method === "POST") {
    return Response.json(await importFirstradeCsv({
      db: input.env.LIFE_DB,
      form: await input.request.formData(),
      actorId: input.actorId,
      requestId: input.requestId,
    }), { status: 201 });
  }
  if (path === "/api/v1/imports/structured/preview" && input.request.method === "POST") {
    const response = await previewStructuredCsv(await input.request.formData());
    return Response.json({ ...response, meta: { requestId: input.requestId } });
  }
  if (path === "/api/v1/imports/structured" && input.request.method === "POST") {
    return Response.json(await importStructuredCsv({ db: input.env.LIFE_DB, form: await input.request.formData(), actorId: input.actorId, requestId: input.requestId }), { status: 201 });
  }
  if (path === "/api/v1/imports" && input.request.method === "GET") {
    const result = await input.env.LIFE_DB.prepare(
      `SELECT id, module_key, provider_key, account_id, status, original_filename, file_sha256, encoding, delimiter,
              total_rows, imported_rows, duplicate_rows, error_rows, started_at, completed_at, version
       FROM import_batches ORDER BY started_at DESC LIMIT 100`,
    ).all();
    return Response.json({ data: result.results, meta: { requestId: input.requestId } });
  }
  if (path === "/api/v1/entity-tags" && input.request.method === "GET") {
    const entityType = z.enum(["content_asset", "task", "business", "event", "metric"]).parse(url.searchParams.get("entityType"));
    const entityId = identifierSchema.parse(url.searchParams.get("entityId"));
    const rows = await input.env.LIFE_DB.prepare(`SELECT et.entity_type, et.entity_id, et.tag_id, t.name, t.color_token, et.created_at
      FROM entity_tags et JOIN tags t ON t.id = et.tag_id WHERE et.entity_type = ? AND et.entity_id = ? AND t.deleted_at IS NULL ORDER BY t.name`).bind(entityType, entityId).all();
    return Response.json({ data: rows.results, meta: { requestId: input.requestId } });
  }
  if (path === "/api/v1/entity-link-targets" && input.request.method === "GET") {
    const [incomeSources, expenseCategories, tasks, events, metrics, content, savedViews] = await Promise.all([
      input.env.LIFE_DB.prepare("SELECT id, name FROM income_sources WHERE deleted_at IS NULL AND archived_at IS NULL ORDER BY name").all(),
      input.env.LIFE_DB.prepare("SELECT id, name FROM finance_categories WHERE kind = 'EXPENSE' AND deleted_at IS NULL AND archived_at IS NULL ORDER BY name").all(),
      input.env.LIFE_DB.prepare("SELECT id, title FROM task_definitions WHERE deleted_at IS NULL AND archived_at IS NULL ORDER BY title").all(),
      input.env.LIFE_DB.prepare("SELECT id, title FROM events WHERE deleted_at IS NULL AND archived_at IS NULL ORDER BY starts_at DESC LIMIT 100").all(),
      input.env.LIFE_DB.prepare("SELECT id, name FROM metric_definitions WHERE deleted_at IS NULL AND archived_at IS NULL ORDER BY name").all(),
      input.env.LIFE_DB.prepare("SELECT id, title FROM content_assets WHERE deleted_at IS NULL AND archived_at IS NULL ORDER BY title").all(),
      input.env.LIFE_DB.prepare("SELECT id, name FROM saved_views WHERE deleted_at IS NULL AND archived_at IS NULL ORDER BY name").all(),
    ]);
    return Response.json({ data: {
      INCOME_SOURCE: incomeSources.results, EXPENSE_CATEGORY: expenseCategories.results, TASK: tasks.results,
      EVENT: events.results, METRIC: metrics.results, CONTENT: content.results, SAVED_VIEW: savedViews.results,
    }, meta: { requestId: input.requestId } });
  }
  if (path === "/api/v1/entity-tags" && input.request.method === "POST") {
    const body = z.object({ operationId: operationIdSchema, data: z.object({ entityType: z.enum(["content_asset", "task", "business", "event", "metric"]), entityId: identifierSchema, tagId: identifierSchema }) }).parse(await jsonBody(input.request));
    const prior = await input.env.LIFE_DB.prepare("SELECT response_json FROM api_idempotency WHERE operation_id = ?").bind(body.operationId).first<{ response_json: string }>();
    if (prior) return Response.json(JSON.parse(prior.response_json));
    const tableByType = { content_asset: "content_assets", task: "task_definitions", business: "businesses", event: "events", metric: "metric_definitions" } as const;
    const [entity, tag] = await Promise.all([
      input.env.LIFE_DB.prepare(`SELECT id FROM ${tableByType[body.data.entityType]} WHERE id = ? AND deleted_at IS NULL`).bind(body.data.entityId).first<{ id: string }>(),
      input.env.LIFE_DB.prepare("SELECT id, name FROM tags WHERE id = ? AND deleted_at IS NULL AND archived_at IS NULL").bind(body.data.tagId).first<{ id: string; name: string }>(),
    ]);
    if (!entity || !tag) throw new ApiError(404, "NOT_FOUND", "找不到要加標籤的資料或標籤。");
    const now = nowIso(); const response = { data: { ...body.data, tagName: tag.name, createdAt: now }, meta: { requestId: input.requestId } };
    await input.env.LIFE_DB.batch([
      input.env.LIFE_DB.prepare("INSERT OR IGNORE INTO entity_tags (entity_type, entity_id, tag_id, created_at) VALUES (?, ?, ?, ?)").bind(body.data.entityType, body.data.entityId, body.data.tagId, now),
      input.env.LIFE_DB.prepare("INSERT INTO api_idempotency (operation_id, request_hash, resource_type, resource_id, response_status, response_json, created_at) VALUES (?, ?, 'entity-tag', ?, 201, ?, ?)").bind(body.operationId, await sha256(JSON.stringify(body.data)), `${body.data.entityId}:${body.data.tagId}`, JSON.stringify(response), now),
      input.env.LIFE_DB.prepare("INSERT INTO audit_log (id, request_id, actor_id, entity_type, entity_id, action, before_json, after_json, occurred_at) VALUES (?, ?, ?, 'entity-tags', ?, 'LINK', NULL, ?, ?)").bind(newId(), input.requestId, input.actorId, body.data.entityId, JSON.stringify(response.data), now),
    ]);
    return Response.json(response, { status: 201 });
  }
  const importRowsMatch = path.match(/^\/api\/v1\/imports\/([0-9a-f-]+)\/rows$/);
  if (importRowsMatch && input.request.method === "GET") {
    const result = await input.env.LIFE_DB.prepare(
      `SELECT id, row_number, status, normalized_entity_type, normalized_entity_id, errors_json
       FROM import_rows WHERE import_batch_id = ? ORDER BY row_number LIMIT 1000`,
    ).bind(importRowsMatch[1]).all();
    return Response.json({ data: result.results, meta: { requestId: input.requestId } });
  }
  if (path === "/api/v1/sync/devices" && input.request.method === "POST") return registerDevice(input.request, input.env, input.requestId);
  if (path === "/api/v1/sync/batch" && input.request.method === "POST") {
    return Response.json(await applySyncBatch({ db: input.env.LIFE_DB, body: await jsonBody(input.request), actorId: input.actorId, requestId: input.requestId }));
  }
  if (path === "/api/v1/sync/changes" && input.request.method === "GET") {
    const deviceId = identifierSchema.parse(url.searchParams.get("deviceId"));
    const after = z.coerce.number().int().nonnegative().parse(url.searchParams.get("after") ?? "0");
    const limit = z.coerce.number().int().min(1).max(500).parse(url.searchParams.get("limit") ?? "200");
    const data = await pullChanges(input.env.LIFE_DB, deviceId, after, limit);
    return Response.json({ data, meta: { requestId: input.requestId } });
  }
  if (path === "/api/v1/sync/conflicts" && input.request.method === "GET") {
    const rows = await input.env.LIFE_DB.prepare(
      "SELECT id, operation_id, device_id, entity_type, entity_id, base_version, server_version, local_payload_json, server_payload_json, field_diff_json, status, created_at FROM conflict_records WHERE status = 'OPEN' ORDER BY created_at",
    ).all<Record<string, unknown>>();
    return Response.json({ data: rows.results, meta: { requestId: input.requestId } });
  }
  const conflictResolution = path.match(/^\/api\/v1\/sync\/conflicts\/([^/]+)\/resolve$/);
  if (conflictResolution && input.request.method === "POST") {
    const body = z.object({
      operationId: operationIdSchema,
      data: z.object({
        resolution: z.enum(["LOCAL", "SERVER", "MERGED"]),
        mergedPayload: z.record(z.string(), z.unknown()).optional(),
      }),
    }).parse(await jsonBody(input.request));
    return Response.json(await resolveSyncConflict({
      db: input.env.LIFE_DB,
      conflictId: identifierSchema.parse(conflictResolution[1]),
      resolution: body.data.resolution,
      mergedPayload: body.data.mergedPayload,
      actorId: input.actorId,
      requestId: input.requestId,
    }));
  }
  if (path === "/api/v1/notifications/preferences" && input.request.method === "GET") {
    const row = await input.env.LIFE_DB.prepare(
      "SELECT id, timezone, local_send_time, repeat_interval_hours, modal_for_super_critical, confirmed_at, updated_at, version FROM notification_preferences ORDER BY updated_at DESC LIMIT 1",
    ).first();
    return Response.json({ data: row, meta: { requestId: input.requestId } });
  }
  if (path === "/api/v1/notifications/preferences" && input.request.method === "POST") return saveNotificationPreferences(input.request, input.env, input.requestId);
  if (path === "/api/v1/notifications/channels" && input.request.method === "GET") {
    const rows = await input.env.LIFE_DB.prepare("SELECT channel_kind, enabled, status, last_success_at, last_error_code, last_error_message_redacted, version FROM notification_channels ORDER BY channel_kind").all();
    return Response.json({ data: rows.results, meta: { requestId: input.requestId } });
  }
  if (path === "/api/v1/notifications/test" && input.request.method === "POST") {
    const body = z.object({ operationId: operationIdSchema, data: z.object({ deadlineId: identifierSchema, channel: z.enum(["IN_APP", "WEB_PUSH", "EMAIL"]) }) }).parse(await jsonBody(input.request));
    const prior = await input.env.LIFE_DB.prepare("SELECT response_json FROM api_idempotency WHERE operation_id = ?").bind(body.operationId).first<{ response_json: string }>();
    if (prior) return Response.json(JSON.parse(prior.response_json));
    const result = await sendDeadlineNotificationTest({ env: input.env, deadlineId: body.data.deadlineId, channel: body.data.channel, operationId: body.operationId });
    const response = { data: result, meta: { requestId: input.requestId } }; const now = nowIso();
    await input.env.LIFE_DB.prepare("INSERT INTO api_idempotency (operation_id, request_hash, resource_type, resource_id, response_status, response_json, created_at) VALUES (?, ?, 'notification-test', ?, 200, ?, ?)")
      .bind(body.operationId, await sha256(JSON.stringify(body.data)), body.data.deadlineId, JSON.stringify(response), now).run();
    return Response.json(response);
  }
  if (path === "/api/v1/push-subscriptions" && input.request.method === "POST") return savePushSubscription(input.request, input.env, input.requestId);
  if (path === "/api/v1/push-subscriptions/disable" && input.request.method === "POST") {
    const body = z.object({ operationId: operationIdSchema, data: z.object({ deviceId: identifierSchema }) }).parse(await jsonBody(input.request));
    const prior = await input.env.LIFE_DB.prepare("SELECT response_json FROM api_idempotency WHERE operation_id = ?").bind(body.operationId).first<{ response_json: string }>();
    if (prior) return Response.json(JSON.parse(prior.response_json));
    const now = nowIso();
    const active = await input.env.LIFE_DB.prepare("SELECT id FROM push_subscriptions WHERE device_id = ? AND status = 'ACTIVE' AND disabled_at IS NULL").bind(body.data.deviceId).all<{ id: string }>();
    const response = { data: { deviceId: body.data.deviceId, disabledSubscriptions: active.results.length, status: "DISABLED" }, meta: { requestId: input.requestId } };
    await input.env.LIFE_DB.batch([
      input.env.LIFE_DB.prepare("UPDATE push_subscriptions SET status = 'DISABLED', disabled_at = ?, updated_at = ?, version = version + 1 WHERE device_id = ? AND status = 'ACTIVE' AND disabled_at IS NULL").bind(now, now, body.data.deviceId),
      input.env.LIFE_DB.prepare(`UPDATE notification_channels SET
        enabled = CASE WHEN EXISTS (SELECT 1 FROM push_subscriptions WHERE status = 'ACTIVE' AND disabled_at IS NULL AND device_id <> ?) THEN 1 ELSE 0 END,
        status = CASE WHEN EXISTS (SELECT 1 FROM push_subscriptions WHERE status = 'ACTIVE' AND disabled_at IS NULL AND device_id <> ?) THEN status ELSE 'DISABLED' END,
        updated_at = ?, version = version + 1 WHERE channel_kind = 'WEB_PUSH'`).bind(body.data.deviceId, body.data.deviceId, now),
      input.env.LIFE_DB.prepare("INSERT INTO api_idempotency (operation_id, request_hash, resource_type, resource_id, response_status, response_json, created_at) VALUES (?, ?, 'push-subscription-disable', ?, 200, ?, ?)").bind(body.operationId, await sha256(JSON.stringify(body.data)), body.data.deviceId, JSON.stringify(response), now),
      input.env.LIFE_DB.prepare("INSERT INTO audit_log (id, request_id, actor_id, entity_type, entity_id, action, before_json, after_json, occurred_at) VALUES (?, ?, ?, 'push-subscriptions', ?, 'DISABLE_DEVICE', ?, ?, ?)").bind(newId(), input.requestId, input.actorId, body.data.deviceId, JSON.stringify({ activeSubscriptionIds: active.results.map((row) => row.id) }), JSON.stringify(response.data), now),
    ]);
    return Response.json(response);
  }
  if (path === "/api/v1/exports/full" && input.request.method === "POST") return performExport(input.request, input.env, input.requestId, null);
  if (path === "/api/v1/imports/full" && input.request.method === "POST") return Response.json(await importFullExport({ db: input.env.LIFE_DB, form: await input.request.formData(), actorId: input.actorId, requestId: input.requestId }), { status: 201 });
  const csvExport = path.match(/^\/api\/v1\/exports\/([a-z-]+)\.csv$/);
  if (csvExport && input.request.method === "POST") return performExport(input.request, input.env, input.requestId, csvExport[1]);
  const authorize = path.match(/^\/api\/v1\/integrations\/(youtube|instagram)\/authorize$/);
  if (authorize && input.request.method === "POST") {
    const body = z.object({ operationId: operationIdSchema }).parse(await jsonBody(input.request));
    return startOAuth({ request: input.request, env: input.env, providerKey: authorize[1], operationId: body.operationId, requestId: input.requestId });
  }
  if (path === "/api/v1/integrations" && input.request.method === "GET") {
    const rows = await input.env.LIFE_DB.prepare(
      `SELECT id, provider_key, external_account_id, display_name, status, granted_scopes_json, token_expires_at,
              last_attempt_at, last_success_at, last_error_code, last_error_message_redacted,
              provider_definition_version, version,
              (SELECT j.next_run_at FROM provider_sync_jobs j WHERE j.connection_id = provider_connections.id ORDER BY j.updated_at DESC LIMIT 1) AS next_run_at,
              (SELECT j.status FROM provider_sync_jobs j WHERE j.connection_id = provider_connections.id ORDER BY j.updated_at DESC LIMIT 1) AS sync_job_status,
              (SELECT j.attempt FROM provider_sync_jobs j WHERE j.connection_id = provider_connections.id ORDER BY j.updated_at DESC LIMIT 1) AS sync_attempt
       FROM provider_connections ORDER BY provider_key, display_name`,
    ).all();
    return Response.json({ data: rows.results, meta: { requestId: input.requestId } });
  }
  const syncMatch = path.match(/^\/api\/v1\/integrations\/([0-9a-f-]+)\/sync$/);
  if (syncMatch && input.request.method === "POST") {
    const body = z.object({ operationId: operationIdSchema, from: z.iso.date(), to: z.iso.date() }).parse(await jsonBody(input.request));
    const prior = await input.env.LIFE_DB.prepare("SELECT response_json FROM api_idempotency WHERE operation_id = ?").bind(body.operationId).first<{ response_json: string }>();
    if (prior) return Response.json(JSON.parse(prior.response_json));
    const result = await syncProviderConnection({ env: input.env, connectionId: syncMatch[1], triggerKind: "MANUAL", requestId: input.requestId, from: body.from, to: body.to });
    const response = { data: result, meta: { requestId: input.requestId } };
    await input.env.LIFE_DB.prepare(
      "INSERT INTO api_idempotency (operation_id, request_hash, resource_type, resource_id, response_status, response_json, created_at) VALUES (?, ?, 'provider-sync', ?, 200, ?, ?)",
    ).bind(body.operationId, await sha256(JSON.stringify(body)), syncMatch[1], JSON.stringify(response), nowIso()).run();
    return Response.json(response);
  }
  const disconnectMatch = path.match(/^\/api\/v1\/integrations\/([0-9a-f-]+)\/disconnect$/);
  if (disconnectMatch && input.request.method === "POST") {
    const body = z.object({ operationId: operationIdSchema }).parse(await jsonBody(input.request));
    const replay = await input.env.LIFE_DB.prepare("SELECT response_json FROM api_idempotency WHERE operation_id = ?").bind(body.operationId).first<{ response_json: string }>();
    if (replay) return Response.json(JSON.parse(replay.response_json));
    const { provider, credentials } = await connectionCredentials(input.env, disconnectMatch[1]);
    await provider.disconnect(credentials);
    const now = nowIso();
    await input.env.LIFE_DB.batch([
      input.env.LIFE_DB.prepare(
        "UPDATE provider_connections SET status = 'DISCONNECTED', encrypted_access_token = NULL, encrypted_refresh_token = NULL, disconnected_at = ?, updated_at = ?, version = version + 1 WHERE id = ?",
      ).bind(now, now, disconnectMatch[1]),
      input.env.LIFE_DB.prepare(
        "INSERT INTO api_idempotency (operation_id, request_hash, resource_type, resource_id, response_status, response_json, created_at) VALUES (?, ?, 'provider-disconnect', ?, 200, ?, ?)",
      ).bind(body.operationId, body.operationId, disconnectMatch[1], JSON.stringify({ data: { status: "DISCONNECTED" }, meta: { requestId: input.requestId } }), now),
    ]);
    return Response.json({ data: { status: "DISCONNECTED" }, meta: { requestId: input.requestId } });
  }
  const crud = await handleCrudRoute({ request: input.request, db: input.env.LIFE_DB, path, actorId: input.actorId, requestId: input.requestId });
  if (crud) return crud;
  throw new ApiError(404, "NOT_FOUND", "找不到此API路徑。");
}
