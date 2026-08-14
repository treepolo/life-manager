import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { IntegrationsPage } from "@/app/pages/IntegrationsPage";

const api = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  postLongRunning: vi.fn(),
}));

vi.mock("@/app/api/client", () => ({
  apiGet: api.get,
  apiPost: api.post,
  apiPostLongRunning: api.postLongRunning,
}));

const youtubeConnection = {
  id: "019fc5a1-df33-7c00-8bc0-000000000001",
  provider_key: "youtube",
  display_name: "正式頻道",
  status: "CONNECTED",
  last_attempt_at: null,
  last_success_at: null,
  last_error_code: null,
  last_error_message_redacted: null,
  token_expires_at: "2026-08-10T04:05:18.000Z",
  provider_definition_version: "youtube-data-v3+analytics-v2@2026-08-09",
  next_run_at: "2026-08-09T21:36:01.000Z",
  sync_job_status: "READY",
  sync_attempt: 0,
};

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("外部連線手動同步pending狀態", () => {
  it("長請求完成前顯示同步中並停用同步與撤銷", async () => {
    let finishSync: ((value: unknown) => void) | undefined;
    api.get.mockImplementation((path: string) => path.startsWith("/api/v1/async-jobs")
      ? Promise.resolve({ data: [], meta: { requestId: "test", contractVersion: "async-job.v1", nextCursor: null } })
      : Promise.resolve({ data: [youtubeConnection] }));
    api.postLongRunning.mockImplementation(() => new Promise((resolve) => { finishSync = resolve; }));

    render(<IntegrationsPage />, { wrapper });
    const syncButton = await screen.findByRole("button", { name: "立即同步" });
    const disconnectButton = screen.getByRole("button", { name: "撤銷連線" });
    fireEvent.click(syncButton);

    expect(await screen.findByRole("button", { name: "同步中" })).toBeDisabled();
    expect(disconnectButton).toBeDisabled();
    expect(api.postLongRunning).toHaveBeenCalledTimes(1);

    await act(async () => finishSync?.({ data: { status: "SUCCEEDED" } }));
    await waitFor(() => expect(screen.getByRole("button", { name: "立即同步" })).toBeEnabled());
  });
});
