# 成本防線開發計畫

> 文件階段計畫（2026-08-13，官方來源再次查核日 2026-08-14，Asia/Taipei）。本檔把既有 `NFR-001`／`OPS-002` 轉成可執行的開發與驗收閘門；本輪不實作程式、不新增產品功能、不修改帳務或 Cloudflare 設定。

## 0. 判定、證據優先級與範圍

### 0.1 帳戶特定結帳證據優先

使用者提供的 Cloudflare 結帳頁是本帳戶的第一手、去識別證據，優先於先前把一般 Free onboarding 文件套用到本帳戶的稽核結論。畫面明文表示：超出包含額度的額外使用量將按月計費，且勾選授權 Cloudflare 每月向付款卡收取超出免費限制的使用量直到取消。因此本計畫的基線是：**目前 Zero Trust Free 帳戶存在自動超額計費風險**。

本計畫不記錄卡片資料、末四碼、帳戶 email、付款識別、截圖原始路徑或可重建付款資料。一般官方 onboarding 文件所說的 Free 基本方案不收基礎費用，不能推翻這個帳戶特定的結帳授權；帳戶訂閱摘要也不能取代結帳頁的授權狀態核對。

既有唯讀 dashboard 摘要曾顯示 Workers Free 與 Zero Trust／Teams Free Base 的使用中方案，當時沒有看到 Workers Paid 項目；這只能描述該次摘要，不能證明沒有 checkout overage authorization。實際本帳戶的 current usage、產品級 alert、Budget alert 與 billing authorization 是否仍一致，保留為 `SETUP-010` 未完成的外部核對。

### 0.2 只澄清既有要求

- `NFR-001` 的「零月費」是部署目標與必須積極防護的成本條件，不是保證任何帳戶都不會產生按量費用。
- `OPS-002` 要求產品在付費產品漂移、免費額度不明、指標失效或帳戶授權不明時停止非必要用量，不能宣稱程式能阻止 Cloudflare 帳戶扣款。
- 本輪不增加使用者可見的新產品模組；成本告警、管理頁、帳務核對與恢復流程是後續開發／運維驗收，不是本輪已存在的功能。

### 0.3 目前程式 footprint 與已知缺口

目前 `wrangler.toml` 使用 Workers、D1 與 `*/15 * * * *` Cron；沒有 KV、R2、Queues 或 Cloudflare Email binding。程式已有部分運算護欄：D1 寫入批次上限 100、Instagram 每輪最多 40 篇 Insights、該同步路徑最多 43 次外部 subrequest、provider job claim／stale recovery、YouTube 分頁與 Resend idempotency key。這些是請求或資料一致性護欄，**不是帳戶 quota meter、不是付款 hard cap，也不是 Cloudflare 帳戶扣款防止器**。

目前缺少：帳戶／方案 allowlist 與 drift audit、每項資源的權威 usage collector、固定週期與 reset time、50／75／90% 去重告警、95% 降載、100% hard-stop／fail-closed、外部指標失效安全狀態、通知失敗補救、管理者解除稽核及 production 上線前帳務核對。沒有這些證據時，不能把估算、空白 dashboard 或 Free 標籤當成安全。

### 0.4 後續單一修正線

後續 runtime／測試實作統一交給單一的 `NFR-001／OPS-002 cost-guardrail` 修正線，從目前 `codex/accept-external-integrations` 分支的文件契約開始，統一處理 account drift、platform usage、App gate 與恢復稽核；不拆成各 provider 各自宣稱成本安全，也不讓任何 provider 線單獨改帳務或 plan。

## 1. 受控資源與成本契約

### 1.1 官方來源基線

以下數字只代表 2026-08-13 查核到的官方文件；實作時必須在 collector 保存來源 URL、查核時間、plan、period、reset time 與資料品質。官方來源若改版或帳戶顯示不同，以當次帳戶／官方頁面為準，不以本表舊數字硬編碼。

- [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/)：Workers Free 每日 100,000 requests、每次 invocation 10 ms CPU、每次 50 個外部 subrequests、每帳戶 5 個 Cron Triggers；requests 於 00:00 UTC 重置，超過 request limit 回 1027，CPU 超限回 1102。
- [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)：Workers Paid 是獨立於其他 Cloudflare plan 的產品，按量方案有包含量與超額價格；官方建議設定 CPU limits 以降低 runaway bill，但這仍不是帳戶帳務 hard cap。
- [Cloudflare D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/)：Workers Free 每日 5,000,000 rows read、100,000 rows written、總 storage 5 GB；Free 每日額度在 00:00 UTC 重置，達讀／寫上限時 query 失敗，達 storage 上限時不能新增／改 schema／index；Paid 超過包含量按量計費。D1 可由 query `meta`、dashboard 或 GraphQL Analytics 觀測。
- [Cloudflare Zero Trust logs](https://developers.cloudflare.com/cloudflare-one/insights/logs/)：Free Access logs 保留 24 小時；這是可觀測性／保存期限，不是「不會收費」證據。
- [Cloudflare Zero Trust account limits](https://developers.cloudflare.com/cloudflare-one/account-limits/) 與 [seat management](https://developers.cloudflare.com/cloudflare-one/team-and-resources/users/seat-management/)：Access application、IdP、policy 等有平台上限；active user 使用一個 seat，seat 不足時登入會被阻擋。帳戶實際包含 seat 數及結帳授權仍須以帳戶畫面核對，不能猜成固定數字。
- [Cloudflare usage-based billing](https://developers.cloudflare.com/billing/understand/usage-based-billing/) 與 [how billing works](https://developers.cloudflare.com/billing/understand/how-billing-works/)：按量產品以使用量計費並在帳期後列入帳單；Free 標籤、零元基本訂閱與「未看到用量」不能推導沒有超額授權。
- [Cloudflare budget alerts](https://developers.cloudflare.com/billing/manage/budget-alerts/)：Budget alerts 只對 PAYG 帳戶提供，是帳戶級通知；官方明確說明 informational only，不會 pause 或 cap usage。它不是 hard cap。
- [Cloudflare KV pricing](https://developers.cloudflare.com/kv/platform/pricing/)：Workers Free 每日 100,000 reads、1,000 writes、1,000 deletes、1,000 list requests、1 GB；超過某一類 Free limit 後該類操作失敗，Paid 按量計費。
- [Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/)：Standard free tier 每月 10 GB-month、1,000,000 Class A、10,000,000 Class B，egress 免費；Standard 超額按量計費，Infrequent Access 不適用 free tier。
- [Cloudflare Queues pricing](https://developers.cloudflare.com/queues/platform/pricing/) 與 [Free plan changelog](https://developers.cloudflare.com/changelog/post/2026-02-04-queues-free-plan/)：Free 每日 10,000 standard operations；Paid 每月 1,000,000 operations 後按量計費；Free retention 為 24 小時。實際帳戶的超額行為與是否已啟用付費能力仍須 drift audit，未核對前禁止啟用。
- [Cloudflare Email Service pricing](https://developers.cloudflare.com/email-service/platform/pricing/) 與 [limits](https://developers.cloudflare.com/email-service/platform/limits/)：Email Routing 在 Workers Free／Paid 可用且 inbound unlimited；Email Sending 對任意收件人需要 Workers Paid，Paid 每月 3,000 封後按量計費；寄往已驗證 destination 可免費且不計入包含量。此專案目前使用 Resend，不使用 Cloudflare Email Sending。
- [Resend account quotas and limits](https://resend.com/docs/knowledge-base/account-quotas-and-limits) 與 [rate limits](https://resend.com/docs/api-reference/rate-limit)：Free transactional email 每日 100、每月 3,000，送出與收到均計入；起始 rate limit 為 5 requests/sec；超額以 429／quota error 或暫停呈現，不自動升級。response headers 可提供 remaining/reset/quota 指標。
- [YouTube Data API quota](https://developers.google.com/youtube/v3/getting-started)、[quota audits](https://developers.google.com/youtube/v3/guides/quota_and_compliance_audits) 與 [quota cost table](https://developers.google.com/youtube/v3/determine_quota_cost)：預設 10,000 units/day（另有 `search.list`／`videos.insert` 的 method allocation），所有 request 至少消耗 1 unit，quota 在 Pacific midnight 重置；達 quota 應由 API／Google API Console 呈現拒絕或 quota error。Analytics API 的帳戶級可用 quota 不能用 Data API 數字臆造。
- [Meta Graph API rate limiting](https://developers.facebook.com/docs/graph-api/overview/rate-limiting/)：Instagram／Graph 的帳戶級 rate-limit 指標與回應 header 必須以當次官方契約及 provider response 取得；本計畫不把 40 篇／run 或 43 次 Worker subrequest 當成 Meta quota。

### 1.2 受控資源矩陣

表內「owner」是後續實作與操作責任，不代表本輪已有人員或模組實作完成。`unknown`、缺 header、來源 API timeout、plan 不符或 period/reset 不明，一律不是 0%，而是安全未知。

| 資源 | 計費契約／官方配額 | 可觀測指標與週期 | 50／75／90%告警與去重 | 95%／安全門檻降載 | 100% hard-stop／平台失敗 | 恢復程序 | owner |
|---|---|---|---|---|---|---|---|
| Zero Trust／Access | 本帳戶結帳頁已授權超出包含量按月計費；Free base label 不足以否定。seat 是 active-user quota；Access logs Free 保留 24h。實際 seat 包含量、產品 SKU、application／policy session 與超額規則未知，必須帳戶核對。 | plan／SKU、active seats／included seats、Access application／IdP／policy 數、billing authorization state、log retention；以帳戶頁與可用 API 的 observed_at、billing period 觀測。 | seat／產品漂移／授權狀態各用 `resource + period + threshold + observed_window` 去重；授權未知不發「安全」通知，改發阻擋告警。 | 不自動加 seat、不自動升級；阻擋新增非必要 identity／application／測試流量，保留既有本人 Access 的最小服務，等待管理者確認。 | 程式無法阻止 Cloudflare 帳戶扣款；plan／授權／用量來源失效時禁止 production go-live 與非必要 Access 擴張，平台 seat 不足時接受其登入拒絕。 | 管理者唯讀核對 plan、結帳授權、seat、訂閱與帳單；人工解除後留下 audit，重新計算當期 window；不得由 App 自動取消或變更帳務。 | Cloudflare 帳戶管理者（帳戶控制）；App／Ops 只做 drift gate。 |
| Workers request／CPU／subrequest／Cron | Free 100,000 requests/day、10 ms CPU/invocation、50 external subrequests/invocation、5 Cron/account；Workers Paid 有獨立按量契約。request 超額 1027、CPU 超額 1102；route fail-open／closed 要由帳戶／route 控制。 | requests/day、CPU ms/request／Cron、external/internal subrequests/invocation、Cron count；period 為 UTC day、invocation 或 account；以 Workers dashboard／API／trace source。 | 每個 metric 以 UTC day 或 invocation window 的 idempotency key 去重；50/75/90%只在 quota exact 時通知。 | 停排程 provider sync、限制手動 sync、跳過非必要 analytics／notification；保留站內核心資料操作；按請求類別 rate limit。 | provider／非必要 API 返回明確 `QUOTA_EXHAUSTED`／`COST_GUARDRAIL_OPEN`；Workers route／platform 1027／1102 時 fail-closed，不自動切 Paid。 | UTC reset 後重收 metric；管理者確認 plan／CPU limit／route；逐步解除 circuit，先跑 synthetic／staging，再恢復 schedule。 | Worker／Ops（程式降載）；Cloudflare 管理者（plan、route、CPU limit、付費授權）。 |
| D1 read／write／storage | Free 5M rows read/day、100k rows written/day、5 GB total；讀寫超額 query error，storage cap 阻擋寫入／schema，Paid 才有按量 overage。 | 每 database rows_read、rows_written、size_after／storage；UTC day 與 monthly billing window；query `meta`、D1 Metrics／GraphQL，保存 exact／unknown。 | 以 database、metric、UTC day／billing month、threshold 去重；index 額外 rows written 要計入，不以回傳列數估算。 | 停非必要 provider sync、bulk import 與測試信，限制 manual sync；不啟動新的非必要 raw capture，已發生的請求仍保存必要原始錯誤證據；先保留核心 read 與明確錯誤，不以估算放行寫入。 | D1 `QUOTA_EXHAUSTED`／storage error 時 fail-closed；不重試放大量、不自動升 Workers Paid，不執行 migration。 | UTC reset 或清理／人工核准後重新讀 exact metric；先在隔離 D1 驗證 schema／資料，再逐批恢復。 | D1／sync owner（query budget）；Cloudflare 管理者（plan／account billing）。 |
| Resend | Free 100 emails/day、3,000/month、5 req/s；429、daily／monthly quota error 或 provider pause 是停止訊號，不能自動升級。 | response `ratelimit-*`、daily／monthly quota headers、delivery attempts、429／quota errors；日／月 window 依 Resend 回應與 Usage。 | `resource + provider_team + window + threshold` 去重；同一 notification operation 不因告警重試而多寄。 | 停非必要測試信與低優先通知，保留站內／Push；按 rate header backoff，不以重試突破 quota。 | circuit breaker 封鎖 Resend send，保存去敏錯誤；不能用「卡片」或自動 plan upgrade 解決。 | 下一 provider reset／Usage 確認後，管理者解除 breaker；先發一封明確 test，核對 delivery／idempotency，再恢復。 | Notifications／Resend owner；Resend 帳戶管理者控制 plan。 |
| YouTube Data／Analytics quota | Data API default 10,000 units/day；method cost 以官方表固定答案，所有 request 至少 1；Analytics quota／帳戶 billing 未以 Data API 數字代替。達 quota 是 provider error／拒絕，不以 request 次數估算。 | Google API Console quota、response error、method cost、Pacific day reset；保存 project／API、method、units、period、source、quality。 | method cost exact 才能計 50/75/90%；以 project、API、Pacific day、threshold 去重；缺 quota meter 不報安全。 | 停排程／手動 YouTube sync，保留既有 snapshot 與站內功能；不重放 pagination。 | quota error、metric/API timeout 或 method cost unknown 時 fail-closed，不發起下一個外部 request；不申請／切換付費 quota。 | Pacific reset 後由 Console／API 重新確認，管理者解除 provider breaker，再用單次 synthetic／本人批准同步驗證。 | YouTube provider owner；Google project 管理者控制 quota／billing。 |
| Instagram Graph／Insights quota | 官方 rate-limit 契約依帳戶／端點／回應指標；本專案 40 Insights/run、43 Worker subrequests 是程式與 Workers 上限，不是 Meta quota。未知即風險。 | provider response rate-limit header／usage field、HTTP 429／error code、Graph API version、request count；以 provider window 保存 exact／unknown。 | 只有 provider 指標 exact 才發 50/75/90%；以 account／endpoint／window／threshold 去重；缺指標直接告警未知並阻擋。 | 停 Insights 與非必要內容同步，只保留已保存資料；不靠降低到 40 篇宣稱安全。 | 429／rate-limit error／指標失效時 circuit open、不得再試同一 window；不加 permission、升 plan 或擴 scope。 | provider window reset／官方確認後，管理者解除 breaker；先單筆 synthetic／本人批准同步，再逐輪恢復。 | Instagram provider owner；Meta 帳戶管理者控制平台額度。 |
| KV（目前未用） | Free 100k reads/day、1k writes／deletes／list/day、1 GB；各類超額操作失敗，Paid 可能按量。 | 不應有 binding、namespace、request 或 storage；drift audit 應得到 `absent`。 | 若意外出現 binding，先發產品漂移告警；不可把 0 usage 當成已安全。 | 立即禁止任何新 KV 路徑與部署；若無法證明未啟用，停止非必要功能。 | drift／plan／quota unknown 時 fail-closed；不建立 namespace、不試寫驗證。 | 管理者移除／核對 binding 與帳務後，重新跑 drift audit；要啟用必須另開審核線。 | Cloudflare 管理者；架構 owner 審核 allowlist。 |
| R2（目前未用） | Standard free 10 GB-month、1M Class A、10M Class B/month、egress free；超額按量，Infrequent Access 無 free tier。 | binding／bucket、storage GB-month、Class A/B、storage class、billing window；目前期望 `absent`。 | 只在正式核准後設 quota meter；未核准出現 bucket 即 drift 告警，不發假 0%。 | 禁止 object upload／read 路徑；停止部署含 R2 binding 的版本。 | drift 或 billing authorization unknown 時 fail-closed；不建立 bucket／物件。 | 管理者核對產品、storage class、付款授權並由架構 owner 重新 allowlist；無須保留任何測試物件。 | Cloudflare 管理者；架構／資料 owner。 |
| Queues（目前未用） | Free 10k operations/day；Paid 1M/month + overage；Free retention 24h。實際超額處理與帳戶 plan 需 activation audit。 | binding／queue count、64 KB operation chunks、read/write/delete、retry／DLQ、retention、billing window；目前期望 `absent`。 | 未核准不建立告警假象；發現 binding／queue 即 drift 告警。核准後才做 per-window dedup。 | 停止 enqueue／consumer，避免 retry／DLQ 放大；不以空 queue 宣稱沒有成本。 | activation／plan／metric unknown 時 fail-closed；禁止部署新 queue consumer。 | 管理者與 owner 核對後再以 synthetic queue 測試，逐步恢復；不使用 production queue 做 staging 模擬。 | Cloudflare 管理者；排程／架構 owner。 |
| Cloudflare Email（目前未用） | Email Routing Free／Paid 可用；Email Sending 對任意收件人需要 Workers Paid，Paid 3k/month 後按量；verified destination 可免費。 | binding／sending enabled、recipient class、emails sent／rejected、plan／billing window；目前期望 `absent`。 | 未核准 binding 即 drift 告警；核准後按 recipient class／month 去重。 | 禁止 arbitrary outbound send，只保留既有 Resend；不建立 Cloudflare Email 測試寄件。 | binding／plan／verified destination／billing authorization unknown 時 fail-closed。 | 管理者核對並另開 Email 設定線；先用 verified destination synthetic，再由人工允許 production。 | Cloudflare 管理者；Notifications owner。 |

## 2. 三層防線

### Layer A：帳戶／方案 allowlist 與 drift audit

1. 建立去識別 allowlist：目前只允許專案明確使用的 Workers、D1、Cron、Zero Trust／Access 與 Resend；KV、R2、Queues、Cloudflare Email 均為 `DISABLED_UNTIL_REVIEW`。Workers Paid、其他 PAYG SKU、Log Explorer 儲存、額外 Access product、非必要 add-on 不得因 onboarding 或按鈕自動進入 allowlist。
2. 每次部署前與每日運維核對 plan／SKU、Worker billing model、D1／Workers bindings、Cron 數、Access application／seat、checkout overage authorization、可用 alert／budget 與產品 drift。只記 product、plan、狀態、觀測時間與去敏證據，不記付款資料。
3. 帳戶特定結帳授權是 `billing_authorization=RISK_PRESENT` 的初始值，直到管理者完成一次人工帳務核對；Free label 不能把它改成 safe。程式只能拒絕部署／非必要操作，不能取消卡片授權、設定 Cloudflare budget hard cap 或阻止帳戶出帳。
4. plan／帳務頁／API 失效或欄位不相容時，狀態為 `UNKNOWN`，阻擋 production go-live、付費可能路徑與非必要同步；不可寫成「未發現費用」。

### Layer B：平台用量收集與告警

每項觀測必須保存下列非敏感欄位：`resource`、`provider/product`、`plan`、`metric`、`used`、`included`、`unit`、`period_start`、`period_end`、`reset_at`、`timezone`、`source_url_or_api`、`observed_at`、`quality`（`EXACT`／`ESTIMATE`／`UNKNOWN`）、`error_code`、`audit_id`。付款識別與完整帳戶 email 不得保存。

- `EXACT` 才能計算百分比；`ESTIMATE` 只能顯示風險提示，不能通過安全 gate；`UNKNOWN` 必須 fail-closed。
- 50／75／90% 是同一 metric／period 的告警層級，不是 Cloudflare 平台 hard cap。每個 threshold 只送一次，key 為 `resource + metric + period + threshold + source_version`；新 period、reset 或明確恢復才允許新的通知。
- 通知 payload 只含資源、比例／狀態、period、reset、下一動作與 audit id；不含付款資料、secret、token、收件地址或 provider 私人 payload。
- 同一個告警要有 delivery 狀態、attempt、去敏錯誤與 retry backoff。通知失敗不把資源標成 safe；至少保留站內／操作 log，必要時由管理者人工查閱。
- Cloudflare budget alert 可作帳戶級輔助通知，但官方明確不會 pause／cap usage；產品仍需自己的 usage gate 與人工帳務控制。

### Layer C：App 內 rate limit、quota budget、circuit breaker、降載

- `request-gate` 先檢查 resource／operation／window budget，再允許 provider request；同一排程 job 與手動 sync 共享 claim、budget、breaker，避免競態或重試放大。
- 每個 provider budget 保存 operation class、cost unit、period、remaining、quality、reason；缺少 exact provider metric 時不透過保守估算放行。
- 95% 或 provider safety threshold 先降載：停非必要排程、Insights、測試信、bulk import 與重複手動同步；不刪資料、不清 outbox、不自動換 plan。
- 100% 或平台明確 quota／billing API 失敗時 circuit open；對應操作回固定 `COST_GUARDRAIL_OPEN`／`QUOTA_UNKNOWN`／`QUOTA_EXHAUSTED`，不再 retry。核心 read 與非相關模組仍須依 `NFR-009` 可用。
- App hard-stop 只阻止 App 發出後續 requests／writes；它不能撤銷 Cloudflare checkout checkbox、付款方式、Workers Paid、Access seat 或任何帳戶級計費授權。帳戶控制必須由 Cloudflare 管理者完成。

## 3. 實作分階段計畫（本輪不實作）

### Phase 0：證據與 allowlist

- 主要模組（提案名稱）：`cost/account-drift`、`cost/contracts`、部署前檢查腳本與 `docs/OPERATIONS.md`。
- 固定每項 resource 的官方來源、plan、quota、unit、reset、timezone、owner 與 evidence quality；把 checkout evidence 優先規則寫成測試輸入。
- 確認目前 `wrangler.toml` 沒有 KV／R2／Queues／Email binding；任何新增 binding 先被 drift audit 阻擋。
- 不新增 migration；本階段只做文件／設定契約與唯讀核對。

### Phase 1：平台 metric collector 與告警

- 主要模組（提案名稱）：`cost/usage-collector`、`cost/alert-deduper`、`cost/notification`。
- 優先接 D1 `meta`／Metrics、Workers usage、Resend headers／Usage、YouTube Console/API 可得 quota；Instagram 未提供 exact metric 時保持 `UNKNOWN`。
- 若需要跨日／跨月告警去重、audit、恢復歷史，預計需要新增 append-only migration（例如 usage observations／alert deliveries）；本輪不決定正式表名、不修改已套用 migration。若可安全重用既有 audit／delivery schema，必須先做 schema review，不能在 runtime 內偷藏 JSON。

### Phase 2：App budget、rate limit 與 circuit breaker

- 主要模組（提案名稱）：`src/core/cost-guardrail`、provider request gate、scheduled／manual sync coordinator、notification send gate。
- 先把排程與手動 sync 合併到同一 resource／job lock；再加入 50／75／90 告警、95 降載、100 stop、reset 與管理者解除 audit。
- 對外錯誤必須有固定 schema／error code；不把平台 429、1027、1102、D1 quota error、billing API timeout 轉成成功或「用量安全」。

### Phase 3：staging 合成驗收

- 只使用本機 fixture、stubbed provider response、固定 quota clock、synthetic headers 與新隔離 D1；不得呼叫真實 YouTube／Instagram／Resend、不得產生真實 email／Push、不得製造 Cloudflare billable usage。
- 對 staging worker 只驗證 gate／錯誤／audit／reset；不以 staging dashboard 的空用量推論 production 帳戶安全。

### Phase 4：production 前人工帳務閘門

- 先完成 `SETUP-010` 的一次唯讀帳務核對：Cloudflare 中文介面核對訂閱／方案、超額授權、Billable Usage、Notifications／Budget alerts 與已啟用產品；只記去識別摘要。
- 若仍不能證明付款授權、產品 allowlist、quota source 與 hard-stop 邊界，production 維持 `AWAITING_USER_SETUP`／`EXTERNAL_BLOCKED`，不部署、不啟用非必要資源。
- 人工核對不是本輪要求的使用者操作；本輪只規劃，不開啟 dashboard、不修改設定。

### 部署、回復與 migration 判斷

- 本輪部署：無；本輪不改程式、不改 `wrangler.toml`、不跑 migration、不修改 Secrets／vars／Access／付款設定。
- 未來部署順序：先本機固定答案與掃描，再 staging synthetic gate，再只讀帳戶 drift，最後才 production；production 前必須有 `SETUP-010` 證據。
- 未來回復：先關閉新非必要 provider／schedule gate（fail-closed），保留資料與 audit；若成本模組自身故障，回到只允許核心 read／手動人工批准的安全模式，不回退到無限制同步。帳戶級付款／plan drift 由 Cloudflare 管理者按帳戶程序回復，程式不得代做。
- migration：本輪 `不新增`。若 Phase 1 需要跨 window 去重、通知投遞與管理者解除歷史，實作前需提出新 append-only migration、fresh／upgrade／rollback 證據；不得修改已套用 migration，也不得用估算欄位代替正式成本資料表。

## 4. 可由程式實現 vs 只能帳戶控制

| 項目 | 可由程式實現 | 只能由帳戶／平台控制 |
|---|---|---|
| quota 觀測 | 讀取官方 metric／header、保存來源與品質、計算 exact percentage | 官方是否提供 metric、quota 定義、reset 與 plan allocation |
| 降載與 hard-stop | rate limit、shared budget、circuit breaker、停止排程／手動 sync／provider request、固定錯誤碼 | Cloudflare 帳戶本身是否繼續接受請求、平台 1027／1102／D1 denial 行為 |
| 方案漂移 | 讀取設定、比對 allowlist、阻擋 deploy／非必要操作、產生 audit | Workers Paid／R2／Queues／Email／Zero Trust product 的啟用、取消、方案與付款授權 |
| 告警 | 50／75／90 去重、通知重試、站內風險狀態、通知失敗記錄 | Cloudflare Budget alert 是否可用；Budget alert 不會成為 hard cap |
| 恢復 | quota reset 後重新觀測、管理者批准後逐步開 circuit | 付款方式、checkout checkbox、帳戶 invoice、seat／plan／billing policy 的變更或取消 |

任何實作若聲稱「程式能阻止 Cloudflare 扣款」即違反本計畫與 `OPS-002`，必須在 code review 阻擋。

## 5. 驗收與設定索引

成本防線的固定答案詳見 `docs/ACCEPTANCE_TESTS.md`：

- `AT-OPS-03` 帳戶付費產品／SKU drift；
- `AT-OPS-04` 固定答案 quota、unit、period、reset 與 provenance；
- `AT-OPS-05` 50／75／90% 告警去重；
- `AT-OPS-06` 95%／安全門檻降載；
- `AT-OPS-07` 100% hard-stop／fail-closed；
- `AT-OPS-08` 排程／手動同步競態與 shared budget；
- `AT-OPS-09` 外部 metric／API 失效不得誤報安全；
- `AT-OPS-10` 跨日／跨月 reset；
- `AT-OPS-11` UTC、Pacific、Asia/Taipei 與顯示時區；
- `AT-OPS-12` 通知失敗、重試與安全狀態；
- `AT-OPS-13` 管理者解除與 audit；
- `AT-OPS-14` staging synthetic 不消耗真實付費 quota；
- `AT-OPS-15` production 上線前人工帳務核對；
- `AT-OPS-16` checkout evidence 優先於一般 Free 說明；
- `AT-OPS-17` provider quota unknown／fixed answer 邊界；
- `AT-OPS-18` 程式 hard-stop 與帳戶控制邊界；
- `AT-OPS-19` reset／人工批准後的安全恢復；
- `AT-OPS-20` 指標品質、來源版本與告警 window 稽核。

唯一規劃中的真人設定閘門是 `SETUP-010`；本輪不要求使用者執行。
