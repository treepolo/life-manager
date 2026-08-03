# 部署、排程、備份與維護

## OPS-001　環境

至少有：

- `local`：Wrangler本機D1及本機Worker。
- `staging`：Cloudflare測試Worker、測試D1、獨立OAuth callback及Access保護。
- `production`：正式Worker、正式D1及正式secret。

不同環境不得共用D1。Staging可使用測試fixture，但需明顯環境標示；production不得自動seed。

## OPS-002　零成本防線

- 使用Cloudflare提供網址，第一批不要求購買網域。
- 只選用有免費方案且不要求綁付費承諾的功能。
- 不自動啟用Workers Paid、付費R2、付費郵件、付費API或第三方券商聚合器。
- 在文件記錄所有免費額度與查核日期；額度接近時在App管理頁顯示，不自動升級。
- 若某整合無法在零成本正式使用，標為`EXTERNAL_BLOCKED`並保留手動／CSV正式路徑，不使用不安全替代品。

2026-08-02官方額度查核：

- Workers Free：每日100,000個動態請求、每次10ms CPU；靜態資產請求免費且不計入動態請求。來源：<https://developers.cloudflare.com/workers/platform/pricing/>。
- D1 Free：每日5,000,000 rows read、100,000 rows written，總儲存5GB；超額時操作失敗，不會自動轉成付費。來源：<https://developers.cloudflare.com/d1/platform/pricing/>。
- Resend Free：每日100封、每月3,000封交易郵件；本產品只在最高兩級期限且使用者明確啟用後寄送，遇到429會保留失敗證據，不升級付費。來源：<https://resend.com/docs/knowledge-base/account-quotas-and-limits>。
- 上線後每月由Cloudflare D1 Metrics及Resend Usage頁人工核對；達任一免費額度80%時先停用非必要手動同步／測試信並記錄，不自動變更方案。

## OPS-003　Cloudflare部署

Wrangler設定至少包含：

- Worker name；
- compatibility date；
- static assets directory；
- D1 binding；
- Cron；
- secrets的名稱但不含值；
- staging／production環境。

部署流程：

1. lint、typecheck及所有本機測試；
2. D1 SQL備份；
3. staging migration；
4. staging smoke；
5. production migration；
6. production deploy；
7. Access與API smoke；
8. 更新release證據。

不得先deploy再補測試。

本機端到端閘門由`scripts/run-e2e.mjs`為每個案例建立全新D1狀態並依序套用`0001`~`0008`。若Playwright失敗，執行器會再檢查Worker健康；只有Wrangler程序已退出或健康檢查不可達時，才以另一個全新D1重試，最多兩次並明確輸出重試訊息。每次重試仍使用全新D1；Worker仍健康時的產品斷言失敗不得重試或忽略。離線同步E2E直接核對`sync/batch`的`APPLIED`及後續`sync/changes` snapshot，避免Windows本機Wrangler在恢復連線後同時承受瀏覽器刷新與第二API client。Wrangler設定與日誌寫入工作區`.wrangler/xdg`，不依賴使用者目錄權限。

## OPS-004　Cron

Cron實際使用UTC。排程handler只負責尋找D1中到期工作並排隊／執行受控批次。所有提醒與發布後時間窗以Asia/Taipei或內容原始時區計算。

Cron每次執行記錄：

- 開始／結束；
- job counts；
- provider requests；
- success／retry／dead-letter；
- notification dedupe；
- request IDs。

不得在失敗迴圈大量寄信或打爆API。

## OPS-005　外部平台健康

每個provider管理頁顯示：

- connected／disconnected；
- token狀態；
- 最後成功；
- 最後嘗試；
- 最近錯誤；
- 下一次排程；
- 手動同步；
- 重新授權；
- provider資料定義版本。

平台API更新造成metric消失時，保留歷史定義並顯示中止日期。

## OPS-006　日誌與隱私

- 日誌不記錄token、完整CSV、財務備註或Push endpoint。
- 使用request ID與sync run ID追蹤。
- provider錯誤保存必要code及已遮蔽訊息。
- 預設保留操作／通知／同步log的合理期間，清理規則需文件化並可調整。

實際保留政策：

- `audit_log`、`api_idempotency`、已終止的`notification_deliveries`及`cron_runs`預設365日；分別由`OPERATION_LOG_RETENTION_DAYS`與`NOTIFICATION_LOG_RETENTION_DAYS`調整，範圍1至3650日。
- 已消耗或過期的`oauth_states`預設30日，由`OAUTH_STATE_RETENTION_DAYS`調整。
- `sync_change_log`只有在所有未停用裝置的`last_pulled_cursor`都越過該筆且超過操作保留期時才清除；沒有有效裝置時不清除。無change/conflict參照的舊`sync_operations`才會續清。
- `import_files`原始CSV、`provider_raw_payloads`及仍作為來源證據的provider sync資料為長期證據，不由排程自動刪除。若要刪除，必須新增可預覽筆數、先備份、可稽核的管理流程，不用直接SQL臨時處理。
- 清理在每次Cron受控批次末尾執行；`tests/worker/api-d1.test.ts`驗證未越過同步游標時不刪、越過後才刪。

## OPS-007　備份

### 使用者操作

App內：

- 匯出完整JSON；
- 匯出模組CSV；
- 顯示最近匯出日期；
- 提醒在重要release或大量匯入後備份，但不使用普通推播干擾。

### 開發／維護

- 破壞性變更前執行D1 SQL export。
- 每個release在本機還原並跑checksum。
- D1 Time Travel只作短期救援；長期仍靠匯出。
- 還原前停止寫入或進入維護模式。

本機正式命令：

```powershell
.\scripts\backup-local.ps1
.\scripts\restore-drill.ps1 -BackupPath .\backups\life-manager-local-YYYYMMDD-HHMMSS.sql
```

備份腳本會把Wrangler設定／日誌導向工作區、檢查退出碼、產生同名`.sha256`及輸出JSON證據；還原演練只接受工作區內備份，先驗SHA-256，再還原到獨立暫存D1並查核schema與核心表計數，最後移除演練庫。2026-08-03最新證據：`life-manager-local-20260803-002507.sql`，40,672 bytes，SHA-256 `3b97e7abadd7cd2478fd77c0a382f1629aee9e2110a2abe085acb8dd76e633fe`，還原108個SQL commands，schema version 8。

## OPS-008　Migration

- 已套用migration永不修改。
- 先新增欄位／表，再搬資料，再切換讀取；刪除舊結構延後到後續release。
- migration必須可在全新與上一release資料庫通過。
- 大量資料搬移分批、可恢復並記錄進度。
- production migration失敗立即停止deploy並依備份／Time Travel處理。

## OPS-009　秘密

預期Cloudflare Secrets：

- `TOKEN_ENCRYPTION_KEY`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `META_CLIENT_ID`
- `META_CLIENT_SECRET`
- `RESEND_API_KEY`
- `RESEND_FROM`
- `WEB_PUSH_VAPID_PRIVATE_KEY`
- `WEB_PUSH_VAPID_SUBJECT`
- 其他必要值

公開設定使用vars：`OAUTH_CALLBACK_BASE_URL`、`WEB_PUSH_VAPID_PUBLIC_KEY`；瀏覽器build另使用`VITE_VAPID_PUBLIC_KEY`。真實收件地址由Access保護的App設定頁送入後以`TOKEN_ENCRYPTION_KEY`加密保存，不放vars、Markdown或Git。

## OPS-010　W-8BEN與報稅提醒排程

- 使用一個全域通知時間與重複間隔，預設值需在首次設定時由使用者確認。
- 每輪查詢`actionable_from <= today`、未完成及啟用事項。
- 站內警告一直存在；Push與Email以`deadline + channel + notification_period`去重。
- 完成操作寫入completion transaction後，後續排程立即排除。
- recurring事項完成時可建立下一期，但需讓使用者確認日期，不自行假設法律期限。

## OPS-011　災難情境

| 情境 | 偵測 | 停止損害 | 復原 | 驗證 |
|---|---|---|---|---|
| 誤刪資料 | 稽核記錄出現非預期DELETE、同步change為DELETE | 立即停用該裝置同步；不要再編輯同一實體 | 優先用JSON／D1 SQL備份還原到隔離庫，確認目標列後以正常API重建；雲端可評估D1 Time Travel | 查UI、audit、版本及其他裝置pull；舊離線版本不得復活tombstone |
| 錯誤migration | staging migration退出非0、schema或契約測試失敗 | 停止production migration及deploy；不修改已套用檔 | 從migration前SQL備份建立隔離D1；新增修正migration，不覆寫舊migration | fresh與上一release upgrade、`npm run verify`、核心筆數與schema metadata全過 |
| OAuth token失效 | provider狀態`EXPIRED/NEEDS_REAUTH`、401或refresh失敗 | 暫停該connection job，保留歷史資料且不清token錯誤證據 | 在外部連線頁重新授權；舊token密文由新授權transaction取代 | 手動同步成功、last success更新、原始payload與normalized rows對得上 |
| Push subscription失效 | provider回410/404或測試通知失敗 | 將該subscription標為失效，其他裝置與站內／Email不受影響 | 該裝置重新按「啟用此裝置通知」取得新endpoint | 測試Push成功、channel last success更新、另一裝置仍可接收 |
| Resend失敗 | delivery為RETRY/FAILED、去敏error code或429 | 保留站內警告；不得無限即時重送或自動升級付費 | 檢查API key/from/收件限制；依backoff重試或更正設定後用測試信 | Resend message ID、delivery SENT、本人收件內容與期限一致且無重複 |
| D1匯出／還原 | export退出非0、檔案缺失、SHA不符或restore query失敗 | 停止寫入與release；不使用無hash檔覆蓋正式D1 | 重新匯出或選上一份hash通過備份；先跑`restore-drill.ps1`，再依Cloudflare匯入流程處理目標庫 | schema version、核心表計數、抽樣資料與App smoke一致 |
| IndexedDB schema錯誤 | 啟動錯誤、migration transaction abort、outbox無法讀取 | Service Worker不清除local DB；暫停上線送出 | 回退前端版本或發布只追加的IndexedDB修正；先匯出可讀outbox再升級 | 離線建立／編輯／刪除、重開、恢復同步與D1存在性E2E全過 |
| 離線outbox卡住 | 待同步數不下降、同operation持續錯誤或OPEN conflict | 保留local payload，不清queue、不盲目重送衝突操作 | 先查錯誤碼；schema問題升級client，衝突在資料頁選LOCAL/SERVER/MERGED，網路錯誤保留退避重試 | outbox歸零、operation只套用一次、server版本與另一裝置一致 |
| Cloudflare Access錯誤 | 本人403或未登入者可進API | 若有繞過風險，立即停用Worker route／部署；不要放寬成Everyone | 修正Access application audience與只允許本人email的policy，再核對Worker `ACCESS_TEAM_DOMAIN/AUD/ALLOWED_EMAIL` | 無session瀏覽器拒絕、本人通過、錯誤aud/過期JWT/API直接請求皆拒絕 |

## 相依套件安全查核

2026-08-02執行`npm audit --omit=dev`：`react-router`與`react-router-dom`各計1項high（共2項），來自同一個React Server Components Server Action CSRF advisory。本產品是Vite瀏覽器SPA與Cloudflare Worker JSON API，不使用`react-server-dom-*`、`unstable_createCallServer`或RSC Static Router；正式程式掃描會禁止這些入口。7.18.2是查核當日npm registry最新版，因此目前記為「不適用路徑的殘餘供應鏈警告」，不能宣稱零漏洞。每次React Router升級或audit advisory有修正版時，必須重跑完整verify與scan並移除此例外；若未來導入RSC，部署立即阻擋直到修補。
