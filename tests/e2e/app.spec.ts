import { expect, test, type BrowserContext, type Page, type TestInfo } from "@playwright/test";

async function openAndRegister(page: Page, path: string): Promise<void> {
  const registered = page.waitForResponse((response) => response.url().includes("/api/v1/sync/devices") && response.ok());
  const initialPull = page.waitForResponse((response) => response.url().includes("/api/v1/sync/changes") && response.ok());
  await page.goto(path);
  await Promise.all([registered, initialPull]);
}

async function navigate(page: Page, path: string): Promise<void> {
  await page.locator(`a[href="${path}"]`).first().click();
  await expect(page).toHaveURL(new RegExp(path === "/" ? "/$" : `${path}$`));
}

async function expectPending(page: Page, testInfo: TestInfo, count: number): Promise<void> {
  const surface = testInfo.project.name.startsWith("mobile") ? page.locator(".mobile-sync") : page.locator(".sync-card");
  await expect(surface.getByText(`${count} 待同步`, { exact: true })).toBeVisible({ timeout: 20_000 });
}

async function apiList(page: Page, resource: string): Promise<Array<Record<string, unknown>>> {
  let data: Array<Record<string, unknown>> = [];
  await expect.poll(async () => {
    const response = await page.request.get(`/api/v1/${resource}?limit=100`);
    if (!response.ok()) return false;
    const parsed = await response.json() as { data: Array<Record<string, unknown>> };
    data = parsed.data;
    return true;
  }, { timeout: 20_000 }).toBe(true);
  return data;
}

async function createCategoryAndTask(page: Page): Promise<void> {
  const categoryPanel = page.locator(".crayon-panel").filter({ hasText: "新增任務分類" });
  await categoryPanel.getByLabel("分類名稱").fill("訓練");
  await categoryPanel.getByLabel("敘述").fill("每天累積一次訓練");
  await categoryPanel.getByRole("button", { name: "新增分類" }).click();
  await expect(page.getByRole("heading", { name: "訓練" })).toBeVisible();

  const taskPanel = page.locator(".crayon-panel").filter({ hasText: "新增每日任務" });
  await taskPanel.getByLabel("名稱").fill("投球訓練");
  await taskPanel.getByLabel("敘述").fill("完成今天的投球");
  await taskPanel.getByLabel("分類").selectOption({ label: "訓練" });
  await taskPanel.getByRole("button", { name: "新增每日任務" }).click();
  await expect(page.getByText("投球訓練", { exact: true })).toBeVisible();
}

test("每日任務可建立分類、任務並在首頁完成與撤銷", async ({ page }) => {
  await openAndRegister(page, "/tasks");
  await createCategoryAndTask(page);
  await navigate(page, "/");

  const task = page.locator(".daily-task").filter({ hasText: "投球訓練" });
  await expect(task).toBeVisible();
  await expect(page.locator(".today-score strong")).toHaveText("0/1");
  await task.click();
  await expect(page.locator(".today-score strong")).toHaveText("1/1");
  await expect(task).toHaveClass(/is-done/);

  await task.click();
  await expect(page.locator(".today-score strong")).toHaveText("0/1");
  await expect(task).not.toHaveClass(/is-done/);
  expect(await apiList(page, "daily-task-completions")).toHaveLength(0);
});

test("財務目標與歷史可新增、修正、刪除並回到首頁反映", async ({ page }) => {
  await openAndRegister(page, "/settings");

  const incomeGoal = page.locator(".goal-editor").filter({ hasText: "固定月收入" });
  await incomeGoal.locator('input[name="amount"]').fill("50000");
  await incomeGoal.getByRole("button", { name: "儲存目標" }).click();
  const savingsGoal = page.locator(".goal-editor").filter({ hasText: "積蓄" });
  await savingsGoal.locator('input[name="amount"]').fill("500000");
  await savingsGoal.getByRole("button", { name: "儲存目標" }).click();

  const add = page.locator(".history-add-form");
  await add.getByLabel("項目").selectOption("MONTHLY_INCOME");
  await add.getByLabel("日期").fill("2026-08-01");
  await add.getByLabel("金額").fill("30000");
  await add.getByRole("button", { name: "新增紀錄" }).click();
  await expect(page.locator(".history-section").filter({ hasText: "固定月收入歷史" }).getByText("1 筆")).toBeVisible();

  await add.getByLabel("項目").selectOption("MONTHLY_INCOME");
  await add.getByLabel("日期").fill("2026-08-20");
  await add.getByLabel("金額").fill("35000");
  await add.getByRole("button", { name: "新增紀錄" }).click();

  const incomeHistory = page.locator(".history-section").filter({ hasText: "固定月收入歷史" });
  const firstRow = incomeHistory.locator(".history-row").filter({ has: incomeHistory.locator('input[value="30000"]') }).first();
  await firstRow.locator('input[name="amount"]').fill("32000");
  await firstRow.getByRole("button", { name: "儲存修正" }).click();
  await expect.poll(async () => (await apiList(page, "financial-history")).some((item) => item.amountMinor === 32000)).toBe(true);

  page.once("dialog", (dialog) => dialog.accept());
  const latestRow = incomeHistory.locator(".history-row").filter({ has: incomeHistory.locator('input[value="35000"]') }).first();
  await latestRow.getByRole("button", { name: "刪除" }).click();
  await expect.poll(async () => (await apiList(page, "financial-history")).length).toBe(1);

  await navigate(page, "/");
  const incomeCard = page.locator(".money-card").filter({ hasText: "固定月收入" });
  await expect(incomeCard).toContainText("NT$ 32,000");
  await expect(incomeCard).toContainText("NT$ 50,000");
  await expect(page.getByRole("heading", { name: "固定月收入變化" })).toBeVisible();
});

test("離線新增分類與每日任務後恢復連線可同步到 D1", async ({ page, context }, testInfo) => {
  await openAndRegister(page, "/tasks");
  await context.setOffline(true);
  await createCategoryAndTask(page);
  await expectPending(page, testInfo, 2);

  await context.setOffline(false);
  const syncSurface = testInfo.project.name.startsWith("mobile") ? page.locator(".mobile-sync") : page.locator(".sync-card");
  await syncSurface.getByRole("button", { name: "同步" }).click();
  await expectPending(page, testInfo, 0);
  const categories = await apiList(page, "task-categories");
  const tasks = await apiList(page, "daily-tasks");
  expect(categories).toEqual(expect.arrayContaining([expect.objectContaining({ name: "訓練" })]));
  expect(tasks).toEqual(expect.arrayContaining([expect.objectContaining({ name: "投球訓練" })]));
});

test("首頁只呈現三個核心入口與三種成果區塊", async ({ page }) => {
  await openAndRegister(page, "/");
  await expect(page.getByRole("navigation", { name: /主要導覽/ }).getByText("首頁", { exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: /主要導覽/ }).getByText("每日任務", { exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: /主要導覽/ }).getByText("設定", { exact: true })).toBeVisible();
  for (const retired of ["領域／事業", "社群", "重要期限", "指標／事件", "外部連線"]) {
    await expect(page.getByText(retired, { exact: true })).toHaveCount(0);
  }
  await expect(page.getByRole("heading", { name: "每日任務累積完成次數" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "積蓄變化" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "固定月收入變化" })).toBeVisible();
});

test("桌機、平板與手機版面沒有水平溢出且更新提示不遮住底部導覽", async ({ page }, testInfo) => {
  await openAndRegister(page, "/");
  await page.evaluate(() => {
    const banner = document.createElement("aside");
    banner.className = "update-banner";
    banner.setAttribute("role", "status");
    banner.innerHTML = '<strong>有新版可用</strong><span>安全更新測試</span><button class="button">安全更新</button><button class="button button--quiet">稍後</button>';
    document.body.appendChild(banner);
  });
  await expect(page.locator(".update-banner")).toBeVisible();
  const geometry = await page.evaluate(() => {
    const banner = document.querySelector(".update-banner")!.getBoundingClientRect();
    const navElement = document.querySelector(".mobile-nav") as HTMLElement | null;
    const nav = navElement && getComputedStyle(navElement).display !== "none" ? navElement.getBoundingClientRect() : null;
    return {
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      bannerBottom: banner.bottom,
      navTop: nav?.top ?? null,
    };
  });
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.innerWidth + 1);
  if (testInfo.project.name.startsWith("mobile") || testInfo.project.name === "tablet-768") {
    if (geometry.navTop !== null) expect(geometry.bannerBottom).toBeLessThanOrEqual(geometry.navTop - 20);
  }
});
