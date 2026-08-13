# 部署、排程、備份與維護

## OPS-001　環境

至少有：

- `local`：Wrangler本機D1及本機Worker。
- `staging`：Cloudflare測試Worker、測試D1、獨立OAuth callback及Access保護。
- `production`：正式Worker、正式D1及正式secret。

不同環境不得共用D1。Staging可使用測試fixture，但需明顯環境標示；production不得自動seed。

2026-08-03 staging實際資源：Worker `life-manager-staging`；URL `https://life-manager-staging.life-manager.workers.dev`；2026-08-09 per-run raw追溯修正後目前版本`9a72219e-7880-4ec4-b673-0cb99b64791d`且100%流量；D1 `life-manager-staging`／`4a9da6fd-2fe5-41e1-b17f-0f444e60e14c`／APAC；目前migration schema version 10。9→10升級前確認run 9、raw 14、孤立raw 0、執行中run/job 0，並建立不進Git的2,227,836 bytes remote SQL備份；之後只套用`0010_provider_sync_run_payload_links.sql`。升級後raw 14／回填link 14／distinct linked raw 14、孤立link 0、重複payload order 0、新索引1且migration list為空；不能臆測回填舊run曾命中但當時未保存的去重關聯。啟用Access前HTTPS靜態資產smoke為200且API以503 `ACCESS_CONFIGURATION_MISSING`安全拒絕；啟用「受限」後，無session首頁與API均在Cloudflare邊界回302導向Access登入。JWK URL回200，實際team domain與audience已部署為staging vars；`ACCESS_ALLOWED_EMAIL`已由使用者透過Wrangler互動提示設定，部署後只核對四個Secret名稱／型別仍存在，未讀取值。本人Access session曾取得health 200／`status=ok`／staging，證明JWT與Worker email限制通過；schema 10部署後未登入health仍為302，待下一次本人session健康檢查更新現況。使用者亦已唯讀確認只有Allow／Include／Emails／本人單一值且無其他放行政策。電腦與手機兩台實體裝置均已載入App首頁且無API／載入錯誤，`SETUP-002`完成；2026-08-09另完成`OFF-005`手機離線新增、自動恢復同步、不同實體電腦取得及D1聚合核對，production資源尚未建立。

`OFF-005`實體同步不得建立假資料或要求使用者揭露私人內容。先讓手機在線載入「領域／事業」，再斷網建立一筆真正要保存的領域；恢復網路後確認outbox清空與最後同步時間更新，最後由電腦同步取得。Codex的D1核對只查筆數、operation狀態、change log與兩個device cursor，不選取領域名稱、說明、原則或其他私人欄位。2026-08-09真實結果為手機`0→1→0`、電腦取得同一領域且`0 待同步`；D1聚合為areas 1、area APPLIED operation 1／未套用0、area change 1／max cursor 1、有效device 2、cursor 2且min/max pulled皆為1。查詢在APAC／HKG primary完成，`rows_written=0`、`changes=0`；2026-08-03的API `7403`失敗已由本次成功查詢收斂，未讀取私人欄位。

workers.dev的Access操作採目標導向，不把易改版的側邊欄名稱當成唯一依據：進入目標Worker的網域／URL管理畫面，找到標示為「生產」的`<worker>.<account-subdomain>.workers.dev`，確認目前存取狀態後由「公開」改為「受限」。成功判據是該URL顯示受限，且介面提供Access JWT `aud`與JWK URL。2026-08-03 `life-manager-staging`中文介面的頁面名稱為「網域」；先前記載的`Settings` → `Domains & Routes` → `Enable Cloudflare Access`不適用於此帳號介面。啟用後仍須把JWK URL中的Access team domain、JWT audience與允許email安全設定給Worker，因程式會再次驗證`Cf-Access-Jwt-Assertion`；並核對Access policy僅允許本人，不另建重複hostname application。

不要把Access邊界302誤當成完整驗收：先用無session請求證明首頁與API都導向Access，再確認JWK URL回200；將`ACCESS_TEAM_DOMAIN`與`ACCESS_AUD`作為非secret staging vars，把本人email以`ACCESS_ALLOWED_EMAIL` Worker Secret輸入。2026-08-03已完成這三項設定並部署版本`96f1e1b9-0902-4401-afb5-ea2825085e08`，部署列表為100%，部署後Secret名稱仍存在，無session首頁與API仍回302，JWK仍回200；本人session也已取得health 200／schema 8。最後仍須核對目標hostname的Access application只有`Allow`／`Include`／`Emails`／本人單一值，不得另有Allow、Bypass、`Everyone`、email domain或只以登入方式放行的規則。

## OPS-002　零成本防線

- 使用Cloudflare提供網址，第一批不要求購買網域。
- 只選用有免費方案且不要求綁付費承諾的功能。
- 不自動啟用Workers Paid、付費R2、付費郵件、付費API或第三方券商聚合器。
- 在文件記錄所有免費額度與查核日期；額度接近時在App管理頁顯示，不自動升級。
- 若某整合無法在零成本正式使用，標為`EXTERNAL_BLOCKED`並保留手動／CSV正式路徑，不使用不安全替代品。

2026-08-11官方額度查核（Resend項目）：

- Workers Free：每日100,000個動態請求、每次10ms CPU；靜態資產請求免費且不計入動態請求。來源：<https://developers.cloudflare.com/workers/platform/pricing/>。
- D1 Free：每日5,000,000 rows read、100,000 rows written，總儲存5GB；超額時操作失敗，不會自動轉成付費。來源：<https://developers.cloudflare.com/d1/platform/pricing/>。
- Resend Free：每日100封、每月3,000封交易郵件；官方說明指出寄出與收到的郵件都計入額度，多個To／CC／BCC收件人分別計數。Free方案的API起始速率限制為每秒5個請求；超額或429時保留失敗證據，不自動升級付費。來源：[Resend account quotas and limits](https://resend.com/docs/knowledge-base/account-quotas-and-limits)、[Resend usage limits](https://resend.com/docs/api-reference/rate-limit)。本數字只代表2026-08-11查核當日官方文件，不宣稱未來額度不變。
- Resend API `Idempotency-Key`可用於`POST /emails`，官方文件寫明key最長256字元、保留24小時；本產品仍以D1唯一`dedupe_key`與delivery log作本地冪等證據，不能把Resend 24小時保留誤當成永久去重。來源：[Resend Send Email API](https://resend.com/docs/api-reference/emails/send-email)、[Resend idempotency keys](https://resend.com/docs/dashboard/emails/idempotency-keys)。
- 無自有驗證網域時，`onboarding@resend.dev`只用於測試，且Resend要求只能寄到Resend帳號本人地址；本線不得用它寄給第三方。來源：[403 error using resend.dev domain](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain)。
- 上線後每月由Cloudflare D1 Metrics及Resend Usage頁人工核對；達任一免費額度80%時先停用非必要手動同步／測試信並記錄，不自動變更方案。每次核對要記錄日期、方案、當日／當月用量與官方頁面，不保存API key或完整收件地址。

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

版本控管中的部署命令必須明確指定正式設定檔：`wrangler deploy --config wrangler.toml --env staging`或`--env production`。工作區`.wrangler/deploy/config.json`可能由舊建置工具留下並指向不存在的redirected config，不得讓這類忽略檔覆蓋正式環境設定。2026-08-03 Wrangler 4.118.0於Windows完成staging upload、workers.dev subdomain與schedule API後仍回傳exit 1；只有在部署列表顯示目標version為100%、HTTPS與binding smoke均通過時可記錄為「雲端已生效但CLI退出異常」，不得把非零退出碼改寫成正常成功。2026-08-09同版Wrangler在Node 24由中文實體路徑執行deploy dry-run時，會在打包前出現Windows `UV_HANDLE_CLOSING`斷言且日誌中的路徑編碼損壞；將同一專案暫時以未使用的ASCII磁碟代號映射後，dry-run與正式deploy均exit 0，完成後必須解除映射。這是執行路徑別名，不得複製工作樹、改用其他設定檔或省略部署後版本／Secret／Access smoke。

本機端到端閘門由`scripts/run-e2e.mjs`為每個案例建立全新D1狀態並依序套用`0001`~`0010`。若Wrangler在服務就緒前已退出，或Playwright失敗後確認Wrangler程序已退出／健康檢查不可達，才以另一個全新D1重試，最多兩次並明確輸出重試訊息；就緒逾時但程序仍在、Worker仍健康時的產品斷言失敗都不得重試或忽略。每次重試仍使用全新D1。離線同步E2E直接核對`sync/batch`的`APPLIED`及後續`sync/changes` snapshot，避免Windows本機Wrangler在恢復連線後同時承受瀏覽器刷新與第二API client。Wrangler設定與日誌寫入工作區`.wrangler/xdg`，不依賴使用者目錄權限。2026-08-09曾以Wrangler 4.118.0及試驗後撤回的4.120.0在列出binding後中斷，當時均保留非零結果且未用簡化伺服器冒充E2E；schema 10重跑時4.118.0已真實啟動Worker，2026-08-10加入provider長請求pending案例後共13個隔離D1 Playwright案例全部通過、exit 0，故舊啟動中斷只保留為歷史診斷證據，不再列為目前阻擋。

每次client build完成後必須看到`Service Worker build version: <16位hex>`，且`dist/sw.js`不得殘留`__LIFE_MANAGER_BUILD_VERSION__`。staging部署後先以版本／deployment status確認新Worker承接100%流量；既有已登入client只做一次一般重新整理，應在初始viewport直接看見固定的「有新版可用」，不能要求捲到文件底部；手機提示須避開底部同步狀態與導覽。若有outbox，先完成同步，不得清除IndexedDB、Cache Storage或強制skip waiting；outbox為0時才按一次「安全更新」，待自動reload後核對新功能。2026-08-09真實驗收發現固定`life-manager-shell-v1`搭配同名資產cache-first會讓既有裝置長期停留舊bundle，表面症狀是後端19秒完成YouTube同步但按鈕未顯示新版既定的「同步中」；2026-08-10又確認沒有固定定位的更新提示會落在長頁面文件流底部。兩種情況都要依上述更新路徑修復，不能要求使用者清站台資料或額外捲動來掩蓋release缺陷。

2026-08-10正式驗收：版本14 `488a92a7-3ff1-47ec-8a04-49c8b75572a0`承接100% staging流量；320／390／768／1366／1920五種viewport的提示幾何斷言通過。既有已登入client在outbox為0時只按一次「安全更新」即自動reload，新載入stylesheet包含`.update-banner { position: fixed; z-index: 30; }`，手機規則為`bottom: 116px`，沒有清除IndexedDB或Cache Storage。隨後同一頁只按一次YouTube「立即同步」，約1.6秒內顯示停用「同步中」並鎖定撤銷，畫面於同一請求完成後恢復；遠端D1核對該MANUAL run為19秒`SUCCEEDED`、job `READY`／attempt 0。這組結果是後續release的固定回歸基準。

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

YouTube排程以`youtube-data-v3+analytics-v2@2026-08-09`為來源版本。每次同步先在token到期前5分鐘換發並重新加密保存；完整走訪上傳播放清單與影片明細，再抓`dimensions=day`的channel Analytics。Analytics日值允許來源回報的帶符號有限十進位並標成非累積；任何API、正規化或D1錯誤都保留run、去敏錯誤與RETRY attempt。非401錯誤的管理頁仍提供「立即同步」，只有授權真的失效才改為重新授權。

2026-08-09 staging修正版Cron的真實成功判據：最新run=`SUCCEEDED`、job=`READY`／attempt 0、connection=`CONNECTED`／錯誤0；去敏唯讀D1聚合為1個頻道、31支影片、574筆快照，raw provenance缺失0，相同語意鍵重複群組0，且9筆來源負likes調整仍保留。`AT-YT-04`已由本人在YouTube Studio把日期對齊2026/7/12至2026/8/6，並以只回傳布林值的D1聚合證明26個來源日與觀看次數總計精確相等；實際總計未寫入文件。Google App已切換「實際運作中」且未提交公開驗證；`AT-YT-05`仍須另行撤銷token驗證失效、隔離與重連，不得以成功run或單元測試取代。

`AT-YT-05`使用App「撤銷連線」而非Google驗證中心：YouTube adapter會優先把refresh token送至`https://oauth2.googleapis.com/revoke`，成功後API transaction清除access／refresh token密文並標記`DISCONNECTED`；原始payload、正規化快照及其他模組資料不得刪除。既有provider job保留，以便驗證排程失敗被記錄且不影響財務等模組；之後在Google App「實際運作中」狀態重新完成兩項唯讀scope授權與真實同步。每個破壞性或授權操作前後先記錄去敏狀態，且一次只執行一個使用者動作。

2026-08-09真實撤銷前基準：staging UI為connection=`CONNECTED`／錯誤無、job=`READY`／attempt 0；D1唯讀聚合為有效YouTube connection 1、兩種token密文存在、job 1，三個財務核心表皆0列，且`rows_written=0`／`changes=0`。撤銷後必須以相同欄位證明connection已斷開、密文清除、歷史社群資料保留，並以財務空資料頁正常載入補足「其他模組正常」的真實UI證據。

2026-08-09真實撤銷與排程隔離結果：App撤銷後UI為`DISCONNECTED`且提供「開始正式授權」；D1證明撤銷時間存在、access／refresh token密文皆清除，既有YouTube原始payload 6與正規化快照574完整保留。Cloudflare目前文件化的scheduled handler手動測試只適用本機，因此真實staging驗收只把該斷線job的`next_run_at`提前1次（精確寫入1列），再由既有每15分鐘Cron自然執行；執行後job=`RETRY`／attempt 1／`PROVIDER_ERROR`，connection仍`DISCONNECTED`、密文仍0、社群歷史筆數不變，三個財務核心表也維持0列。使用者隨後在同一staging session人工開啟「財務」，頁面正常載入正常空資料狀態且沒有YouTube或其他錯誤，未新增或匯入資料。此證據不得解讀為外部同步成功；它證明失效被記錄且限制在該provider job。重新授權後仍須核對新refresh token密文、job復原及真實同步。

同日於Google App「實際運作中」狀態重新授權：使用者仍只授予YouTube帳戶與Analytics報表兩項唯讀scope，callback後UI為`CONNECTED`、job=`READY`／attempt 0且無錯誤。D1去敏核對證明access與refresh密文皆重新存在、token到期時間在未來、scope精確為兩項、近期MANUAL callback成功；撤銷前後密文存在數形成`1→0→1`，所以不是沿用已撤銷舊密文。原始payload仍6、正規化快照仍574，財務三表仍0，查詢寫入0列。callback只讀取帳戶用於建立連線，不能取代後續完整Data API＋Analytics同步；必須再按一次「立即同步」並以D1 run／raw／snapshot／job證據核對。

同日第一次新憑證「立即同步」事故：前端送出後，YouTube connection仍為`CONNECTED`，但左下角核心outbox顯示「請求已取消」。去敏D1證明手動run確實建立並寫入4個raw payload、462筆快照後長時間停在`RUNNING`；22:15 Cron又在同一connection啟動，該排程run另行`SUCCEEDED`並新增155筆快照。排程成功不得冒充這次手動run成功。根因有三項：長時間provider請求占用核心request gate，導致30秒outbox逾時；快照逐筆definition查詢／寫入造成過多D1呼叫；手動流程未先取得job執行權，允許Cron重疊。修正後provider請求使用獨立長時間通道，按鈕於pending時停用；metric definition在run內快取且快照每100筆以D1 batch寫入；手動與Cron都以條件式job claim單一執行，並在下次手動／Cron前把超過10分鐘的`RUNNING`標成`FAILED/SYNC_INTERRUPTED`及可重試job。此修正不需migration；真正完成仍須部署後以本人帳號再做一次手動同步，核對該MANUAL run終止為`SUCCEEDED`、job回到`READY`／attempt 0、raw／snapshot來源完整，且左下角不再出現取消錯誤。

Instagram Login callback若已通過同意與token交換，卻在建立connection前回`PROVIDER_ERROR`／`IGApiException`，先核對profile request是否符合現行官方契約：`GET https://graph.instagram.com/{version}/me?fields=user_id,username,...`。`/{token-response-user-id}?fields=id,...`是本專案2026-08-11真實staging失敗原因；修正後OAuth identity與正規化均使用profile的`user_id`。一次性callback code/state不得貼入紀錄、重播或拿來手動試API；完成自動測試及部署後必須由外部連線頁產生新state並重新授權。

Instagram完整同步若回Cloudflare「Too many subrequests by single Worker invocation」，不得把callback時只抓profile的成功run冒充內容／Insights成功。Free plan單次Worker invocation上限為50個外部subrequest；本產品固定只抓一次最新50則媒體清單，每輪最多查40則媒體Insights，加上profile、媒體清單與帳號Insights後最多43次，保留7次錯誤處理／平台行為餘裕。選擇順序為未有snapshot者優先，其次最後觀測時間最舊者；當輪未選數寫入`ignored_count`，下一輪輪替。成功判據包含run=`SUCCEEDED`、connection=`CONNECTED`、job=`READY`／attempt 0、每次run raw link完整、至少一則真實內容與可用Insights snapshot，並以第二次同步證明沒有語意重複且先前略過內容會被選入。

修正部署後的第一個自然Cron於2026-08-09 22:45:13（Asia/Taipei）完成stale recovery：舊MANUAL run成為`FAILED/SYNC_INTERRUPTED`，error count 1；該輪沒有到期provider job或外部provider request，job仍`READY`／attempt 0，connection仍`CONNECTED`且無錯誤。此證據證明復原不會誤觸外部同步、改壞授權或覆蓋排程狀態；仍不能取代下一次本人手動同步。

Instagram budget fix正式驗收結果（2026-08-11）：staging版本`2342cd82-9788-47f8-8c87-a0826003d534`部署成功，remote migration list為`No migrations to apply!`。兩次真實run均`SUCCEEDED`、connection=`CONNECTED`、job=`READY`／attempt 0；首輪`SCHEDULED` fetched 43／created 51／updated 0／ignored 10，次輪`MANUAL` fetched 43／created 0／updated 51／ignored 10。每輪raw與run link各43筆、每輪40篇內容各280筆Insights snapshot，50篇內容均已正規化；兩輪重疊30篇，次輪補入首輪略過的10篇，累計560筆snapshot semantic key唯一。去敏token核對僅確認AES-GCM-256密文存在；未讀取token值。上述結果完成`AT-IG-03`～`AT-IG-05`，連同既有`AT-IG-01`～`AT-IG-02`必要回歸後，`SOC-010`／`SETUP-004`為`VERIFIED`。舊版本50篇Insights造成的subrequest失敗仍保留為歷史run，不得與本次成功混淆。

## OPS-006　日誌與隱私

- 日誌不記錄token、完整CSV、財務備註或Push endpoint。
- 使用request ID與sync run ID追蹤。
- provider錯誤保存必要code及已遮蔽訊息。
- 預設保留操作／通知／同步log的合理期間，清理規則需文件化並可調整。

實際保留政策：

- `audit_log`、`api_idempotency`、已終止的`notification_deliveries`及`cron_runs`預設365日；分別由`OPERATION_LOG_RETENTION_DAYS`與`NOTIFICATION_LOG_RETENTION_DAYS`調整，範圍1至3650日。
- 已消耗或過期的`oauth_states`預設30日，由`OAUTH_STATE_RETENTION_DAYS`調整。
- `sync_change_log`只有在所有未停用裝置的`last_pulled_cursor`都越過該筆且超過操作保留期時才清除；沒有有效裝置時不清除。無change/conflict參照的舊`sync_operations`才會續清。
- `import_files`原始CSV、`provider_raw_payloads`、`provider_sync_run_payloads`及仍作為來源證據的provider sync資料為長期證據，不由排程自動刪除。若要刪除，必須新增可預覽筆數、先備份、可稽核的管理流程，不用直接SQL臨時處理。
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

2026-08-09 migration 0010前的staging remote備份為`backups/life-manager-staging-pre-0010-20260809-2324.sql`，2,227,836 bytes，SHA-256 `E7526D3B2F251370BA553DF31FFB7AC46DE13F07916719F6B7FE09760F5E9DA9`；`backups/`已由Git忽略。檔名與hash可留在文件，SQL內容不得進Git或聊天。

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

公開設定使用vars：`OAUTH_CALLBACK_BASE_URL`、`OAUTH_STATE_TTL_MINUTES`、`WEB_PUSH_VAPID_PUBLIC_KEY`；瀏覽器build另使用`VITE_VAPID_PUBLIC_KEY`。`OAUTH_STATE_TTL_MINUTES`目前為60，程式只接受10至120分鐘整數；state仍為一次性、使用隨機值與S256 PKCE且逾時即拒絕。真實收件地址由Access保護的App設定頁送入後以`TOKEN_ENCRYPTION_KEY`加密保存，不放vars、Markdown或Git。

### C線 Web Push staging驗收邊界（2026-08-11）

`SETUP-006`只使用`life-manager-staging`與`https://life-manager-staging.life-manager.workers.dev/deadlines`。VAPID private key／subject只能以Cloudflare Secret輸入；`WEB_PUSH_VAPID_PUBLIC_KEY`是Worker公開var，`VITE_VAPID_PUBLIC_KEY`是client build時的公開環境變數，兩者必須完全一致。核對時只輸出名稱、型別或布林結果，不輸出任何secret／subject／endpoint／subscription key值；client bundle可以包含public key，但不得包含private key或secret值。

本線已在乾淨`master` worktree完成Push service worker、build stamp、秘密邊界與D1契約的本機核對；尚未以未授權Access回應宣稱staging資產或真人裝置通過。每台真實手機／電腦需分開完成授權、訂閱、測試通知與停用後另一台仍可收件，固定操作步驟見`SETUP_CHECKLIST.md`的`SETUP-006`。基準版本曾有共用scheduler只更新delivery、未回寫`push_subscriptions.last_success_at`／錯誤欄位且通知頁只讀channel聚合的缺陷；N線已在`codex/fix-notification-shared`修正 shared writeback 與逐裝置讀回，A已將修正與client public-key build部署至staging version`26d3ca9b-c910-452b-b3aa-f6a8c59b9450`並確認100%流量，仍待C真人驗收。

### N線 shared notification writeback（2026-08-12）

`recordNotificationDeliveryOutcome`以D1 batch同步`notification_deliveries`、`notification_channels`及（Web Push時）指定`push_subscriptions`。成功寫入時間並清除同一通道的錯誤；provider error保存去敏錯誤；404／410標記該訂閱`EXPIRED`，仍有其他ACTIVE訂閱時通道保持`READY`。`GET /api/v1/push-subscriptions`只回傳每台最新安全欄位，Deadlines頁面顯示成功時間／錯誤代碼／狀態；空訂閱不產生示範資料。這些是本機固定答案，不能替代staging VAPID設定、Access及兩台真人裝置收件。

### A整合線第二階段部署證據（2026-08-12）

- A整合branch以暫時`VITE_VAPID_PUBLIC_KEY`完成799 modules client build，`dist`含public key且未發現private／subject／其他secret identifier；環境變數未寫入`.env`、`wrangler.toml`、source、Git或文件。
- 依`wrangler deploy --config wrangler.toml --env staging --keep-vars`上傳後，CLI在Windows既有程序問題下回`0xC0000409`，但唯讀deployment status確認`life-manager-staging` version`26d3ca9b-c910-452b-b3aa-f6a8c59b9450`為100%流量；新version保留public VAPID binding與既有兩個VAPID Secret名稱／型別，remote `d1 migrations list --remote`為`No migrations to apply!`。
- 未授權GET `/deadlines`、`/api/v1/notifications/channels`、`/api/v1/push-subscriptions`與`/api/v1/integrations`均受Access邊界回302。當時沒有可用Access session，因此不把此結果解讀成授權API通過；沒有觸發任何POST、真人Email／Push或Firstrade匯入。C收到本部署證據後依`SETUP-006`恢復兩台真人驗收。

### C線 final acceptance 唯讀 smoke（2026-08-12）

- C 使用最新 A 整合 staging version `26d3ca9b-c910-452b-b3aa-f6a8c59b9450`；唯讀 deployment status 為 100% active，remote migration 為 `No migrations to apply!`。C 未部署、未執行 migration、未讀取 secret 值。
- 目前 Access session 可載入期限頁；「重要期限與多通道警告」可見且沒有紅色 API／載入錯誤。使用者已準備一筆正式 `OPEN` 期限，頁面已出現「測試發送」入口；Push 訂閱仍為空，符合尚未授權裝置時不得補示範資料的規則。
- 兩台真人收件已完成：使用者畫面顯示電腦測試通知已收到、channel `READY`、裝置 `ACTIVE`、最近成功時間及成功 1／失敗 0；使用者確認手機也已收到。使用者已停用手機；D1 唯讀聚合顯示手機 `DISABLED`、電腦 `ACTIVE`、兩台成功紀錄／錯誤 0、`WEB_PUSH=READY`、delivery `SENT` 9／錯誤 0。C 下一步依 SETUP-006 只從未停用電腦做最後一次測試，確認手機不再收件。

### C線最後獨立性測試失敗與移交（2026-08-12）

- 最小重現：手機已停用；從未停用電腦觸發一次測試。預期電腦收到、手機不收到，電腦仍顯示 `ACTIVE`。
- 實際：使用者回報電腦未收到，且電腦 UI 顯示 `DISABLED`。D1 唯讀卻顯示 computer-like 訂閱 `ACTIVE` 1、mobile-like 訂閱 `DISABLED` 1，`WEB_PUSH` channel `READY`，delivery 從 9 增至 `SENT` 10、錯誤 0；查詢未寫入。
- 決定：這是未解的 UI／共用通知狀態與真人收件矛盾。C 線停止驗收，不修改 shared notification、scheduler、期限 UI/API 或部署；移交主線釐清後再恢復 AT-PUSH-01。

### C線 Web Push final acceptance（2026-08-13）

- A/N2整合commit `007768fae8f56893072cc056a007766cac462595` 的 staging version `db41ff0c-7864-43d2-9a98-54000cebfa92`為100% active；remote migration為`No migrations to apply!`。C線只做唯讀部署／API／D1核對與真人驗收，未部署、未執行migration、未讀取secret值。
- Worker public VAPID var與client build public key只以一致性布林結果核對；private key／subject只存在Cloudflare Secret。Service Worker build stamp為`774d9ed6db971987`，placeholder不存在；未在文件保存任何secret、endpoint或subscription key。
- 真人驗收：手機與電腦兩台不同真實裝置各自授權、訂閱並收到測試Push；手機獨立停用後，未停用電腦維持`ACTIVE`並收到唯一一次最後測試，使用者確認停用手機未收到。
- 唯讀一致性：UI與`GET /api/v1/push-subscriptions`均讀回手機`DISABLED`、電腦`ACTIVE`、兩台last success存在且error為空；D1 `WEB_PUSH` channel為enabled／`READY`且last success存在、error為空；最新delivery為`SENT` 1、to active 1、to disabled 0、error 0，查詢`rows_written=0`。
- 結論：`DDL-008`、`SETUP-006`、`AT-PUSH-01`均為`VERIFIED`；不執行`AT-GATE-08`，不修改production`SETUP-009`或其他整合線。

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
| OAuth state逾時／無效 | callback回`OAUTH_STATE_INVALID`；唯讀D1聚合確認state找不到、已消耗或`expires_at`已過 | 不重播callback、不放寬state／PKCE／redirect驗證、不讀取state或verifier密文 | 回外部連線頁重新按一次正式授權並在`OAUTH_STATE_TTL_MINUTES`時窗內完成；舊過期state留待保留排程清理 | 新state只消耗一次、connection為`CONNECTED`、舊過期state未變成token或payload、手動同步另行通過 |
| Push subscription失效 | provider回410/404或測試通知失敗 | 將該subscription標為失效，其他裝置與站內／Email不受影響 | 該裝置重新按「啟用此裝置通知」取得新endpoint | 測試Push成功、channel last success更新、另一裝置仍可接收 |
| Resend失敗 | delivery為RETRY/FAILED、去敏error code或429 | 保留站內警告；不得無限即時重送或自動升級付費 | 檢查API key/from/收件限制；依backoff重試或更正設定後用測試信 | Resend message ID、delivery SENT、本人收件內容與期限一致且無重複 |
| D1匯出／還原 | export退出非0、檔案缺失、SHA不符或restore query失敗 | 停止寫入與release；不使用無hash檔覆蓋正式D1 | 重新匯出或選上一份hash通過備份；先跑`restore-drill.ps1`，再依Cloudflare匯入流程處理目標庫 | schema version、核心表計數、抽樣資料與App smoke一致 |
| IndexedDB schema錯誤 | 啟動錯誤、migration transaction abort、outbox無法讀取 | Service Worker不清除local DB；暫停上線送出 | 回退前端版本或發布只追加的IndexedDB修正；先匯出可讀outbox再升級 | 離線建立／編輯／刪除、重開、恢復同步與D1存在性E2E全過 |
| 離線outbox卡住 | 待同步數不下降、同operation持續錯誤或OPEN conflict | 保留local payload，不清queue、不盲目重送衝突操作 | 先查錯誤碼；schema問題升級client，衝突在資料頁選LOCAL/SERVER/MERGED，網路錯誤保留退避重試 | outbox歸零、operation只套用一次、server版本與另一裝置一致 |
| Cloudflare Access錯誤 | 本人403或未登入者可進API | 若有繞過風險，立即停用Worker route／部署；不要放寬成Everyone | 修正Access application audience與只允許本人email的policy，再核對Worker `ACCESS_TEAM_DOMAIN/AUD/ALLOWED_EMAIL` | 無session瀏覽器拒絕、本人通過、錯誤aud/過期JWT/API直接請求皆拒絕 |

## 相依套件安全查核

2026-08-02執行`npm audit --omit=dev`：`react-router`與`react-router-dom`各計1項high（共2項），來自同一個React Server Components Server Action CSRF advisory。本產品是Vite瀏覽器SPA與Cloudflare Worker JSON API，不使用`react-server-dom-*`、`unstable_createCallServer`或RSC Static Router；正式程式掃描會禁止這些入口。7.18.2是查核當日npm registry最新版，因此目前記為「不適用路徑的殘餘供應鏈警告」，不能宣稱零漏洞。每次React Router升級或audit advisory有修正版時，必須重跑完整verify與scan並移除此例外；若未來導入RSC，部署立即阻擋直到修補。
