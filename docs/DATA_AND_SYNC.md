# 資料、離線同步、公式與備份

## 1. 資料設計原則

- 使用ULID或UUIDv7等可離線生成且全域唯一的ID。
- 所有資料保存`created_at`、`updated_at`、`version`、`source_type`及必要audit欄位。
- 日期時間以UTC instant保存，另保存使用者輸入的local date／timezone語意；顯示使用Asia/Taipei。
- 金錢使用`amount_minor`整數、`currency_code`及`minor_unit_scale`，不使用浮點數累積。
- 比率與匯率使用高精度decimal string或固定縮放整數，運算後依規則四捨五入。
- 刪除使用`tombstone`及`deleted_at`支援跨裝置同步，重要資料優先封存。
- 所有匯入與外部API資料保存來源證據，不允許只有轉換後結果。

## 2. 建議主要資料表

### 2.1 Core與自定義

- `areas`
- `businesses`
- `entity_links`
- `tags`
- `entity_tags`
- `event_types`
- `events`
- `metric_definitions`
- `metric_observations`
- `formula_definitions`
- `saved_views`
- `audit_log`

`metric_definitions`至少包含`key`、`name`、`unit`、`value_type`、`role`、`domain`、`source_policy`及`archived_at`。

### 2.2 Tasks

- `task_definitions`
- `task_schedules`
- `task_occurrences`
- `task_completions`

Occurrence需可重建但不得因排程修改而抹除歷史。Completion為append-only。

### 2.3 Finance

- `financial_accounts`
- `finance_categories`
- `income_sources`
- `financial_transactions`
- `asset_definitions`
- `asset_snapshots`
- `fx_rates`
- `expense_baselines`

`financial_transactions`保存原幣金額；TWD換算可以查詢時計算或保存版本化derived snapshot，但必須保留匯率證據。

### 2.4 Investments與匯入

- `brokerage_accounts`
- `brokerage_activity`
- `import_batches`
- `import_files`
- `import_rows`
- `import_mapping_profiles`
- `source_reported_values`

`import_rows`保存原始列JSON、row hash、解析狀態、正規化entity ID及錯誤。去重鍵不得只依賴列號；應使用帳戶、日期、活動類型、金額、標的、交易識別及原始雜湊的穩定組合，並提供人工處理重複候選。

### 2.5 Social

- `social_platforms`
- `social_accounts`
- `content_assets`
- `platform_posts`
- `social_metric_definitions`
- `social_metric_snapshots`
- `conversion_records`
- `comparison_definitions`
- `provider_connections`
- `provider_raw_payloads`
- `provider_sync_runs`
- `provider_sync_jobs`

`content_assets`保存內容風格／主題等分析條件；`platform_posts`保存平台發布實體。不得把平台帳號總指標與單篇指標混在同一個無類型欄位。

### 2.6 Deadlines與通知

- `deadline_items`
- `deadline_completions`
- `deadline_templates`
- `notification_channels`
- `push_subscriptions`
- `notification_deliveries`
- `notification_preferences`

`deadline_items`只有兩種importance。提醒啟動依`actionable_from_local_date`，可另有`due_local_date`。全域通知時間及重複週期放在`notification_preferences`，不為每一事項建立多階段日期。

### 2.7 Sync

- `sync_operations`
- `sync_devices`
- `sync_cursors`
- `conflict_records`

## 3. 原始資料與正規化資料

每次YouTube、Instagram或CSV匯入需：

1. 建立`provider_sync_run`或`import_batch`。
2. 保存原始payload／原始列及雜湊。
3. 驗證schema與來源識別。
4. 正規化到正式資料表。
5. 建立來源參照。
6. 記錄新增、更新、忽略、重複及錯誤數。
7. 允許從原始證據重新正規化，不能要求重新向平台抓取才能修正parser。

原始資料的保存期限預設長期保留；若資料量接近免費額度，再提供可預覽的清理功能，不能靜默刪除。

## 4. 社群數據時間窗

### 4.1 累積快照

平台常回傳截至觀測當下的累積值。每筆snapshot需保存：

- `observed_at`;
- `published_at`;
- `age_seconds`;
- `metric_key`;
- `value`;
- `is_cumulative`;
- provider metric name／version;
- raw payload reference.

### 4.2 首日值

首日分析的品質標記：

- `EXACT`：觀測時間在設定的精確容許範圍；
- `NEAREST`：使用最近值，需顯示偏差；
- `INTERPOLATED`：只有在指標定義允許且公式明示時；
- `INSUFFICIENT`：沒有可接受觀測。

預設不得對累積曝光做未揭露線性插值。結果UI顯示每篇內容實際觀測年齡。

## 5. 公式引擎

### 5.1 支援語法

- numeric literals；
- metric references；
- `+ - * /`；
- 括號；
- 可白名單化的聚合函式，例如`SUM`、`AVG`、`COUNT`、`LAST`、`DELTA`；
- 明確時間窗參數。

### 5.2 禁止

- JavaScript；
- `eval`；
- 網路存取；
- SQL片段；
- 動態屬性存取；
- 無界遞迴；
- 跨使用者資料（本產品雖單人，仍禁止）。

### 5.3 版本與依據

公式修改建立新版本，歷史結果保留使用版本。計算時輸出AST、輸入值、來源、缺失、四捨五入及結果品質。

## 6. 離線客戶端資料

IndexedDB至少包含：

- `entities`：最近同步資料，以type＋id索引；
- `outbox`：待送operation；
- `syncMeta`：cursor、最後同步時間及schema版本；
- `conflicts`；
- `appSettings`；
- `cachedQueries`（可重建）。

敏感OAuth token不得進IndexedDB。

## 7. 寫入與同步協定

### 7.1 Operation格式

```json
{
  "operationId": "uuid",
  "deviceId": "uuid",
  "entityType": "financial_transaction",
  "entityId": "uuid",
  "kind": "UPSERT",
  "baseVersion": 3,
  "payload": {},
  "clientOccurredAt": "...",
  "schemaVersion": 1
}
```

伺服器以`operationId`保證冪等；重送同一operation不得產生重複交易或完成紀錄。

### 7.2 同步流程

1. 本機transaction同時更新entity與outbox。
2. 同步器按建立順序批次傳送。
3. 伺服器在D1 transaction驗證、套用及記錄operation。
4. 伺服器回傳新version及變更cursor。
5. 客戶端刪除成功outbox並拉取cursor後的新變更。
6. 失敗保留可讀錯誤及重試，不丟資料。

實作約束：

- pull必須帶已註冊且未停用的`deviceId`；伺服器更新`sync_devices.last_seen_at`及`sync_cursors.last_pulled_cursor`，不得接受匿名cursor推進。
- 同一瀏覽器的普通API、sync batch與後續pull共用`src/core/network/request-gate.ts`，確保D1寫入／拉取不與頁面重抓重疊；這是請求排序，不是省略任何資料。
- 每一輪同步以30秒具名逾時包住請求閘門、batch與pull；逾時或呼叫端取消時保留outbox並顯示可讀錯誤，不把未確認資料當成成功。
- 同步進行中若收到另一個自動或手動觸發，完成當輪後必須再跑一輪；避免操作在當輪讀取outbox之後才寫入而滯留。自動同步成功後立即刷新查詢與待同步計數。
- `RESTORE`對可封存資料清除`archived_at`，對可刪除資料清除`deleted_at`；同步change snapshot、IndexedDB及D1必須使用相同欄位語意。
- Server acknowledgement只有在同一entity沒有後續outbox operation時才清除本機`pending`；未確認的後續操作不得被伺服器snapshot覆蓋。
- Service Worker shell明確預快取`/assets/app.js`與`/assets/app.css`，使使用者在離線重開後仍能啟動App並從IndexedDB讀出正式資料與outbox。

### 7.3 衝突

- `baseVersion`等於伺服器version：套用。
- 不等：回傳409及伺服器資料。
- UI提供本機版本、伺服器版本及欄位差異。
- 不得使用無提示last-write-wins處理金額、期限完成狀態或指引。
- append-only completion／observation使用獨立ID，通常不衝突。
- delete使用tombstone，避免離線裝置復活已刪資料。

### 7.4 觸發同步

- `online`事件；
- App初始化；
- `visibilitychange`回到前景；
- 手動同步；
- 支援時Background Sync。

每次同步需有timeout、批次大小、退避及可取消機制。

## 8. Service Worker與更新

- 快取版本化app shell及靜態資產。
- API使用network-first，不將私人API回應放入公開Cache Storage；正式資料進IndexedDB。
- 新版本可用時顯示更新提示，不能在使用者有未同步outbox時強制reload。
- 更新前先完成或保存outbox。
- 離線時仍可顯示重要期限警告及本地待辦。

## 9. 資料匯出

### 9.1 JSON

匯出含schema version、exported_at、所有entity及來源參照；秘密、Access JWT、OAuth token、Resend key與Push私鑰永不匯出。

### 9.2 CSV

每個模組使用穩定欄名與資料字典。以`'`或安全策略處理以`= + - @`開頭的字串，防試算表公式注入。

### 9.3 SQL

文件化使用`wrangler d1 export`。還原測試需在乾淨本機D1套用並比對row counts及關鍵checksum。

## 10. 備份與復原

- 使用D1 Time Travel作短期災難復原，但不視為唯一備份。
- 使用者可隨時匯出JSON／CSV。
- 發布破壞性migration前建立D1 SQL匯出。
- 每個release需執行一次本機還原測試。
- `OPERATIONS.md`記錄復原命令、最近成功日期及驗證結果。

## 11. 已實作保留與安全刪除

- 操作、通知及Cron紀錄預設保留365日，已消耗／過期OAuth state預設30日；天數以Worker vars調整，排程實作在`src/worker/scheduled/index.ts`。
- 同步change log超過保留期仍不代表可刪；必須存在有效裝置，且所有有效裝置游標都已越過該筆。沒有有效裝置或任何裝置尚未pull時保留。
- 使用者資料刪除先保留server tombstone；離線舊版本再次送出只會形成衝突，不會復活資料。
- 原始CSV與provider payload是來源證據，標為長期保存，不進自動log清理。未來提供刪除時必須先顯示受影響的normalized rows與source refs、要求備份、使用冪等operation並寫audit。
- 固定答案D1測試涵蓋「游標0不刪、游標越過才刪」及「DELETE tombstone阻止舊離線版本復活」。
