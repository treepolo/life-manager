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
- `provider_sync_run_payloads`
- `provider_sync_jobs`

`content_assets`保存內容風格／主題等分析條件；`platform_posts`保存平台發布實體。不得把平台帳號總指標與單篇指標混在同一個無類型欄位。

`social_metric_snapshots`的帳號級與貼文級目標是XOR關係。schema 9由`0009_social_snapshot_uniqueness.sql`分別以partial unique index保證`(definition, account, observed_at, source_type)`與`(definition, post, observed_at, source_type)`唯一；不能依賴同時包含兩個可空外鍵的原始UNIQUE，因SQLite的`NULL`不互相衝突。schema 10新增`provider_sync_run_payloads`，在不複製相同raw內容的前提下保存每次run的payload順序與完整來源集合。

### 2.6 Deadlines與通知

- `deadline_items`
- `deadline_completions`
- `deadline_templates`
- `notification_channels`
- `push_subscriptions`
- `notification_deliveries`
- `notification_preferences`

`deadline_items`只有兩種importance。提醒啟動依`actionable_from_local_date`，可另有`due_local_date`。全域通知時間及重複週期放在`notification_preferences`，不為每一事項建立多階段日期。

Web Push的裝置狀態以`push_subscriptions.device_id`分開保存，裝置名稱以`sync_devices.display_name`對應；同步客戶端的預設名稱不得覆寫使用者已設定的名稱。因 endpoint 以AES-GCM隨機IV加密，API比對同裝置重訂閱時必須在伺服器端解密比對明文，不能以`endpoint_encrypted`直接做邏輯相等。API與排程以`updated_at`、`created_at`、`id`的穩定降冪順序取每台裝置最新列，再篩選`ACTIVE`且未停用；Push provider成功欄位代表服務接受傳輸，不代表瀏覽器顯示或真人已看見。這些規則使用既有`0005`欄位，不新增migration。

### 2.7 Sync

- `sync_operations`
- `sync_devices`
- `sync_cursors`
- `conflict_records`

### 2.8 成本防線

- `cost_guardrail_contract_observations`
- `cost_guardrail_usage_observations`
- `cost_guardrail_budget_windows`
- `cost_guardrail_reservations`
- `cost_guardrail_ledger_events`
- `cost_guardrail_alerts`
- `cost_guardrail_breaker_events`
- `cost_guardrail_overrides`
- `cost_guardrail_drift_audits`

成本資料是append-only觀測／事件與可重建的local admission ledger。contract必須分開保存quota measurement window、authoritative reset、billing period、invoice cutoff、source/version及quality；沒有exact provider usage或reset證據時不得以local值冒充帳務真相。reservation的planned、retry、in-flight、scheduler race與reset clock skew overhead在同一D1 transaction內檢查，排程與手動同步不可繞過或各自計算budget。

## 3. 原始資料與正規化資料

每次YouTube、Instagram或CSV匯入需：

1. 建立`provider_sync_run`或`import_batch`。
2. 保存原始payload／原始列及雜湊，並為該次run逐項寫入`provider_sync_run_payloads`；全域去重命中既有raw時仍不可省略run關聯。
3. 驗證schema與來源識別。
4. 正規化到正式資料表。
5. 建立來源參照。
6. 記錄新增、更新、忽略、重複及錯誤數。
7. 允許從原始證據重新正規化，不能要求重新向平台抓取才能修正parser。

Instagram Login的帳號profile原始證據使用版本化Graph API `GET /me`，fields至少含`user_id`與`username`；正規化`social_accounts.external_account_id`使用來源回報的`user_id`。不得把舊Instagram Graph API的`id`欄位或OAuth token交換回應中的暫存形態冒充現行profile契約。媒體與insights仍保存各自原始payload、API版本、觀測時間及run關聯。

Instagram每次run只抓一次最新50則媒體清單，帳號profile、媒體清單、帳號Insights各使用一次外部請求，貼文Insights最多再查40則，單次最多43個外部subrequest。超過40則時，先選沒有任何既有snapshot的媒體，再依最後觀測時間由舊到新輪替；來源順序只作同順位的穩定排序。當次未查的媒體數寫入`provider_sync_runs.ignored_count`，後續run會優先補齊；所有50則內容本身仍在每次run正規化，不能把Insights預算解讀成只保存40則內容或永久省略其餘資料。

原始資料的保存期限預設長期保留；若資料量接近免費額度，再提供可預覽的清理功能，不能靜默刪除。

YouTube Data API的每支影片`views`／`likes`／`comments`保存為貼文級累積快照；YouTube Analytics channel day report的`views`／`likes`／`comments`保存為帳號級非累積快照。Analytics來源日是America/Los_Angeles的曆日，`observed_at`必須依當日PST／PDT轉為UTC；值原樣保存有限的帶符號十進位來源值，因平台調整可能讓日區間值為負，不得改寫成0或丟棄整列。每個快照都要指向對應的`provider_raw_payloads`，並保留query組合與`youtube-analytics-v2-channel-daily@2026-08-09`定義版本。

同一次provider run只查找或建立每個metric definition一次，快照prepared statements以最多100筆一批交給D1 `batch()`；每批維持D1交易語意，並降低逐筆資料庫往返。這只改變寫入方式，不省略raw payload、snapshot、來源參照或唯一性驗證。

`provider_raw_payloads.sync_run_id`只表示該份全域去重raw最初由哪一次run建立；列舉任一次run的完整抓取證據必須查`provider_sync_run_payloads`，並以`payload_order`還原取得順序。migration 0010只將既有raw回填到其原始擁有run；無法由舊資料可靠推斷的後續去重命中不得事後臆測回填，須由部署後的新真實run驗證。

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
- Provider外部同步不共用上述核心outbox請求閘門，避免長時間YouTube／Instagram工作讓30秒outbox逾時誤報「請求已取消」。它仍使用獨立pending狀態、伺服器job單一執行權及明確錯誤回應；不能藉由繞過閘門允許重複點擊。
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

- `scripts/build-client.mjs`在Vite完成後，以`index.html`、固定名稱JS／CSS、manifest與icons的實際內容計算SHA-256短版本，寫入`dist/sw.js`及cache名稱；不得使用永久固定cache名稱。相同檔名但內容改變時，`sw.js`內容與cache版本必須改變。
- 安裝時只接受成功的同源app shell回應；Cloudflare Access登入redirect或其他跨來源回應不得預快取。
- 導覽與靜態資產在線時使用network-first並更新同版cache，只有網路失敗才回退cache；不能以cache-first讓既有裝置永久停留舊bundle。
- API使用network-first，不將私人API回應放入公開Cache Storage；正式資料進IndexedDB。
- 前端註冊`/sw.js`時使用`updateViaCache: "none"`並主動`registration.update()`；新版本進入waiting時顯示固定在初始viewport內的更新提示，不能排在路由內容之後或在使用者有未同步outbox時強制reload；手機提示位於同步狀態列與底部導覽上方。
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

## 12. Governance Retrofit data boundary（2026-08-14）

Wave 0 不新增資料表、不修改既有migration、不執行D1寫入。`REM-REL-001`／`REM-ASYNC-001`後續若需要 task＋schedule operation、persisted job、phase／counter／retry／cancel／history，必須由單一 backend/API-data owner提出正式schema、Zod contract、transaction、idempotency key、audit欄位與migration；金額、日期、關聯ID、來源與常用篩選欄位不得只藏在JSON。

任何衍生數字仍須帶指標識別／版本、value／unit、來源、觀測筆數、時間窗、篩選／分組、聚合、分母、缺失／排除數、計算時間與精確／估算／手動／來源回報品質。成本 local ledger的 `ESTIMATED`／`NOT_INVOICE_TRUTH`不能升格為provider invoice truth；0011／0012在下游 apply前保持 append-only pending。

離線輸入、編輯、刪除／封存、恢復同步的現有規則不因 retrofit 簡化。所有後續 async／task recovery需覆蓋離線、reload、重試、stale lease、權限失效與衝突；Wave 0只在 `docs/ACCEPTANCE_TESTS.md`定義案例，不宣稱 runtime evidence。

## 13. Wave 1A task integrity與async data contract（2026-08-14）

### 13.1 Task＋schedule atomic command

`POST /api/v1/tasks/with-initial-schedule`使用既有寫入envelope：

```json
{
  "operationId": "uuid",
  "data": {
    "task": { "id": "uuidv7", "title": "...", "areaId": null, "businessId": null, "...": "既有task欄位" },
    "schedule": null
  }
}
```

`schedule`存在時必須帶同一`task.id`的`taskDefinitionId`。server先完整parse／reference-check，再在同一D1 transaction寫task、schedule、audit、actor-bound `api_idempotency`與sync snapshot；回傳`data.task`及`data.schedule`。同operation且同actor／同normalized payload回原結果，payload或actor不一致回`409 IDEMPOTENCY_CONFLICT`且不帶原data。`migrations/0013_retrofit_operation_actor.sql`新增`api_idempotency.actor_id`，舊列nullable但不被新command重播。既有資源API與offline sync仍存在；本線不修改client outbox或TasksPage，因此離線雙resource replay與此atomic online command的接合由Wave 1B明確處理。

### 13.2 `async-job.v1` public read contract

| field | server truth | falsehood prevention |
|---|---|---|
| `status`／`phase` | provider job source `READY/RUNNING/RETRY/PAUSED/DEAD_LETTER`映射；run/import terminal status直接映射 | 未提供來源phase時只回粗粒度`RUNNING`，不猜FETCHING百分比 |
| `progress` | 只有`processed`與`total`同一row unit且真實存在時才回非null | provider payload/entity counters不同量綱時固定為`null`，schema不含percentage／ETA |
| `counters`／`sourceCounters` | import使用`imported + duplicate + error = processed <= total`；provider保留`fetched/created/updated/ignored/errors` source counters | provider標`SOURCE_REPORTED_DIFFERENT_UNITS`，不把created／updated冒充processed |
| `version`／`updatedAt` | job／batch的persisted`updated_at`；list cursor為`updated_at DESC,id DESC` | cursor版本錯誤回`ASYNC_CURSOR_STALE`；不存在回`NOT_FOUND` |
| `history`／`provenance` | provider由`provider_sync_runs`及source table；import目前空history且capability=false；來源table/id/updatedAt必回 | 不把一次request內的export/restore紀錄偽裝成background history |
| `retryable`／capabilities | 讀既有job retry/dead-letter語意；本API目前retry/cancel action均false | 不安全 transition不提供endpoint或UI button，保留既有scheduler semantics |

Routes為`GET /api/v1/async-jobs?kind=PROVIDER_SYNC|CSV_IMPORT&cursor=&limit=`及`GET /api/v1/async-jobs/:id?kind=...`，均先通過Cloudflare Access。provider manual/scheduled sync已有`provider_sync_jobs`／`provider_sync_runs` persisted state、stale recovery與run history；CSV/import已有`import_batches` row counters；export用`export_history`記短同步完成結果；restore在request內同步且以operation idempotency/audit保護。Wave 1A不新增通用async job table，不改provider external call、cost admission、scheduler retry或OAuth。

## 14. Wave 1B client consumption與離線fallback（2026-08-14）

### 14.1 Task＋optional schedule UI

`TasksPage`透過`createTaskWithInitialSchedule`把task與optional initial schedule放進同一個`POST /api/v1/tasks/with-initial-schedule` command。成功回應前不清空表單或宣稱保存；同一個submit lock阻擋duplicate click。若request因網路TypeError而無法判斷結果，client把完整command與operationId放入既有IndexedDB `appSettings`，reload後重新提交同一operationId，交由server idempotency決定原結果或明確錯誤。

若送出前已知離線，client以`commitOfflineMutations`在一個IndexedDB transaction同時建立既有`tasks`／`task-schedules` local entities與resource-level outbox operations，UI標示為「等待同步」而不是server success。這是保留既有離線resource sync的明確fallback，不改變W1A server atomic command，也不新增migration；edit、archive、restore與既有sync manager仍走原有resource contract。

### 14.2 Async status UI

`AsyncJobStatus`只讀`async-job.v1` response，使用`lastUpdatedAt`／persisted version作為更新依據，顯示server提供的status／phase、attempt、nextRunAt、job counters、source counters、counter invariant、history、error／warnings、capabilities與provenance。當`progress`為null或source counters不是同一單位時，UI不補出percentage或ETA；當retry／cancel capability為false時不渲染相應action。Integrations manual sync可在等待中poll、手動reload或重新進頁面讀回同一persisted job，不依賴頁面記憶的假進度。
