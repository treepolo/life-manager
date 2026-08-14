import { v7 as uuidv7 } from "uuid";

import { gatedFetch } from "@/core/network/request-gate";
import {
  cacheServerEntities,
  cachedEntities,
  commitOfflineMutation,
  commitOfflineMutations,
  localDatabase,
} from "@/core/sync/client-db";

export interface ApiErrorBody {
  error: { code: string; message: string; details: Record<string, unknown>; requestId: string };
}

export class ClientApiError extends Error {
  constructor(public readonly status: number, public readonly body: ApiErrorBody) {
    super(body.error.message);
  }
}

export interface TaskWithInitialScheduleCommand {
  operationId: string;
  task: Record<string, unknown> & { id: string };
  schedule: (Record<string, unknown> & { id: string }) | null;
}

export interface TaskWithInitialScheduleResult {
  data: {
    task: Record<string, unknown> & { id: string };
    schedule: (Record<string, unknown> & { id: string }) | null;
  };
  meta: { requestId?: string; idempotentReplay?: boolean; offline?: boolean };
  operationId: string;
  pending: boolean;
}

export class PendingTaskCommandError extends Error {
  constructor(public readonly operationId: string) {
    super("網路中斷：此次保存已保留，可於恢復後從本頁重新提交同一操作。");
    this.name = "PendingTaskCommandError";
  }
}

const PENDING_TASK_COMMAND_PREFIX = "pending-task-with-initial-schedule:";

function pendingTaskCommandKey(operationId: string): string {
  return `${PENDING_TASK_COMMAND_PREFIX}${operationId}`;
}

async function savePendingTaskCommand(command: TaskWithInitialScheduleCommand): Promise<void> {
  await (await localDatabase()).put("appSettings", { key: pendingTaskCommandKey(command.operationId), value: command });
}

export async function listPendingTaskCommands(): Promise<TaskWithInitialScheduleCommand[]> {
  const settings = await (await localDatabase()).getAll("appSettings");
  return settings
    .filter((setting) => setting.key.startsWith(PENDING_TASK_COMMAND_PREFIX))
    .flatMap((setting) => {
      const value = setting.value;
      if (!value || typeof value !== "object") return [];
      const command = value as Partial<TaskWithInitialScheduleCommand>;
      if (typeof command.operationId !== "string" || !command.task || typeof command.task.id !== "string") return [];
      if (command.schedule !== null && (!command.schedule || typeof command.schedule.id !== "string")) return [];
      return [{ operationId: command.operationId, task: command.task as TaskWithInitialScheduleCommand["task"], schedule: command.schedule as TaskWithInitialScheduleCommand["schedule"] }];
    });
}

export async function removePendingTaskCommand(operationId: string): Promise<void> {
  await (await localDatabase()).delete("appSettings", pendingTaskCommandKey(operationId));
}

async function queueTaskCommandOffline(command: TaskWithInitialScheduleCommand): Promise<TaskWithInitialScheduleResult> {
  const mutations = [
    {
      entityType: "tasks",
      entityId: command.task.id,
      kind: "UPSERT" as const,
      baseVersion: null,
      payload: command.task,
    },
    ...(command.schedule ? [{
      entityType: "task-schedules",
      entityId: command.schedule.id,
      kind: "UPSERT" as const,
      baseVersion: null,
      payload: command.schedule,
    }] : []),
  ];
  await commitOfflineMutations(mutations);
  return {
    data: {
      task: { ...command.task, version: 0, pending: true },
      schedule: command.schedule ? { ...command.schedule, version: 0, pending: true } : null,
    },
    meta: { offline: true },
    operationId: command.operationId,
    pending: true,
  };
}

export async function createTaskWithInitialSchedule(input: {
  task: Record<string, unknown> & { id: string };
  schedule: (Record<string, unknown> & { id: string }) | null;
  operationId?: string;
}): Promise<TaskWithInitialScheduleResult> {
  const command: TaskWithInitialScheduleCommand = {
    operationId: input.operationId ?? uuidv7(),
    task: input.task,
    schedule: input.schedule,
  };
  if (!navigator.onLine) return queueTaskCommandOffline(command);
  try {
    const response = await apiPost<{
      data: TaskWithInitialScheduleResult["data"];
      meta: { requestId: string; idempotentReplay?: boolean };
    }>("/api/v1/tasks/with-initial-schedule", { operationId: command.operationId, data: { task: command.task, schedule: command.schedule } });
    await cacheServerEntities("tasks", [response.data.task]);
    if (response.data.schedule) await cacheServerEntities("task-schedules", [response.data.schedule]);
    await removePendingTaskCommand(command.operationId);
    return { ...response, operationId: command.operationId, pending: false };
  } catch (error) {
    if (error instanceof TypeError) {
      await savePendingTaskCommand(command);
      throw new PendingTaskCommandError(command.operationId);
    }
    throw error;
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
