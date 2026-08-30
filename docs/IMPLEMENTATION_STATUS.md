# 實作狀態

本表只追蹤 2026-08-30 精簡改造後的有效需求。舊版完整狀態可由 Git 歷史查閱。

| 需求 | 狀態 | 證據／剩餘閘門 |
|---|---|---|
| PROD-001~004 | VERIFIED | `refactor/core-life-manager` 已完成新三頁產品、五種資料資源與精簡 Worker；GitHub Actions 完整 `npm run verify` 已通過。 |
| PROD-005 | AWAITING_USER_SETUP | 正式舊表清理必須先確認所有裝置 outbox=0、完成遠端 D1 備份與新版 staging 驗證。 |
| TASK-001~006 | VERIFIED | 新任務／分類模型、每日完成／撤銷與分類累積計算已通過單元、Worker/D1 與 Playwright 驗證。 |
| FIN-001~006 | VERIFIED | 新目標與財務歷史模型、修改／刪除、最新有效值回退與首頁反映已通過單元、Worker/D1 與 Playwright 驗證。 |
| UI-001~006 | VERIFIED | 三頁蠟筆手繪介面與三張成果圖已通過桌機、大桌機、平板與兩種手機 viewport 驗證。 |
| OFF-001~005 | VERIFIED | 既有同步底座已泛化至新版五種資源；離線 DELETE 與連續 UPSERT outbox 修正已通過單元及離線恢復同步 Playwright 驗證。 |
| OPS-001~004 | VERIFIED | Cloudflare/D1/Access/PWA 底座保留，舊 provider、OAuth、cron、通知產品程式已退出；lint、型別、Worker/D1、build、掃描與需求覆蓋均通過。 |
| OPS-005 | AWAITING_USER_SETUP | 不建立或套用 drop 舊表 migration，直到正式資料安全閘門完成。 |

## 本次改造已驗證的程式工作

- 新增 `0011_simple_core.sql`，建立任務分類、每日任務、每日完成、財務目標、財務歷史五張新版表。
- 通用 API 與同步資源只暴露新版五種產品實體。
- Worker API 只保留健康檢查、通用 CRUD、裝置同步、變更拉取與同步衝突。
- 首頁、每日任務、設定三頁全部重做；舊產品頁面與模組已從分支刪除。
- 新增財務歷史刪除、完整分頁讀取、離線刪除 tombstone 與 outbox 合併。
- 新版單元測試、Worker/D1 測試、production build 與 Playwright 回歸全部通過。
- Playwright 覆蓋每日任務建立／完成／撤銷、財務目標與歷史新增／修正／刪除、離線新增後恢復同步、核心入口／成果區塊，以及 1366×900、1920×1080、768×1024、390×844、320×568 五種 viewport。
- production placeholder／secret 掃描與新版需求追蹤覆蓋檢查均通過。

## 尚未完成

- 尚未部署 staging 或 production。
- 尚未 drop 正式 D1 舊產品表；這是刻意保留的資料安全閘門，必須先確認所有裝置 outbox=0、完成遠端 D1 備份並驗證 staging。
