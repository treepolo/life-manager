import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";

import { AppShell } from "@/app/layouts/AppShell";

const syncState = vi.hoisted(() => ({
  value: {
    pendingCount: 0,
    syncing: false,
    lastError: null as string | null,
    sync: vi.fn(),
  },
}));

vi.mock("@/app/providers/SyncProvider", () => ({
  useSyncState: () => syncState.value,
}));

function renderShell(path = "/") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<AppShell />} path="*">
          <Route element={<Outlet />} path="*" />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("AppShell navigation", () => {
  afterEach(() => {
    cleanup();
    syncState.value.sync.mockReset();
  });

  it("保留桌面九個正式入口並標記目前 route", () => {
    renderShell("/deadlines");

    const desktopNavigation = screen.getByRole("navigation", { name: "主要導覽" });
    expect(within(desktopNavigation).getAllByRole("link")).toHaveLength(9);
    expect(within(desktopNavigation).getByRole("link", { name: /重要期限/ })).toHaveAttribute("aria-current", "page");
    expect(within(desktopNavigation).getByRole("link", { name: /資料管理/ })).toBeInTheDocument();
  });

  it("手機以四個主要入口加上可鍵盤操作的更多導覽涵蓋次要與系統能力", async () => {
    renderShell();

    const mobileNavigation = screen.getByRole("navigation", { name: "手機主要導覽" });
    expect(within(mobileNavigation).getAllByRole("link")).toHaveLength(4);
    expect(within(mobileNavigation).getByRole("link", { name: "總覽" })).toBeInTheDocument();
    const moreButton = within(mobileNavigation).getByRole("button", { name: "更多" });
    expect(moreButton).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(moreButton);
    const moreMenu = await screen.findByRole("complementary", { name: "更多導覽" });
    await waitFor(() => expect(within(moreMenu).getByRole("link", { name: "社群" })).toHaveFocus());
    expect(within(moreMenu).getAllByRole("link")).toHaveLength(5);
    expect(within(moreMenu).getByRole("link", { name: "重要期限" })).toBeInTheDocument();
    expect(within(moreMenu).getByRole("link", { name: "指標／事件" })).toBeInTheDocument();
    expect(within(moreMenu).getByRole("link", { name: "外部連線" })).toBeInTheDocument();
    expect(within(moreMenu).getByRole("link", { name: "資料管理" })).toBeInTheDocument();
    expect(within(moreMenu).getByRole("button", { name: "立即同步" })).toBeInTheDocument();
    expect(within(moreMenu).getByRole("status", { name: "PWA 更新提示狀態" })).toHaveTextContent("目前未顯示更新提示");

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("complementary", { name: "更多導覽" })).not.toBeInTheDocument());
    expect(moreButton).toHaveAttribute("aria-expanded", "false");
    expect(moreButton).toHaveFocus();

    fireEvent.click(moreButton);
    const reopenedMenu = await screen.findByRole("complementary", { name: "更多導覽" });
    fireEvent.click(within(reopenedMenu).getByRole("link", { name: "重要期限" }));
    await waitFor(() => expect(screen.queryByRole("complementary", { name: "更多導覽" })).not.toBeInTheDocument());
    expect(moreButton).toHaveAttribute("aria-expanded", "false");
  });
});
