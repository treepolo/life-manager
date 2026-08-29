import { z } from "zod";

import { sha256 } from "@/core/crypto/secrets";
import { nowIso } from "@/core/database/d1";
import { ApiError } from "@/core/errors/api-error";
import { applySyncBatch, pullChanges, resolveSyncConflict } from "@/core/sync/server";
import { registerDeviceSchema } from "@/core/sync/schema";
import { identifierSchema, operationIdSchema } from "@/core/validation/common";
import { handleCrudRoute } from "@/worker/api/crud";
import type { Env } from "@/worker/env";

async function jsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ApiError(400, "VALIDATION_FAILED", "請求內容必須是有效JSON。");
  }
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
  if (!parsed.success) {
    throw new ApiError(400, "VALIDATION_FAILED", "裝置資料驗證失敗。", {
      issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    });
  }
  const { operationId, data } = parsed.data;
  const requestHash = await sha256(JSON.stringify(data));
  const prior = await env.LIFE_DB.prepare(
    "SELECT request_hash, response_json FROM api_idempotency WHERE operation_id = ?",
  ).bind(operationId).first<{ request_hash: string; response_json: string }>();
  if (prior) {
    if (prior.request_hash !== requestHash) {
      throw new ApiError(409, "IDEMPOTENCY_CONFLICT", "相同operationId已用於其他裝置資料。");
    }
    return Response.json(JSON.parse(prior.response_json));
  }

  const now = nowIso();
  const response = { data: { ...data, lastSeenAt: now }, meta: { requestId } };
  await env.LIFE_DB.batch([
    env.LIFE_DB.prepare(
      `INSERT INTO sync_devices (id, display_name, user_agent_summary, last_seen_at, created_at, updated_at, version)
       VALUES (?, ?, ?, ?, ?, ?, 1)
       ON CONFLICT(id) DO UPDATE SET
         display_name = excluded.display_name,
         user_agent_summary = excluded.user_agent_summary,
         last_seen_at = excluded.last_seen_at,
         updated_at = excluded.updated_at,
         version = sync_devices.version + 1`,
    ).bind(data.id, data.displayName, data.userAgentSummary, now, now, now),
    env.LIFE_DB.prepare(
      "INSERT OR IGNORE INTO sync_cursors (device_id, last_pulled_cursor, updated_at) VALUES (?, 0, ?)",
    ).bind(data.id, now),
    env.LIFE_DB.prepare(
      `INSERT INTO api_idempotency
       (operation_id, request_hash, resource_type, resource_id, response_status, response_json, created_at)
       VALUES (?, ?, 'sync-device', ?, 200, ?, ?)`,
    ).bind(operationId, requestHash, data.id, JSON.stringify(response), now),
  ]);
  return Response.json(response);
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
    const schema = await input.env.LIFE_DB.prepare(
      "SELECT value FROM schema_metadata WHERE key = 'application_schema_version'",
    ).first<{ value: string }>();
    return Response.json({
      data: {
        status: "ok",
        environment: input.env.ENVIRONMENT,
        schemaVersion: Number(schema?.value ?? 0),
      },
      meta: { requestId: input.requestId },
    });
  }

  if (path === "/api/v1/sync/devices" && input.request.method === "POST") {
    return registerDevice(input.request, input.env, input.requestId);
  }

  if (path === "/api/v1/sync/batch" && input.request.method === "POST") {
    return Response.json(await applySyncBatch({
      db: input.env.LIFE_DB,
      body: await jsonBody(input.request),
      actorId: input.actorId,
      requestId: input.requestId,
    }));
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
      `SELECT id, operation_id, device_id, entity_type, entity_id, base_version, server_version,
              local_payload_json, server_payload_json, field_diff_json, status, created_at
       FROM conflict_records WHERE status = 'OPEN' ORDER BY created_at`,
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

  const crud = await handleCrudRoute({
    request: input.request,
    db: input.env.LIFE_DB,
    path,
    actorId: input.actorId,
    requestId: input.requestId,
  });
  if (crud) return crud;

  throw new ApiError(404, "NOT_FOUND", "找不到此API路徑。");
}
