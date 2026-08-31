import { expect, test, type Page, type TestInfo } from "@playwright/test";

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
  await taskPanel.getByLabel("成果").fill("投球訓練");
  await taskPanel.getByLabel("單位").fill("次");
  await taskPanel.getByLabel("分類").selectOption({ label: "訓練" });
  await taskPanel.getByRole("button", { name: "新增每日任務" }).click();
  await expect(page.getByText("投球訓練", { exact: true }).first()).toBeVisible();
}

async function expectChartAxisInsideFrame(page: Page, title: string): Promise<void> {
  const panel = page.locator(".chart-panel").filter({ hasText: title });
  const yLabel = panel.getByTestId("chart-y-label");
  await expect(yLabel).toBeVisible();
  const geometry = await panel.evaluate((element) => {
    const frame = element.querySelector(".chart-frame")!.getBoundingClientRect();
    const label = element.querySelector(".chart-y-label > span")!.getBoundingClientRect();
    const canvas = element.querySelector(".chart-canvas")!.getBoundingClientRect();
    return {
      frame: { top: frame.top, right: frame.right, bottom: frame.bottom, left: frame.left },
      label: { top: label.top, right: label.right, bottom: label.bottom, left: label.left },
      canvas: { top: canvas.top, right: canvas.right, bottom: canvas.bottom, left: canvas.left },
    };
  });
  expect(geometry.label.top).toBeGreaterThanOrEqual(geometry.frame.top - 1);
  expect(geometry.label.bottom).toBeLessThanOrEqual(geometry.frame.bottom + 1);
  expect(geometry.label.left).toBeGreaterThanOrEqual(geometry.frame.left - 1);
  expect(geometry.label.right).toBeLessThanOrEqual(geometry.canvas.left + 1);
  expect(geometry.canvas.right).toBeLessThanOrEqual(geometry.frame.right + 1);
}

test("每日任務可建立分類、任務並在首頁完成與撤銷", async ({ page }) => {
  await openAndRegister(page, "/tasks");
  await createCategoryAndTask(page);
  await navigate(page, "/");

  const achievement = page.locator(".task-achievement").filter({ hasText: "投球訓練" });
  await expect(achievement).toContainText("0");
  const task = page.locator(".daily-task").filter({ hasText: "投球訓練" });
  await expect(task).toBeVisible();
  await expect(page.locator(".today-score strong")).toHaveText("0/1");
  await task.click();
  await expect(page.locator(".today-score strong")).toHaveText("1/1");
  await expect(task).toHaveClass(/is-done/);
  await expect(achievement).toContainText("1");
  await expect(page.locator(".today-score")).toContainText("收工");
  await expectChartAxisInsideFrame(page, "每日任務累積完成次數");

  await task.click();
  await expect(page.locator(".today-score strong")).toHaveText("0/1");
  await expect(task).not.toHaveClass(/is-done/);
  expect(await apiList(page, "daily-task-completions")).toHaveLength(0);
});

test("每日任務可補登過去日期、撤銷補登，未來日期前後端都禁止", async ({ page }) => {
  await openAndRegister(page, "/tasks");
  await createCategoryAndTask(page);

  const dateInput = page.getByLabel("投球訓練補登日期");
  await expect(dateInput).toHaveAttribute("max", /2026-08-3[01]/);
  await dateInput.fill("2026-08-01");
  const row = page.locator(".task-admin-row").filter({ hasText: "投球訓練" });
  await row.getByRole("button", { name: "補登完成" }).click();
  await expect.poll(async () => (await apiList(page, "daily-task-completions")).some((item) => item.completedLocalDate === "2026-08-01")).toBe(true);
  await expect(row.getByRole("button", { name: "撤銷這天" })).toBeVisible();
  await row.getByRole("button", { name: "撤銷這天" }).click();
  await expect.poll(async () => (await apiList(page, "daily-task-completions")).length).toBe(0);

  const task = (await apiList(page, "daily-tasks"))[0];
  const futureResponse = await page.request.post("/api/v1/daily-task-completions", {
    data: {
      operationId: "018f6cc6-2c49-4c3d-8c1f-0123456789aa",
      data: {
        id: "018f6cc6-2c49-7c3d-8c1f-0123456789ab",
        taskId: task.id,
        completedLocalDate: "2099-01-01",
        completedAt: "2099-01-01T00:00:00.000Z",
      },
    },
  });
  expect(futureResponse.status()).toBe(400);
});

test("出生年月日可設定，首頁顯示年齡生日倒數且成就在今日區塊上方", async ({ page }) => {
  await openAndRegister(page, "/settings");
  const profilePanel = page.locator(".profile-panel");
  await profilePanel.getByLabel("出生年月日").fill("2000-01-01");
  await profilePanel.getByRole("button", { name: "儲存" }).click();
  await expect.poll(async () => (await apiList(page, "user-profile"))[0]?.birthDate).toBe("2000-01-01");

  await navigate(page, "/");
  const lifeRibbon = page.locator(".life-ribbon");
  await expect(lifeRibbon).toContainText("歲");
  await expect(lifeRibbon).toContainText("生日還有");
  const order = await page.evaluate(() => ({
    achievementTop: document.querySelector(".achievement-board")!.getBoundingClientRect().top,
    heroTop: document.querySelector(".hero-scribble")!.getBoundingClientRect().top,
  }));
  expect(order.achievementTop).toBeLessThan(order.heroTop);
});

test("財務目標與歷史可新增、修正、刪除並回到首頁反映", async ({ page }) => {
  await openAndRegister(page, "/settings");

  const incomeGoal = page.locator(".goal-editor").filter({ hasText: "固定月收入" });
  await incomeGoal.locator('input[name="amount"]').fill("50000");
  await incomeGoal.getByRole("button", { name: "儲存目標" }).click();
  const netWorthGoal = page.locator(".goal-editor").filter({ hasText: "淨資產" });
  await netWorthGoal.locator('input[name="amount"]').fill("500000");
  await netWorthGoal.getByRole("button", { name: "儲存目標" }).click();

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
  await expect(incomeHistory.locator(".history-row")).toHaveCount(2);
  const latestRow = incomeHistory.locator(".history-row").nth(0);
  const olderRow = incomeHistory.locator(".history-row").nth(1);
  await expect(latestRow.locator('input[name="amount"]')).toHaveValue("35000");
  await expect(olderRow.locator('input[name="amount"]')).toHaveValue("30000");

  await olderRow.locator('input[name="amount"]').fill("32000");
  await olderRow.getByRole("button", { name: "儲存修正" }).click();
  await expect.poll(async () => (await apiList(page, "financial-history")).some((item) => item.amountMinor === 32000)).toBe(true);

  page.once("dialog", (dialog) => dialog.accept());
  await latestRow.getByRole("button", { name: "刪除" }).click();
  await expect.poll(async () => (await apiList(page, "financial-history")).length).toBe(1);

  await add.getByLabel("項目").selectOption("NET_WORTH");
  await add.getByLabel("日期").fill("2026-08-20");
  await add.getByLabel("金額").fill("-100000");
  await add.getByRole("button", { name: "新增紀錄" }).click();
  await expect(page.locator(".history-section").filter({ hasText: "淨資產歷史" }).getByText("1 筆")).toBeVisible();
  await expect.poll(async () => (await apiList(page, "financial-history")).some((item) => item.metricKind === "NET_WORTH" && item.amountMinor === -100000)).toBe(true);

  await navigate(page, "/");
  const incomeCard = page.locator(".money-card").filter({ hasText: "固定月收入" });
  await expect(incomeCard).toContainText("NT$ 32,000");
  await expect(incomeCard).toContainText("NT$ 50,000");
  const incomeComparison = page.locator(".percentile-card").filter({ hasText: "你的月收入贏過" });
  await expect(incomeComparison).toContainText("個臺灣人");
  const netWorthComparison = page.locator(".percentile-card").filter({ hasText: "你的淨資產贏過" });
  await expect(netWorthComparison).toContainText("個臺灣人");
  await expect(page.getByText(/%/, { exact: false })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "固定月收入變化" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "淨資產變化" })).toBeVisible();
  await expectChartAxisInsideFrame(page, "固定月收入變化");
  await expectChartAxisInsideFrame(page, "淨資產變化");
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
  expect(tasks).toEqual(expect.arrayContaining([expect.objectContaining({ name: "投球訓練", achievementName: "投球訓練", achievementUnit: "次" })]));
});

test("首頁只呈現三個核心入口與三種成果區塊", async ({ page }) => {
  await openAndRegister(page, "/");
  const mainNavigation = page.getByRole("navigation", { name: "主要導覽", exact: true });
  await expect(mainNavigation.getByRole("link", { name: "首頁", exact: true })).toBeVisible();
  await expect(mainNavigation.getByRole("link", { name: "每日任務", exact: true })).toBeVisible();
  await expect(mainNavigation.getByRole("link", { name: "設定", exact: true })).toBeVisible();
  for (const retired of ["領域／事業", "社群", "重要期限", "指標／事件", "外部連線"]) {
    await expect(page.getByText(retired, { exact: true })).toHaveCount(0);
  }
  await expect(page.locator(".achievement-board")).toBeVisible();
  await expect(page.getByText("今天把這些完成就好", { exact: true })).toBeVisible();
  await expect(page.getByText("固定任務每天重新開始，完成紀錄會留在你的累積曲線裡。", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "每日任務累積完成次數" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "淨資產變化" })).toBeVisible();
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
