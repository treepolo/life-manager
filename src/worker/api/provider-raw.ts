import { sha256 } from "@/core/crypto/secrets";
import { newId, nowIso } from "@/core/database/d1";
import type { ProviderRawPayload } from "@/integrations/providers/contract";
import type { Env } from "@/worker/env";

export interface RawWithId extends ProviderRawPayload { rawId: string }

export interface PreparedRawPayloadWrites {
  stored: RawWithId[];
  statements: D1PreparedStatement[];
}

export async function prepareRawPayloadWrites(
  env: Env,
  providerKey: string,
  runId: string,
  payloads: ProviderRawPayload[],
  linkedAt = nowIso(),
): Promise<PreparedRawPayloadWrites> {
  const stored: RawWithId[] = [];
  const statements: D1PreparedStatement[] = [];
  const resolvedRawIds = new Map<string, string>();

  for (const [payloadOrder, payload] of payloads.entries()) {
    const serialized = JSON.stringify(payload.payload);
    const digest = await sha256(serialized);
    const identity = `${payload.kind}\u0000${digest}`;
    let rawId = resolvedRawIds.get(identity);

    if (!rawId) {
      const existing = await env.LIFE_DB.prepare(
        "SELECT id FROM provider_raw_payloads WHERE provider_key = ? AND payload_kind = ? AND sha256 = ?",
      ).bind(providerKey, payload.kind, digest).first<{ id: string }>();
      rawId = existing?.id ?? newId();
      resolvedRawIds.set(identity, rawId);

      if (!existing) {
        statements.push(env.LIFE_DB.prepare(
          `INSERT INTO provider_raw_payloads
           (id, provider_key, sync_run_id, payload_kind, external_id, observed_at, sha256, payload_json, api_version, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(rawId, providerKey, runId, payload.kind, payload.externalId, payload.observedAt, digest,
          serialized, payload.apiVersion, linkedAt));
      }
    }

    statements.push(env.LIFE_DB.prepare(
      `INSERT INTO provider_sync_run_payloads
       (sync_run_id, payload_order, raw_payload_id, linked_at)
       VALUES (?, ?, ?, ?)`,
    ).bind(runId, payloadOrder, rawId, linkedAt));
    stored.push({ ...payload, rawId });
  }

  return { stored, statements };
}
