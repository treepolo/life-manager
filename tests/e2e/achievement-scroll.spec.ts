import { expect, test, type Page } from "@playwright/test";

async function openAndRegister(page: Page, path: string): Promise<void> {
  const registered = page.waitForResponse((response) => response.url().includes("/api/v1/sync/devices") && response.ok());
  const initialPull = page.waitForResponse((response) => response.url().includes("/api/v1/sync/changes") && response.ok());
  await page.goto(path);
  await Promise.all([registered, initialPull]);
}

async function createCategoryWithTwoTasks(page: Page): Promise<void> {
  const categoryPanel = page.locator(".crayon-panel").filter({ hasText: "新增任務分類" });
  await categoryPanel.getByLabel("分類名稱").fill("測試分類");
  await categoryPanel.getByLabel("敘述").fill("測試成就橫向列");
  await categoryPanel.getByRole("button", { name: "新增分類" }).click();
  await expect(page.getByRole("heading", { name: "測試分類" })).toBeVisible();

  const taskPanel = page.locator(".crayon-panel").filter({ hasText: "新增每日任務" });
  for (const index of [1, 2]) {
    await taskPanel.getByLabel("名稱").fill(`測試任務${index}`);
    await taskPanel.getByLabel("敘述").fill(`第 ${index} 個測試任務`);
    await taskPanel.getByLabel("成果").fill(`測試成果${index}`);
    await taskPanel.getByLabel("單位").fill("次");
    await taskPanel.getByLabel("分類").selectOption({ label: "測試分類" });
    await taskPanel.getByRole("button", { name: "新增每日任務" }).click();
    await expect(page.getByText(`測試任務${index}`, { exact: true }).first()).toBeVisible();
  }
}

test("首頁成就列載入完成後預設停在最左側", async ({ page }) => {
  await openAndRegister(page, "/tasks");
  await createCategoryWithTwoTasks(page);
  await page.locator('a[href="/"]').first().click();
  await expect(page).toHaveURL(/\/$/);

  const grid = page.locator(".achievement-grid");
  await expect(grid.locator(".achievement-card")).toHaveCount(4);
  await expect.poll(async () => Math.round(await grid.evaluate((element) => element.scrollLeft))).toBe(0);

  const geometry = await grid.evaluate((element) => {
    const viewport = element.getBoundingClientRect();
    const firstCard = element.firstElementChild!.getBoundingClientRect();
    return { viewportLeft: viewport.left, firstCardLeft: firstCard.left };
  });
  expect(geometry.firstCardLeft).toBeGreaterThanOrEqual(geometry.viewportLeft - 1);
});
