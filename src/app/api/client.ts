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

export async function listResource<T extends Record<string, unknown>>(resource: string, query = "", signal?: AbortSignal): Promise<T[]> {
  try {
    const response = await apiGet<{ data: T[] }>(`/api/v1/${resource}${query}`, signal);
    await cacheServerEntities(resource, response.data);
    return response.data;
  } catch (error) {
    if (!navigator.onLine || error instanceof TypeError) {
      const includeArchived = new URLSearchParams(query.startsWith("?") ? query.slice(1) : query).get("includeArchived") === "true";
      return (await cachedEntities(resource))
        .filter((entry) => !entry.data.deletedAt && (includeArchived || !entry.data.archivedAt))
        .map((entry) => entry.data as T);
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
    await cacheServerEntities(resource, [response.data]);
    return response.data;
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
    await cacheServerEntities(resource, [response.data]);
    return response.data;
  } catch (error) {
    if (error instanceof TypeError) {
      await commitOfflineMutation({ entityType: resource, entityId, kind: "UPSERT", baseVersion, payload: patch });
      return { id: entityId, ...patch, version: baseVersion, pending: true };
    }
    throw error;
  }
}

export async function archiveResource(resource: string, entityId: string, baseVersion: number, restore = false): Promise<void> {
  const operationId = uuidv7();
  if (!navigator.onLine) {
    await commitOfflineMutation({ entityType: resource, entityId, kind: restore ? "RESTORE" : "ARCHIVE", baseVersion, payload: {} });
    return;
  }
  try {
    await apiPost(`/api/v1/${resource}/${entityId}/${restore ? "restore" : "archive"}`, { operationId, baseVersion, data: {} });
  } catch (error) {
    if (error instanceof TypeError) {
      await commitOfflineMutation({ entityType: resource, entityId, kind: restore ? "RESTORE" : "ARCHIVE", baseVersion, payload: {} });
      return;
    }
    throw error;
  }
}
