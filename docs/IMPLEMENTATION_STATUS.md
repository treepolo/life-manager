# 實作狀態

本表只追蹤 2026-08-30 精簡改造後的有效需求。舊版完整狀態可由 Git 歷史查閱。

| 需求 | 狀態 | 證據／剩餘閘門 |
|---|---|---|
| PROD-001~004 | IMPLEMENTED_UNVERIFIED | 新三頁產品、五種資料資源與精簡 Worker 已在 `refactor/core-life-manager`；等待完整 CI。 |
| PROD-005 | AWAITING_USER_SETUP | 正式舊表清理必須先確認所有裝置 outbox=0、完成遠端 D1 備份與新版 staging 驗證。 |
| TASK-001~006 | IMPLEMENTED_UNVERIFIED | 新任務／分類模型、每日完成與分類累積計算已完成；等待 CI。 |
| FIN-001~006 | IMPLEMENTED_UNVERIFIED | 新目標與財務歷史模型、修改／刪除與目前值推導已完成；等待 CI。 |
| UI-001~006 | IMPLEMENTED_UNVERIFIED | 三頁蠟筆手繪介面與三張成果圖已完成；等待五種 viewport Playwright。 |
| OFF-001~005 | IMPLEMENTED_UNVERIFIED | 舊同步底座保留並泛化；修正離線 DELETE 與連續 UPSERT outbox 問題；等待 CI。 |
| OPS-001~004 | IMPLEMENTED_UNVERIFIED | Cloudflare/D1/Access/PWA 底座保留，舊 provider、OAuth、cron、通知產品程式已退出；等待 CI。 |
| OPS-005 | AWAITING_USER_SETUP | 不建立或套用 drop 舊表 migration，直到正式資料安全閘門完成。 |

## 本次改造已完成的程式工作

- 新增 `0011_simple_core.sql`，建立任務分類、每日任務、每日完成、財務目標、財務歷史五張新版表。
- 通用 API 與同步資源只暴露新版五種產品實體。
- Worker API 只保留健康檢查、通用 CRUD、裝置同步、變更拉取與同步衝突。
- 首頁、每日任務、設定三頁全部重做；舊產品頁面與模組已從分支刪除。
- 新增財務歷史刪除、完整分頁讀取、離線刪除 tombstone 與 outbox 合併。
- 新增新版單元、Worker/D1 與 Playwright 測試。

## 尚未完成

- 完整 CI 尚未在本分支成功跑完，因此目前不得把 IMPLEMENTED_UNVERIFIED 改成 VERIFIED。
- 尚未部署 staging 或 production。
- 尚未 drop 正式 D1 舊產品表；這是刻意保留的資料安全閘門。
