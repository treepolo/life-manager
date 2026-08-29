# 技術架構

## 1. 目標

新版人生管理器保留原有單體部署與離線同步底座，只替換產品領域。整個系統仍由一個 Cloudflare Worker 提供 API 與 Static Assets，一個 D1 保存正式資料；前端為 React／TypeScript／Vite。

## 2. 有效分層

### App

- `src/app/App.tsx`：只註冊首頁、每日任務、設定。
- `src/app/pages/HomePage.tsx`：今日任務、目前財務值、成果曲線。
- `src/app/pages/TasksPage.tsx`：任務分類與每日任務管理。
- `src/app/pages/SettingsPage.tsx`：財務目標、財務歷史、同步狀態。
- `src/app/providers/SyncProvider.tsx`：全域同步生命週期。
- `src/app/providers/PwaUpdate.tsx`：安全 PWA 更新。

### Product domain

`src/modules/simple` 是唯一有效產品領域，包含 schema、型別、Asia/Taipei 日期與成果計算。舊 task/finance/social/deadline/metric 等領域模組已退役。

### Core infrastructure

`src/core` 提供 Access、D1 helper、錯誤、network request gate、IndexedDB/outbox、同步、時間與共用驗證。Core 不依賴產品頁。

### Worker

`src/worker/api/resources.ts` 宣告五種新版 resource；`crud.ts` 提供版本化 CRUD、tombstone、audit、change log；`src/core/sync/server.ts` 以 resource definition 套用離線操作。Worker 路由只保留健康檢查、CRUD、裝置註冊、同步 batch/pull 與衝突處理。

## 3. 新版資料實體

- `task_categories_v2`
- `daily_tasks_v2`
- `daily_task_completions_v2`
- `financial_goals_v2`
- `financial_history_v2`

舊產品表仍存在於既有 D1，只因正式資料清理有額外安全閘門；新版程式不再以它們作為產品資料來源。

## 4. 同步契約

所有新版實體共用：`entityType`、`entityId`、`kind`、`baseVersion`、`payload`、`operationId`。新增使用離線可生成 UUIDv7；更新依 version 做樂觀鎖；刪除用 tombstone；衝突寫入 `conflict_records`。同一實體的連續離線 UPSERT 由客戶端合併，避免自己製造舊版本衝突。

## 5. 視覺

Recharts 只作繪圖引擎；新版 `CrayonLineChart` 是輕量手繪 wrapper。產品不再使用舊通用指標／provenance chart 契約。

## 6. 安全與部署

Cloudflare Access 仍保護整個 API；正式環境不建立自有會員。migration 永遠 additive；`0001`～`0010` 不修改。破壞性舊表 cleanup 必須另外通過正式 D1 備份、outbox=0、staging 驗證三個條件。
