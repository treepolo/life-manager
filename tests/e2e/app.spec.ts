import { expect, test, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
import { v7 as uuidv7 } from "uuid";

function syncSurface(page: Page, testInfo: TestInfo) {
  return testInfo.project.name.startsWith("mobile") ? page.locator(".mobile-sync-status") : page.locator(".rail-status");
}

async function openAndRegister(page: Page, path: string): Promise<void> {
  const registered = page.waitForResponse((response) => response.url().includes("/api/v1/sync/devices") && response.ok());
  const initialPull = page.waitForResponse((response) => response.url().includes("/api/v1/sync/changes") && response.ok());
  await page.goto(path);
  await Promise.all([registered, initialPull]);
}

async function navigate(page: Page, path: string): Promise<void> {
  await page.locator(`a[href="${path}"]`).first().evaluate((element: HTMLElement) => element.click());
  await expect(page).toHaveURL(new RegExp(`${path === "/" ? "/$" : `${path}$`}`));
}

async function createResource(page: Page, resource: string, data: Record<string, unknown>): Promise<void> {
  const response = await page.request.post(`/api/v1/${resource}`, { data: { operationId: uuidv7(), data } });
  expect(response.ok(), `${resource}: ${await response.text()}`).toBeTruthy();
}

async function getApiJson<T>(page: Page, path: string): Promise<T> {
  let result: T | undefined;
  await expect.poll(async () => {
    try {
      const response = await page.request.get(path);
      if (!response.ok()) return false;
      result = JSON.parse(await response.text()) as T;
      return true;
    } catch {
      return false;
    }
  }, { timeout: 20_000, intervals: [250, 500, 1_000] }).toBe(true);
  return result!;
}

async function expectApiContains(page: Page, path: string, expected: string): Promise<void> {
  await expect.poll(async () => {
    try {
      const response = await page.request.get(path);
      return response.ok() ? await response.text() : "";
    } catch {
      return "";
    }
  }, { timeout: 20_000, intervals: [250, 500, 1_000] }).toContain(expected);
}

async function expectPending(page: Page, testInfo: TestInfo, count: number): Promise<void> {
  await expect(syncSurface(page, testInfo).getByText(`${count} 待同步`, { exact: true })).toBeVisible({ timeout: 20_000 });
}

async function setConnectivity(page: Page, context: BrowserContext, offline: boolean): Promise<void> {
  await context.setOffline(offline);
  await expect.poll(() => page.evaluate(() => navigator.onLine), { timeout: 10_000 }).toBe(!offline);
}

async function reconnectAndSync(page: Page, context: BrowserContext, testInfo: TestInfo): Promise<{ uploaded: string; pulled: string }> {
  const uploadedResponse = page.waitForResponse(
    (response) => response.url().includes("/api/v1/sync/batch") && response.request().method() === "POST",
    { timeout: 30_000 },
  );
  const pulledResponse = page.waitForResponse(
    (response) => response.url().includes("/api/v1/sync/changes") && response.request().method() === "GET",
    { timeout: 30_000 },
  );
  await setConnectivity(page, context, false);
  const surface = syncSurface(page, testInfo);
  const synced = surface.getByText("0 待同步", { exact: true });
  const syncButton = surface.getByRole("button", { name: "立即同步" });
  await expect.poll(async () => (await synced.isVisible()) || (await syncButton.isEnabled()), { timeout: 10_000 }).toBe(true);
  if (!(await synced.isVisible())) await syncButton.click();
  await expect(synced).toBeVisible({ timeout: 20_000 });
  const [uploaded, pulled] = await Promise.all([uploadedResponse, pulledResponse]);
  const uploadedText = await uploaded.text();
  const pulledText = await pulled.text();
  expect(uploaded.ok(), uploadedText).toBeTruthy();
  expect(pulled.ok(), pulledText).toBeTruthy();
  return { uploaded: uploadedText, pulled: pulledText };
}

test("正式 UI 可寫入 D1，離線建立後可同步，且版面不水平溢出", async ({ page, context }, testInfo) => {
  test.setTimeout(120_000);
  const suffix = `${testInfo.project.name}-${Date.now()}`;
  const onlineArea = `正式領域-${suffix}`;
  const offlineArea = `離線領域-${suffix}`;

  await openAndRegister(page, "/areas");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", /manifest\.webmanifest/);
  await expect.poll(
    () => page.evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? ""),
    { timeout: 15_000 },
  ).toContain("/sw.js");
  await expect(page.getByRole("heading", { name: "領域與事業" })).toBeVisible();
  const areaForm = page.locator("form").first();
  await areaForm.getByLabel("名稱").fill(onlineArea);
  await areaForm.getByLabel("為什麼").fill("端到端驗收正式寫入");
  await areaForm.getByLabel("下一個具體行動").fill("完成驗收證據");
  await areaForm.getByRole("button", { name: "建立領域" }).click();
  await expect(page.getByRole("heading", { name: onlineArea })).toBeVisible({ timeout: 15_000 });
  await expectApiContains(page, "/api/v1/areas", onlineArea);
  await expect(areaForm.getByRole("button", { name: "建立領域" })).toBeEnabled({ timeout: 20_000 });

  await setConnectivity(page, context, true);
  await areaForm.getByLabel("名稱").fill(offlineArea);
  await areaForm.getByRole("button", { name: "建立領域" }).click();
  await expectPending(page, testInfo, 1);
  const offlineSync = await reconnectAndSync(page, context, testInfo);
  expect(offlineSync.uploaded).toContain('"status":"APPLIED"');
  expect(offlineSync.pulled).toContain(offlineArea);

  const dimensions = await page.evaluate(() => ({ width: window.innerWidth, scrollWidth: document.documentElement.scrollWidth }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width);
  await testInfo.attach(`正式UI-${testInfo.project.name}`, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
});

test("離線修改、封存、重開與恢復可同步", async ({ page, context }, testInfo) => {
  test.setTimeout(120_000);
  const areaName = `離線生命週期-${testInfo.project.name}-${Date.now()}`;
  const updatedAction = "離線修改後的下一步";
  const areaCard = () => page.locator(".area-sheet").filter({ has: page.getByRole("heading", { name: areaName }) });

  await openAndRegister(page, "/areas");
  const areaForm = page.locator("form").first();
  await areaForm.getByLabel("名稱").fill(areaName);
  await areaForm.getByRole("button", { name: "建立領域" }).click();
  await expect(areaCard()).toBeVisible();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), { timeout: 15_000 }).toBe(true);

  await setConnectivity(page, context, true);
  await areaCard().getByText("編輯、排序領域").click();
  const editForm = areaCard().locator("form").first();
  await editForm.getByLabel("下一步").fill(updatedAction);
  await editForm.getByRole("button", { name: "保存領域" }).click();
  await expectPending(page, testInfo, 1);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(areaCard()).toContainText(updatedAction);
  await expectPending(page, testInfo, 1);
  const updatedSync = await reconnectAndSync(page, context, testInfo);
  expect(updatedSync.pulled).toContain(updatedAction);

  await openAndRegister(page, "/areas");
  await setConnectivity(page, context, true);
  await areaCard().getByRole("button", { name: "封存", exact: true }).click();
  await expectPending(page, testInfo, 1);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(areaCard()).toContainText("已封存");
  const archivedSync = await reconnectAndSync(page, context, testInfo);
  expect(archivedSync.pulled).toContain(areaName);
  expect(archivedSync.pulled).toMatch(/"archivedAt":"[^"]+"/);

  await openAndRegister(page, "/areas");
  await setConnectivity(page, context, true);
  await areaCard().getByRole("button", { name: "恢復", exact: true }).click();
  await expectPending(page, testInfo, 1);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(areaCard()).toContainText("進行中");
  const restoredSync = await reconnectAndSync(page, context, testInfo);
  expect(restoredSync.pulled).toContain(areaName);
  expect(restoredSync.pulled).toContain('"archivedAt":null');
});

test("離線任務排程、財務交易與資產快照可同步", async ({ page, context }, testInfo) => {
  test.setTimeout(120_000);
  const suffix = `${testInfo.project.name}-${Date.now()}`;
  const taskTitle = `離線每日任務-${suffix}`;
  await openAndRegister(page, "/tasks");
  const taskForm = page.locator("form").filter({ has: page.getByRole("button", { name: "建立任務" }) });
  await taskForm.getByLabel("任務名稱").fill(taskTitle);
  await taskForm.getByLabel("開始日期").fill("2026-08-02");
  await taskForm.getByLabel("狀態差時的指引").fill("先完成最小一步");
  await setConnectivity(page, context, true);
  await taskForm.getByRole("button", { name: "建立任務" }).click();
  await expectPending(page, testInfo, 2);
  const taskSync = await reconnectAndSync(page, context, testInfo);
  expect(taskSync.pulled).toContain(taskTitle);

  const accountId = uuidv7();
  await createResource(page, "financial-accounts", { id: accountId, name: `離線驗收帳戶-${suffix}`, accountType: "BANK", currencyCode: "TWD", minorUnitScale: 0, institution: "", includeInNetWorth: true });
  await navigate(page, "/finance");
  const transactionForm = page.locator("form").filter({ has: page.getByRole("button", { name: "記錄交易" }) });
  await transactionForm.getByLabel("日期").fill("2026-08-02");
  await transactionForm.getByLabel("帳戶").selectOption(accountId);
  await transactionForm.getByLabel("原幣金額").fill("1234");
  await transactionForm.getByLabel("備註").fill(`離線交易-${suffix}`);
  const snapshotForm = page.locator("form").filter({ has: page.getByRole("button", { name: "保存快照" }) });
  await snapshotForm.getByLabel("帳戶").selectOption(accountId);
  await snapshotForm.getByLabel("原幣總值").fill("5678");
  await snapshotForm.getByLabel("日期").fill("2026-08-02");
  await setConnectivity(page, context, true);
  await transactionForm.getByRole("button", { name: "記錄交易" }).click();
  await snapshotForm.getByRole("button", { name: "保存快照" }).click();
  await expectPending(page, testInfo, 2);
  const financeSync = await reconnectAndSync(page, context, testInfo);
  expect(financeSync.pulled).toContain(`離線交易-${suffix}`);
});

test("離線指標觀測與事件可同步", async ({ page, context }, testInfo) => {
  test.setTimeout(90_000);
  const suffix = `${testInfo.project.name}-${Date.now()}`;
  const metricId = uuidv7(); const eventTypeId = uuidv7();
  await createResource(page, "metrics", { id: metricId, key: `offline_${Date.now()}`, name: `離線指標-${suffix}`, unit: "count", valueType: "INTEGER", role: "ACTION", domain: "offline", areaId: null, businessId: null, recordingFrequency: "DAILY", sourcePolicy: "MANUAL", precision: 0 });
  await createResource(page, "event-types", { id: eventTypeId, name: `離線事件類型-${suffix}`, colorToken: "event" });
  await openAndRegister(page, "/metrics");
  const observationForm = page.locator("form").filter({ has: page.getByRole("button", { name: "保存觀測" }) });
  await observationForm.getByLabel("指標").selectOption(metricId);
  await observationForm.getByLabel("觀測時間").fill("2026-08-02T12:00");
  await observationForm.getByLabel("值").fill("42");
  const eventForm = page.locator("form").filter({ has: page.getByRole("button", { name: "保存事件" }) });
  await eventForm.getByLabel("類型").selectOption(eventTypeId);
  await eventForm.getByLabel("標題").fill(`離線事件-${suffix}`);
  await eventForm.getByLabel("開始").fill("2026-08-02T12:30");
  await setConnectivity(page, context, true);
  await observationForm.getByRole("button", { name: "保存觀測" }).click();
  await eventForm.getByRole("button", { name: "保存事件" }).click();
  await expectPending(page, testInfo, 2);
  const metricSync = await reconnectAndSync(page, context, testInfo);
  expect(metricSync.pulled).toContain(`離線事件-${suffix}`);
});

test("離線社群快照與手動成交可同步", async ({ page, context }, testInfo) => {
  test.setTimeout(90_000);
  const suffix = `${testInfo.project.name}-${Date.now()}`;
  const platformId = String((await getApiJson<{ data: Array<{ id: string }> }>(page, "/api/v1/platforms")).data[0].id);
  const socialAccountId = uuidv7(); const contentId = uuidv7(); const postId = uuidv7(); const socialMetricId = uuidv7();
  const socialMetricKey = `views_${Date.now()}`;
  await createResource(page, "social-accounts", { id: socialAccountId, platformId, displayName: `離線社群帳號-${suffix}`, externalAccountId: null, accountKind: "CHANNEL", timezone: "Asia/Taipei", sourceType: "MANUAL" });
  await createResource(page, "content-assets", { id: contentId, businessId: null, title: `離線內容-${suffix}`, description: "", topic: "驗收", style: "教學", format: "VIDEO", lengthValue: null, lengthUnit: null, campaign: "" });
  await createResource(page, "platform-posts", { id: postId, contentAssetId: contentId, socialAccountId, externalPostId: null, permalink: null, platformFormat: "VIDEO", publishedAt: "2026-08-01T04:00:00.000Z", publishedTimezone: "Asia/Taipei", sourceType: "MANUAL" });
  await createResource(page, "social-metrics", { id: socialMetricId, platformId, metricKey: socialMetricKey, providerMetricName: "觀看次數", providerDefinition: "手動驗收來源", providerDefinitionVersion: "manual-v1", unit: "count", scope: "POST", isCumulative: true, comparableFamily: "views", sourceType: "MANUAL" });
  await openAndRegister(page, "/social");
  const snapshotForm = page.locator("form").filter({ has: page.getByRole("button", { name: "保存快照" }) });
  await snapshotForm.getByLabel("指標").selectOption(socialMetricId);
  await snapshotForm.getByLabel("貼文（選貼文時帳號留空）").selectOption(postId);
  await snapshotForm.getByLabel("觀測時間").fill("2026-08-02T12:00");
  await snapshotForm.getByLabel("值").fill("1000");
  const conversionForm = page.locator("form").filter({ has: page.getByRole("button", { name: "保存成交" }) });
  await conversionForm.getByLabel("歸因貼文").selectOption(postId);
  await conversionForm.getByLabel("確認時間").fill("2026-08-02T12:00");
  await conversionForm.getByLabel("成交數").fill("10");
  await conversionForm.getByLabel("分母指標鍵").fill(socialMetricKey);
  await conversionForm.getByLabel("歸因證據與理由").fill("人工確認成交紀錄");
  await setConnectivity(page, context, true);
  await snapshotForm.getByRole("button", { name: "保存快照" }).click();
  await conversionForm.getByRole("button", { name: "保存成交" }).click();
  await expectPending(page, testInfo, 2);
  const socialSync = await reconnectAndSync(page, context, testInfo);
  expect(socialSync.pulled).toContain("人工確認成交紀錄");
});

test("離線期限建立可同步", async ({ page, context }, testInfo) => {
  test.setTimeout(90_000);
  const suffix = `${testInfo.project.name}-${Date.now()}`;
  const deadlineName = `離線期限-${suffix}`;
  await openAndRegister(page, "/deadlines");
  const deadlineForm = page.locator("form").filter({ has: page.getByRole("button", { name: "建立期限" }) });
  await deadlineForm.getByLabel("名稱").fill(deadlineName);
  await deadlineForm.getByLabel("開始處理日").fill("2026-08-02");
  await deadlineForm.getByLabel("正式到期日").fill("2026-08-31");
  await deadlineForm.getByLabel("完成條件").fill("確認正式完成證據");
  await setConnectivity(page, context, true);
  await deadlineForm.getByRole("button", { name: "建立期限" }).click();
  await expectPending(page, testInfo, 1);
  const deadlineSync = await reconnectAndSync(page, context, testInfo);
  expect(deadlineSync.pulled).toContain(deadlineName);
});

test("離線任務完成可同步", async ({ page, context }, testInfo) => {
  test.setTimeout(90_000);
  const suffix = `${testInfo.project.name}-${Date.now()}`;
  const taskId = uuidv7();
  await createResource(page, "tasks", { id: taskId, areaId: null, businessId: null, title: `待完成任務-${suffix}`, description: "", whyText: "", completionCriteria: "完成", lowClarityGuide: "先做一步", metricRole: "ACTION", estimatedMinutes: 5, priority: 90, pinnedNextAction: true });
  await createResource(page, "task-schedules", { id: uuidv7(), taskDefinitionId: taskId, recurrenceKind: "ONCE", startsOnLocalDate: "2026-08-02", dueLocalTime: null, timezone: "Asia/Taipei", weekdays: null, monthDay: null, rruleText: null, intervalValue: 1, endsOnLocalDate: null });
  await openAndRegister(page, "/");
  const action = page.locator(".action-list li").filter({ hasText: `待完成任務-${suffix}` });
  await expect(action).toBeVisible();
  await setConnectivity(page, context, true);
  await action.getByRole("button", { name: "完成" }).click();
  await expectPending(page, testInfo, 1);
  const completionSync = await reconnectAndSync(page, context, testInfo);
  expect(completionSync.pulled).toContain(taskId);
});

test("正式圖表具完整語意、事件互動且D1資料更新會改變曲線", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.emulateMedia({ reducedMotion: "reduce" });

  const accountId = uuidv7();
  const incomeSourceId = uuidv7();
  await createResource(page, "financial-accounts", { id: accountId, name: "圖表驗收台幣帳戶", accountType: "BANK", currencyCode: "TWD", minorUnitScale: 0, institution: "", includeInNetWorth: true });
  await createResource(page, "income-sources", { id: incomeSourceId, businessId: null, name: "正式顧問收入", description: "圖表來源驗收" });
  for (const [kind, amount, date, sourceId] of [
    ["INCOME", 100_000, "2026-01-05", incomeSourceId],
    ["EXPENSE", 40_000, "2026-01-12", null],
    ["INCOME", 120_000, "2026-02-05", incomeSourceId],
    ["EXPENSE", 50_000, "2026-02-12", null],
  ] as const) {
    await createResource(page, "transactions", { id: uuidv7(), transactionKind: kind, occurredOnLocalDate: date, occurredAt: null, timezone: "Asia/Taipei", accountId, counterpartyAccountId: null, categoryId: null, incomeSourceId: sourceId, businessId: null, amountMinor: amount, currencyCode: "TWD", minorUnitScale: 0, note: "圖表驗收", evidenceRef: "e2e-formal-record", sourceType: "MANUAL" });
  }
  await openAndRegister(page, "/finance");
  const cashFlowChart = page.locator('figure[aria-label="收入、開銷與淨現金流"]');
  await expect(cashFlowChart).toBeVisible();
  await expect(cashFlowChart).toHaveAttribute("data-chart-points", "2");
  await expect(cashFlowChart).toContainText("月份（Asia/Taipei）");
  await expect(cashFlowChart).toContainText("金額（TWD minor units）");
  await expect(cashFlowChart).toContainText("收入");
  await expect(cashFlowChart).toContainText("開銷");
  await expect(cashFlowChart).toContainText("淨現金流");
  const firstCurve = await cashFlowChart.locator(".recharts-line-curve").first().getAttribute("d");
  expect(firstCurve).toBeTruthy();
  await cashFlowChart.getByRole("application").focus();
  await page.keyboard.press("ArrowRight");
  await expect(cashFlowChart.locator(".recharts-tooltip-wrapper")).toContainText("TWD minor units");
  await cashFlowChart.locator("summary").click();
  await expect(cashFlowChart).toContainText("finance.cash_flow_series／v1");
  await expect(cashFlowChart).toContainText("SUM_INCOME_AND_EXPENSE_BY_PERIOD");
  await expect(cashFlowChart.locator('a[href="#financial-transaction-records"]')).toBeVisible();

  await createResource(page, "transactions", { id: uuidv7(), transactionKind: "INCOME", occurredOnLocalDate: "2026-03-05", occurredAt: null, timezone: "Asia/Taipei", accountId, counterpartyAccountId: null, categoryId: null, incomeSourceId, businessId: null, amountMinor: 150_000, currencyCode: "TWD", minorUnitScale: 0, note: "更新曲線", evidenceRef: "e2e-formal-record", sourceType: "MANUAL" });
  await page.reload({ waitUntil: "domcontentloaded" });
  const updatedCashFlowChart = page.locator('figure[aria-label="收入、開銷與淨現金流"]');
  await expect(updatedCashFlowChart).toHaveAttribute("data-chart-points", "3", { timeout: 20_000 });
  const updatedCurve = await updatedCashFlowChart.locator(".recharts-line-curve").first().getAttribute("d");
  expect(updatedCurve).not.toBe(firstCurve);
  await testInfo.attach("財務分析正式圖表", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });

  const metricId = uuidv7();
  const metricKey = `focused_hours_${Date.now()}`;
  await createResource(page, "metrics", { id: metricId, key: metricKey, name: "專注時數", unit: "hours", valueType: "DECIMAL", role: "ACTION", domain: "work", areaId: null, businessId: null, recordingFrequency: "DAILY", sourcePolicy: "MANUAL", precision: 1 });
  for (const [observedAt, value] of [["2026-01-02T04:00:00.000Z", "2.5"], ["2026-01-03T04:00:00.000Z", "4.0"]] as const) {
    await createResource(page, "metric-observations", { id: uuidv7(), metricDefinitionId: metricId, observedAt, inputLocalDate: observedAt.slice(0, 10), inputTimezone: "Asia/Taipei", valueDecimal: value, valueText: null, quality: "MANUAL", sourceRefType: null, sourceRefId: null, sourceType: "MANUAL" });
  }
  await navigate(page, "/metrics");
  await page.getByLabel("查看指標").selectOption(metricId);
  const metricChart = page.locator('figure[aria-label="專注時數時間序列"]');
  await expect(metricChart).toBeVisible();
  await expect(metricChart).toContainText("hours");
  await metricChart.locator("summary").click();
  await expect(metricChart).toContainText(`${metricKey}／v1`);
  await expect(metricChart).toContainText("NONE_RAW_SERIES");
  await expect(metricChart.locator('a[href="#metric-observation-records"]')).toBeVisible();

  const platforms = await getApiJson<{ data: Array<{ id: string }> }>(page, "/api/v1/platforms");
  const platformId = platforms.data[0].id;
  const socialAccountId = uuidv7();
  const socialMetricId = uuidv7();
  const socialMetricKey = `chart_views_${Date.now()}`;
  const eventTypeId = uuidv7();
  await createResource(page, "social-accounts", { id: socialAccountId, platformId, displayName: "圖表驗收頻道", externalAccountId: null, accountKind: "CHANNEL", timezone: "Asia/Taipei", sourceType: "MANUAL" });
  await createResource(page, "social-metrics", { id: socialMetricId, platformId, metricKey: socialMetricKey, providerMetricName: "觀看次數", providerDefinition: "手動正式觀測", providerDefinitionVersion: "manual-v1", unit: "count", scope: "POST", isCumulative: true, comparableFamily: "views", sourceType: "MANUAL" });
  await createResource(page, "event-types", { id: eventTypeId, name: "內容調整", colorToken: "event" });
  const posts: string[] = [];
  for (const [style, day, value] of [["教學", "01", "100"], ["故事", "03", "200"]] as const) {
    const contentId = uuidv7();
    const postId = uuidv7();
    const publishedAt = `2026-03-${day}T00:00:00.000Z`;
    posts.push(postId);
    await createResource(page, "content-assets", { id: contentId, businessId: null, title: `${style}正式內容`, description: "", topic: "驗收", style, format: "VIDEO", lengthValue: null, lengthUnit: null, campaign: "" });
    await createResource(page, "platform-posts", { id: postId, contentAssetId: contentId, socialAccountId, externalPostId: null, permalink: null, platformFormat: "VIDEO", publishedAt, publishedTimezone: "Asia/Taipei", sourceType: "MANUAL" });
    await createResource(page, "social-snapshots", { id: uuidv7(), socialMetricDefinitionId: socialMetricId, socialAccountId: null, platformPostId: postId, observedAt: `2026-03-${String(Number(day) + 1).padStart(2, "0")}T00:00:00.000Z`, publishedAt, ageSeconds: 86_400, valueDecimal: value, isCumulative: true, quality: "EXACT", rawPayloadId: null, importRowId: null, sourceType: "MANUAL" });
  }
  await createResource(page, "social-snapshots", { id: uuidv7(), socialMetricDefinitionId: socialMetricId, socialAccountId: null, platformPostId: posts[0], observedAt: "2026-03-01T12:00:00.000Z", publishedAt: "2026-03-01T00:00:00.000Z", ageSeconds: 43_200, valueDecimal: "50", isCumulative: true, quality: "EXACT", rawPayloadId: null, importRowId: null, sourceType: "MANUAL" });
  await createResource(page, "events", { id: uuidv7(), eventTypeId, areaId: null, businessId: null, title: "內容調整事件", description: "修改縮圖與標題", startsAt: "2026-03-01T18:00:00.000Z", endsAt: null, inputTimezone: "Asia/Taipei", sourceReference: "e2e-formal-event", sourceType: "MANUAL" });

  await navigate(page, "/social");
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "社群內容、首日比較與轉化" })).toBeVisible({ timeout: 20_000 });
  await page.getByLabel("曝光指標").selectOption(socialMetricKey);
  const comparisonChart = page.locator(`figure[aria-label="各內容風格首日曝光平均"]`);
  await expect(comparisonChart).toHaveAttribute("data-chart-points", "2");
  await comparisonChart.locator("summary").click();
  await expect(comparisonChart).toContainText(`social.first_day.${socialMetricKey}.mean／v1`);
  await expect(comparisonChart).toContainText('"targetHours":24');
  await page.getByLabel("曝光聚合").selectOption("DISTRIBUTION");
  const distributionChart = page.locator('figure[aria-label="各內容風格首日曝光分布"]');
  await expect(distributionChart).toBeVisible();
  for (const legend of ["最小值", "第一四分位數", "中位數", "第三四分位數", "最大值"]) await expect(distributionChart).toContainText(legend);

  await page.getByRole("combobox", { name: "貼文", exact: true }).selectOption(posts[0]);
  await page.getByRole("combobox", { name: "指標", exact: true }).first().selectOption(socialMetricId);
  await page.getByRole("combobox", { name: "事件類型篩選", exact: true }).selectOption(eventTypeId);
  const timelineChart = page.locator('figure[aria-label="貼文觀測與事件"]');
  await expect(timelineChart).toHaveAttribute("data-chart-points", "2");
  const eventMarker = timelineChart.getByRole("button", { name: /內容調整事件/ });
  await expect(eventMarker).toBeVisible();
  await eventMarker.hover();
  await eventMarker.click();
  await expect(timelineChart.getByRole("status")).toContainText("修改縮圖與標題");
  await expect(timelineChart.getByRole("status")).toContainText("內容調整");
  await testInfo.attach("社群分析與事件圖表", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
});

test("完整viewport維持首頁優先層級、期限入口與reduced-motion", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const deadlineName = `首頁層級期限-${testInfo.project.name}`;
  await createResource(page, "deadlines", { id: uuidv7(), templateId: null, parentDeadlineId: null, name: deadlineName, institution: "正式驗收", accountHint: "", actionableFromLocalDate: "2026-08-01", dueLocalDate: "2026-08-31", timezone: "Asia/Taipei", completionCondition: "完成正式處理", instructions: "依正式文件執行", importance: "SUPER_CRITICAL", status: "OPEN", completedAt: null, nextOccurrenceLocalDate: null, lastSignedLocalDate: null, calculatedDueLocalDate: null, confirmedDueLocalDate: null, calculationBasis: null });
  await openAndRegister(page, "/");
  await expect(page.locator("main section").first().getByRole("heading", { name: "今日行動中心" })).toBeVisible();
  await expect(page.locator(".critical-inline-entry")).toContainText("超級無敵重要期限");
  await expect(page.locator(".critical-interrupt")).toBeVisible();
  await expect(page.locator("main")).toContainText(deadlineName);
  const layout = await page.evaluate(() => ({ width: window.innerWidth, scrollWidth: document.documentElement.scrollWidth, reduced: matchMedia("(prefers-reduced-motion: reduce)").matches }));
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.width);
  expect(layout.reduced).toBe(true);
  const motion = await page.evaluate(() => {
    const seconds = (value: string) => Math.max(...value.split(",").map((part) => Number.parseFloat(part) * (part.trim().endsWith("ms") ? 0.001 : 1)));
    return [...document.querySelectorAll("*")].reduce((maximum, element) => {
      const style = getComputedStyle(element);
      return Math.max(maximum, seconds(style.animationDuration), seconds(style.transitionDuration));
    }, 0);
  });
  expect(motion).toBeLessThanOrEqual(0.000_01);
  await testInfo.attach(`首頁期限-${testInfo.project.name}`, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
});
