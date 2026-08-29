# 需求追蹤矩陣

| 需求 | 主要實作 | 驗證 |
|---|---|---|
| PROD-001~004 | `src/app/App.tsx`、`src/app/pages/*`、`src/modules/simple/*`、`src/worker/api/resources.ts` | `tests/e2e/app.spec.ts`、`tests/worker/api-d1.test.ts` |
| PROD-005 | migration 治理；舊表 cleanup 尚未建立 | `docs/OPERATIONS.md` 的正式資料庫閘門 |
| TASK-001~003 | `HomePage.tsx`、`TasksPage.tsx`、`simple/schema.ts`、`0011_simple_core.sql` | E2E 任務流程、Worker/D1 測試 |
| TASK-004 | `daily_task_completions_v2` partial unique index、通用 DELETE | Worker/D1 完成／撤銷測試 |
| TASK-005 | `task_categories_v2`、`daily_tasks_v2` archive/restore | 任務管理流程與通用 CRUD |
| TASK-006 | `simple/analytics.ts` | `simple-analytics.test.ts` |
| FIN-001 | `financial_goals_v2`、`SettingsPage.tsx` | Worker/D1 與 E2E 財務流程 |
| FIN-002~003 | `financial_history_v2`、`SettingsPage.tsx`、`deleteResource` | Worker/D1 與 E2E 新增／修正／刪除 |
| FIN-004~005 | `currentFinancialValue`、`buildFinancialSeries` | `simple-analytics.test.ts` |
| FIN-006 | `simple/schema.ts`、`0011_simple_core.sql` | Worker/D1 schema 驗證 |
| UI-001~004 | `HomePage.tsx`、`CrayonLineChart.tsx` | E2E 首頁與成果區塊 |
| UI-005~006 | `src/styles.css`、`CrayonLineChart.tsx` | Playwright 五種 viewport |
| OFF-001 | `client-db.ts`、`sync-manager.ts`、`SyncProvider.tsx` | `offline-sync.test.ts`、離線 E2E |
| OFF-002~003 | `client-db.ts` outbox 合併與刪除語意 | `offline-sync.test.ts` |
| OFF-004 | `sync/server.ts`、`conflict_records` | 通用同步衝突機制 |
| OFF-005 | `PwaUpdate.tsx`、`public/sw.js` | `pwa-update.test.tsx`、`pwa-build.test.mjs`、viewport E2E |
| OPS-001 | `src/worker/index.ts`、`wrangler.toml`、Access 驗證 | `access.test.ts`、Worker/D1 測試 |
| OPS-002 | 精簡 Worker；移除 provider/通知/cron 程式 | source tree 與 production scan |
| OPS-003 | `migrations/0001`~`0011` | Worker migration 測試 |
| OPS-004 | `package.json` verify pipeline、GitHub Actions | CI 工作流 |
| OPS-005 | `docs/OPERATIONS.md` | 部署前人工安全閘門，尚未執行舊表 drop |

## 規格衝突紀錄

2026-08-30 的使用者明確決定取代此前把領域、事業、社群、投資、期限、通用指標、事件與外部平台整合列為第一批產品功能的舊規格。基礎設施與維護能力仍保留；舊產品資料表在正式安全閘門完成前暫不物理刪除。
