import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PwaUpdate } from "@/app/providers/PwaUpdate";

const clientDb = vi.hoisted(() => ({ outboxCount: vi.fn() }));

vi.mock("@/core/sync/client-db", () => ({ outboxCount: clientDb.outboxCount }));

describe("PWA 安全更新", () => {
  const originalServiceWorker = navigator.serviceWorker;

  beforeEach(() => {
    clientDb.outboxCount.mockReset();
  });

  afterEach(() => {
    cleanup();
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: originalServiceWorker,
    });
  });

  it("不使用 HTTP cache 檢查新版，且離線寫入未送出時不會跳過等待", async () => {
    const waitingWorker = { postMessage: vi.fn() };
    const registration = {
      waiting: waitingWorker,
      installing: null,
      addEventListener: vi.fn(),
      update: vi.fn().mockResolvedValue(undefined),
    };
    const serviceWorker = {
      controller: {},
      register: vi.fn().mockResolvedValue(registration),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: serviceWorker,
    });
    clientDb.outboxCount.mockResolvedValue(1);

    render(<PwaUpdate />);

    const updateButton = await screen.findByRole("button", { name: "安全更新" });
    expect(serviceWorker.register).toHaveBeenCalledWith("/sw.js", { updateViaCache: "none" });
    await waitFor(() => expect(registration.update).toHaveBeenCalledTimes(1));

    fireEvent.click(updateButton);

    expect(await screen.findByText(/仍有待同步資料/)).toBeInTheDocument();
    expect(waitingWorker.postMessage).not.toHaveBeenCalled();
  });

  it("沒有離線待送資料時才通知等待中的 worker 接管", async () => {
    const waitingWorker = { postMessage: vi.fn() };
    const registration = {
      waiting: waitingWorker,
      installing: null,
      addEventListener: vi.fn(),
      update: vi.fn().mockResolvedValue(undefined),
    };
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: {
        controller: {},
        register: vi.fn().mockResolvedValue(registration),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    });
    clientDb.outboxCount.mockResolvedValue(0);

    render(<PwaUpdate />);
    fireEvent.click(await screen.findByRole("button", { name: "安全更新" }));

    await waitFor(() => expect(waitingWorker.postMessage).toHaveBeenCalledWith({
      type: "SKIP_WAITING_AFTER_OUTBOX_SAVED",
    }));
  });
});
