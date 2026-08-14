import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AsyncJobStatus } from "@/app/components/AsyncJobStatus";
import type { AsyncJobOutput } from "@/modules/async-jobs/schema";

const providerJob: AsyncJobOutput = {
  contractVersion: "async-job.v1",
  id: "019fc5a1-df33-7c00-8bc0-000000000010",
  kind: "PROVIDER_SYNC",
  status: "RETRY_WAIT",
  phase: "RETRY_WAIT",
  version: "2026-08-14T10:01:00.000Z",
  createdAt: "2026-08-14T09:00:00.000Z",
  updatedAt: "2026-08-14T10:01:00.000Z",
  lastUpdatedAt: "2026-08-14T10:01:00.000Z",
  expiresAt: null,
  nextRunAt: "2026-08-14T10:02:00.000Z",
  attempt: 2,
  maxAttempts: 5,
  currentRunId: "019fc5a1-df33-7c00-8bc0-000000000011",
  progress: null,
  counters: { processed: null, total: null, succeeded: null, skipped: null, failed: null },
  sourceCounters: { fetched: 8, created: 3, updated: 2, ignored: 1, errors: 1 },
  counterInvariant: "SOURCE_REPORTED_DIFFERENT_UNITS",
  result: null,
  warnings: ["來源限制，部分資料未取得。"],
  error: { code: "RATE_LIMIT", message: "等待 provider 重試。" },
  retryable: true,
  cancelSupported: false,
  capabilities: {
    retrySupported: false,
    cancelSupported: false,
    reloadRecovery: true,
    historyPersisted: true,
    backgroundContinuation: true,
  },
  source: { providerKey: "youtube", connectionId: "019fc5a1-df33-7c00-8bc0-000000000012", moduleKey: null, provider: "youtube" },
  history: [{
    id: "019fc5a1-df33-7c00-8bc0-000000000011",
    status: "FAILED",
    phase: "FAILED",
    startedAt: "2026-08-14T09:00:00.000Z",
    completedAt: "2026-08-14T09:01:00.000Z",
    counters: { processed: null, total: null, succeeded: null, skipped: null, failed: null },
    sourceCounters: { fetched: 8, created: 3, updated: 2, ignored: 1, errors: 1 },
    error: { code: "RATE_LIMIT", message: "來源限制" },
  }],
  provenance: {
    sourceTable: "provider_sync_runs",
    sourceId: "019fc5a1-df33-7c00-8bc0-000000000011",
    sourceUpdatedAt: "2026-08-14T10:01:00.000Z",
    counterSemantics: "provider counters are source-reported and do not share a processed/total unit.",
  },
};

describe("AsyncJobStatus server-truth rendering", () => {
  afterEach(() => cleanup());

  it("顯示phase、source counters、history、provenance且不造假百分比或ETA", () => {
    render(<AsyncJobStatus job={providerJob} onReload={vi.fn()} title="YouTube同步工作" />);

    expect(screen.getAllByText("RETRY_WAIT／等待重試").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/fetched=8 · created=3 · updated=2 · ignored=1 · errors=1/).length).toBeGreaterThan(0);
    expect(screen.getByText(/provider_sync_runs／019fc5a1-df33-7c00-8bc0-000000000011/)).toBeVisible();
    expect(screen.getByText(/未提供同一單位 total；不顯示百分比或 ETA。/)).toBeVisible();
    expect(screen.getAllByText("伺服器明示不支援").length).toBe(2);
    expect(screen.queryByRole("button", { name: "重試" })).not.toBeInTheDocument();
  });

  it("空資料與讀取錯誤顯示可辨識狀態，不插入示範資料", () => {
    render(<AsyncJobStatus job={null} onReload={vi.fn()} />);
    expect(screen.getByText("尚無同步工作紀錄")).toBeVisible();
    expect(screen.queryByText(/fetched=/)).not.toBeInTheDocument();
  });

  it("loading與error狀態提供可操作的reload recovery", () => {
    const onReload = vi.fn();
    const view = render(<AsyncJobStatus job={null} isLoading onReload={onReload} />);
    expect(screen.getByText("讀取伺服器工作狀態中…")).toBeVisible();
    view.rerender(<AsyncJobStatus job={null} error={new Error("讀取失敗")} onReload={onReload} />);
    expect(screen.getByRole("alert")).toHaveTextContent("讀取失敗");
    fireEvent.click(screen.getByRole("button", { name: "重新載入工作狀態" }));
    expect(onReload).toHaveBeenCalledTimes(1);
  });
});
