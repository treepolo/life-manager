import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TasksPage } from "@/app/pages/TasksPage";

const api = vi.hoisted(() => ({
  create: vi.fn(),
  listPending: vi.fn(),
  removePending: vi.fn(),
}));

const resource = {
  list: { data: [], refetch: vi.fn().mockResolvedValue(undefined) },
  update: { mutate: vi.fn() },
  archive: { mutate: vi.fn() },
};

vi.mock("@/app/api/client", () => ({
  createTaskWithInitialSchedule: api.create,
  listPendingTaskCommands: api.listPending,
  removePendingTaskCommand: api.removePending,
}));

vi.mock("@/app/hooks/use-resource", () => ({
  useResource: () => resource,
}));

describe("TasksPage atomic建立互動", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("雙擊只送出一次，且一次帶上task與初始schedule", async () => {
    api.listPending.mockResolvedValue([]);
    api.create.mockResolvedValue({
      data: { task: { id: "task-1" }, schedule: { id: "schedule-1" } },
      meta: { requestId: "request-1" },
      operationId: "operation-1",
      pending: false,
    });

    render(<TasksPage />);
    const form = screen.getByRole("button", { name: "建立任務" }).closest("form")!;
    fireEvent.change(screen.getByLabelText("任務名稱"), { target: { value: "原子任務" } });
    fireEvent.change(screen.getByLabelText("開始日期"), { target: { value: "2026-08-14" } });
    const button = screen.getByRole("button", { name: "建立任務" });
    fireEvent.click(button);
    fireEvent.click(button);

    await waitFor(() => expect(api.create).toHaveBeenCalledTimes(1));
    expect(api.create).toHaveBeenCalledWith(expect.objectContaining({
      task: expect.objectContaining({ title: "原子任務" }),
      schedule: expect.objectContaining({ recurrenceKind: "DAILY", startsOnLocalDate: "2026-08-14" }),
    }));
    await screen.findByText("任務與初始排程已保存。");
    expect(form).toBeTruthy();
  });

  it("可以明確省略初始schedule，成功狀態仍清楚", async () => {
    api.listPending.mockResolvedValue([]);
    api.create.mockResolvedValue({
      data: { task: { id: "task-2" }, schedule: null },
      meta: { requestId: "request-2" },
      operationId: "operation-2",
      pending: false,
    });

    render(<TasksPage />);
    fireEvent.change(screen.getByLabelText("任務名稱"), { target: { value: "無排程任務" } });
    fireEvent.click(screen.getByLabelText("同次建立初始排程（可稍後再設定）"));
    fireEvent.submit(screen.getByRole("button", { name: "建立任務" }).closest("form")!);

    await waitFor(() => expect(api.create).toHaveBeenCalledTimes(1));
    expect(api.create).toHaveBeenCalledWith(expect.objectContaining({ schedule: null }));
    await screen.findByText("任務已保存，未建立初始排程。");
  });
});
