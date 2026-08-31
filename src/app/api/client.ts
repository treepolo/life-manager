import { v7 as uuidv7 } from "uuid";

import { gatedFetch } from "@/core/network/request-gate";
import { cacheServerEntities, cachedEntities, commitOfflineMutation } from "@/core/sync/client-db";

export interface ApiErrorBody {
  error: { code: string; message: string; details: Record<string, unknown>; requestId: string };
}

export class ClientApiError extends Error {
  constructor(public readonly status: number, public readonly body: ApiErrorBody) {
    super(body.error.message);
  }
}

async function responseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json() as ApiErrorBody;
    throw new ClientApiError(response.status, body);
  }
  return response.json() as Promise<T>;
}

export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  return responseJson<T>(await gatedFetch(path, { signal, headers: { accept: "application/json" } }));
}

export async function apiPost<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  return responseJson<T>(await gatedFetch(path, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
    signal,
  }));
}

export async function apiPostLongRunning<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  return responseJson<T>(await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
    signal,
  }));
}

function normalizeLegacyFinancialData(resource: string, data: Record<string, unknown>): Record<string, unknown> {
  if (resource === "financial-history" && data.metricKind === "SAVINGS") return { ...data, metricKind: "NET_WORTH" };
  if (resource === "financial-goals" && data.goalKind === "SAVINGS") return { ...data, goalKind: "NET_WORTH" };
  return data;
}

function resourceQuery(query: string, cursor?: string): string {
  const params = new URLSearchParams(query.startsWith("?") ? query.slice(1) : query);
  params.set("limit", "100");
  if (cursor) params.set("cursor", cursor);
  else params.delete("cursor");
  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}

export async function listResource<T extends { id: string }>(resource: string, query = "", signal?: AbortSignal): Promise<T[]> {
  try {
    const items: T[] = [];
    let cursor: string | undefined;
    do {
      const response = await apiGet<{ data: T[]; meta?: { nextCursor?: string | null } }>(
        `/api/v1/${resource}${resourceQuery(query, cursor)}`,
        signal,
      );
      items.push(...response.data.map((item) => normalizeLegacyFinancialData(resource, item as unknown as Record<string, unknown>) as unknown as T));
      cursor = response.meta?.nextCursor ?? undefined;
    } while (cursor);
    await cacheServerEntities(resource, items as unknown as Array<Record<string, unknown>>);
    return items;
  } catch (error) {
    if (!navigator.onLine || error instanceof TypeError) {
      const includeArchived = new URLSearchParams(query.startsWith("?") ? query.slice(1) : query).get("includeArchived") === "true";
      return (await cachedEntities(resource))
        .filter((entry) => !entry.data.deletedAt && (includeArchived || !entry.data.archivedAt))
        .map((entry) => normalizeLegacyFinancialData(resource, entry.data) as unknown as T);
    }
    throw error;
  }
}

export async function createResource<T extends Record<string, unknown>>(
  resource: string,
  data: T & { id?: string },
): Promise<Record<string, unknown>> {
  const entityId = data.id ?? uuidv7();
  const full = { ...data, id: entityId };
  const operationId = uuidv7();
  if (!navigator.onLine) {
    await commitOfflineMutation({ entityType: resource, entityId, kind: "UPSERT", baseVersion: null, payload: full });
    return { ...full, version: 0, pending: true };
  }
  try {
    const response = await apiPost<{ data: Record<string, unknown> }>(`/api/v1/${resource}`, { operationId, data: full });
    const normalized = normalizeLegacyFinancialData(resource, response.data);
    await cacheServerEntities(resource, [normalized]);
    return normalized;
  } catch (error) {
    if (error instanceof TypeError) {
      await commitOfflineMutation({ entityType: resource, entityId, kind: "UPSERT", baseVersion: null, payload: full });
      return { ...full, version: 0, pending: true };
    }
    throw error;
  }
}

export async function updateResource(
  resource: string,
  entityId: string,
  baseVersion: number,
  patch: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const operationId = uuidv7();
  if (!navigator.onLine) {
    await commitOfflineMutation({ entityType: resource, entityId, kind: "UPSERT", baseVersion, payload: patch });
    return { id: entityId, ...patch, version: baseVersion, pending: true };
  }
  try {
    const response = await responseJson<{ data: Record<string, unknown> }>(await gatedFetch(`/api/v1/${resource}/${entityId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ operationId, baseVersion, data: patch }),
    }));
    const normalized = normalizeLegacyFinancialData(resource, response.data);
    await cacheServerEntities(resource, [normalized]);
    return normalized;
  } catch (error) {
    if (error instanceof TypeError) {
      await commitOfflineMutation({ entityType: resource, entityId, kind: "UPSERT", baseVersion, payload: patch });
      return { id: entityId, ...patch, version: baseVersion, pending: true };
    }
    throw error;
  }
}

export async function archiveResource(resource: string, entityId: string, baseVersion: number, restore = false): Promise<Record<string, unknown>> {
  const operationId = uuidv7();
  const kind = restore ? "RESTORE" : "ARCHIVE";
  if (!navigator.onLine) {
    await commitOfflineMutation({ entityType: resource, entityId, kind, baseVersion, payload: {} });
    return { id: entityId, version: baseVersion, pending: true, archivedAt: restore ? null : new Date().toISOString() };
  }
  try {
    const response = await apiPost<{ data: Record<string, unknown> }>(
      `/api/v1/${resource}/${entityId}/${restore ? "restore" : "archive"}`,
      { operationId, baseVersion, data: {} },
    );
    const normalized = normalizeLegacyFinancialData(resource, response.data);
    await cacheServerEntities(resource, [normalized]);
    return normalized;
  } catch (error) {
    if (error instanceof TypeError) {
      await commitOfflineMutation({ entityType: resource, entityId, kind, baseVersion, payload: {} });
      return { id: entityId, version: baseVersion, pending: true };
    }
    throw error;
  }
}

export async function deleteResource(resource: string, entityId: string, baseVersion: number): Promise<Record<string, unknown>> {
  const operationId = uuidv7();
  if (!navigator.onLine) {
    await commitOfflineMutation({ entityType: resource, entityId, kind: "DELETE", baseVersion, payload: {} });
    return { id: entityId, deletedAt: new Date().toISOString(), version: baseVersion, pending: true };
  }
  try {
    const response = await responseJson<{ data: Record<string, unknown> }>(await gatedFetch(`/api/v1/${resource}/${entityId}`, {
      method: "DELETE",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ operationId, baseVersion, data: {} }),
    }));
    const normalized = normalizeLegacyFinancialData(resource, response.data);
    await cacheServerEntities(resource, [normalized]);
    return normalized;
  } catch (error) {
    if (error instanceof TypeError) {
      await commitOfflineMutation({ entityType: resource, entityId, kind: "DELETE", baseVersion, payload: {} });
      return { id: entityId, deletedAt: new Date().toISOString(), version: baseVersion, pending: true };
    }
    throw error;
  }
}
