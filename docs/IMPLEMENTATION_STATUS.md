# 實作狀態與完成證據

> 本檔案是唯一可宣稱功能狀態的地方。Codex必須逐項更新，不得以聊天摘要取代。

## 狀態定義

- `NOT_STARTED`
- `IN_PROGRESS`
- `IMPLEMENTED_UNVERIFIED`
- `AWAITING_USER_SETUP`
- `EXTERNAL_BLOCKED`
- `VERIFIED`

## 第一批需求帳本

| 需求ID | 狀態 | 實作路徑 | migration | 測試／證據 | 阻擋／備註 |
|---|---|---|---|---|---|
| CORE-001 | VERIFIED | `src/modules/areas`, `src/app/pages/AreasPage.tsx` | `0001_core.sql` | D1 CRUD/version/audit；Playwright真實寫入 | 無 |
| CORE-002 | VERIFIED | `src/modules/areas`, `src/app/pages/AreasPage.tsx`, `src/worker/api/resources.ts` | `0001_core.sql`，不需新migration | 事業可連收入來源／支出分類／任務／事件／指標／內容／保存檢視；七種D1契約、斷鏈拒絕及UI移除通過 | 無 |
| CORE-003 | VERIFIED | `src/modules/*`, `src/app/pages`, `src/app/hooks/use-resource.ts` | `0001`~`0005`，不需新migration | 領域、事業、任務排程、財務設定、社群手動資料、指標／事件、期限均有新增、修改及封存／恢復或刪除路徑；Worker與Playwright驗收 | 無 |
| CORE-004 | VERIFIED | `src/modules/metrics/formula` | `0001_core.sql` | `formula.test.ts`及D1 20/1000×100=2、除零422 | 無 |
| CORE-005 | VERIFIED | `src/modules/events`, `MetricsPage.tsx` | `0001_core.sql` | 事件CRUD、時間軸overlay、離線寫入路徑 | 無 |
| CORE-006 | VERIFIED | `src/modules/metrics`, `MetricsPage.tsx`, `MetricLineChart.tsx` | `0001_core.sql`，本輪不需新migration | 角色分組、數值／文字序列、CSV與編輯刪除；Recharts座標、鍵盤tooltip、完整provenance及D1資料更新後曲線改變E2E通過 | 無 |
| CORE-007 | VERIFIED | `src/core/provenance`、finance/social/metrics analytics與圖表 | `0001_core.sql`，本輪不需新migration | 27 unit、16 Worker/D1固定答案；圖表展開可見版本、品質、樣本／觀測／缺失／排除、時間窗、篩選、分組、聚合、分母、伺服器計算時間、來源與證據連結 | 無 |
| TASK-001 | VERIFIED | `src/modules/tasks`, `TasksPage.tsx` | `0002_tasks.sql` | recurrence固定答案含每日／週／月／RRULE | 無 |
| TASK-002 | VERIFIED | `src/modules/tasks/service.ts`, 完成歷史UI | `0002_tasks.sql` | 獨立completion、冪等、歷史清單 | 無 |
| TASK-003 | VERIFIED | `src/modules/tasks/service.ts`, `HomePage.tsx` | `0002_tasks.sql`，不需新migration | 2026-08-01~03補產生、非法同日延後400、延後至08-04 version 2；首頁離線完成與同步E2E | 無 |
| TASK-004 | VERIFIED | 任務／領域／事業UI與sync | `0001_core.sql`, `0002_tasks.sql` | 指引欄位、離線完成E2E | 無 |
| FIN-001 | VERIFIED | `src/modules/finance`, `FinancePage.tsx` | `0003_finance_investments.sql` | 多幣帳戶與原幣/TWD分析契約 | 無 |
| FIN-002 | VERIFIED | transaction CRUD/UI | `0003_finance_investments.sql` | 新增、編輯、封存、查詢、來源證據 | 無 |
| FIN-003 | VERIFIED | income sources、analysis、`FinancePage.tsx`圖表 | `0003_finance_investments.sql`，本輪不需新migration | 來源月收入／占比／趨勢與篩選固定答案；圖例、鍵盤tooltip、證據連結及D1更新後點數2→3與曲線路徑改變E2E | 無 |
| FIN-004 | VERIFIED | snapshots、net worth/trend、`src/modules/finance/query.ts` | `0003_finance_investments.sql`，本輪不需新migration | 淨值、配置、趨勢、快照編輯刪除；趨勢由伺服器回傳完整`AnalyticResult`及正式`calculatedAt`，Worker契約通過 | 無 |
| FIN-005 | VERIFIED | `src/core/money`, finance query | `0003_finance_investments.sql` | Decimal換算、匯率證據、缺匯率排除 | 無 |
| FIN-006 | VERIFIED | monthly/category/moving analysis、`src/modules/finance/query.ts` | `0003_finance_investments.sql`，本輪不需新migration | 月總額、分類、3/6/12月移動平均固定答案；三組財務圖表均由API回傳完整provenance並通過Worker schema契約 | 無 |
| FIN-007 | VERIFIED | `src/modules/finance/analytics.ts` | `0003_finance_investments.sql` | 覆蓋率、基準、超過基準月份固定答案 | 無 |
| FIN-008 | VERIFIED | `FinancePage.tsx`, finance query schema、`MetricLineChart.tsx` | 不需新migration | 月／季／年、原幣/TWD、來源／事業／分類／帳戶篩選API及UI；軸、刻度、單位、圖例、tooltip與設定E2E通過 | 無 |
| INV-001 | VERIFIED | investment account/snapshot/UI | `0003_finance_investments.sql` | 手動券商總值與現金納入淨值／配置 | 無 |
| INV-002 | AWAITING_USER_SETUP | `src/integrations/firstrade-csv`, `InvestmentImportPanel.tsx` | `0003_finance_investments.sql` | importer unit、D1重跑2筆不重複、原檔證據 | 等待遮蔽Firstrade真實CSV及畫面核對 |
| INV-003 | VERIFIED | provider policy、scan | 不需 | 無帳密／逆向登入／下單；secret與關鍵字掃描通過 | 無 |
| INV-004 | VERIFIED | investment schema/import boundary | `0003_finance_investments.sql` | 僅保存來源回報活動，不推導成本或損益 | 無 |
| SOC-001 | VERIFIED | social resources、entity-tags | `0004_social_integrations.sql` | content/post分離、平台帳號、內容標籤 | 無 |
| SOC-002 | VERIFIED | social snapshots/UI | `0004_social_integrations.sql` | 多時間點、累積旗標、原始名稱／定義／來源 | 無 |
| SOC-003 | VERIFIED | `src/integrations/structured-csv` | `0004`, `0007` | 預覽／映射／逐列錯誤／原檔／跨批次去重 | 無 |
| SOC-004 | VERIFIED | events + `MetricLineChart` + `SocialPage.tsx` | `0001`, `0004`，本輪不需新migration | Asia/Taipei時間比例、事件類型篩選、hover、鍵盤focus、點擊狀態與對應時間點E2E通過 | 無 |
| SOC-005 | VERIFIED | social analytics/query/UI | `0004_social_integrations.sql`，本輪不需新migration | MEAN/SUM/MEDIAN/DISTRIBUTION比較與保存檢視；平均及五數分布圖表、聚合／分組設定UI驗收通過 | 無 |
| SOC-006 | VERIFIED | `selectFirstDaySnapshot` | `0004_social_integrations.sql` | 15分鐘不足、45分鐘NEAREST固定答案 | 無 |
| SOC-007 | VERIFIED | conversions CRUD/UI | `0004_social_integrations.sql` | 20→40後總成交70、轉化率1.75% D1契約 | 無 |
| SOC-008 | VERIFIED | social provenance、`SocialPage.tsx`, `MetricLineChart.tsx` | `0004_social_integrations.sql`，本輪不需新migration | API provenance及UI計算依據展開、品質／樣本／缺失／分母／來源連結E2E通過 | 無 |
| SOC-009 | AWAITING_USER_SETUP | `src/integrations/youtube`, OAuth/sync/UI | `0004_social_integrations.sql` | scope/PKCE/state/redirect自動測試；adapter與密文token完成 | 等待Google client及真實頻道AT-YT-04/05 |
| SOC-010 | AWAITING_USER_SETUP | `src/integrations/instagram`, OAuth/sync/UI | `0004_social_integrations.sql` | 最小scope/state、adapter、原始payload與密文token完成 | 等待Meta App及真實專業帳號AT-IG-02/03 |
| SOC-011 | VERIFIED | provider registry | 不需 | registry unit；新增provider不改分析核心 | 無 |
| DDL-001 | VERIFIED | deadline CRUD/UI | `0005_deadlines_notifications.sql` | 通用期限、完成歷史、兩級validation | 無 |
| DDL-002 | VERIFIED | schema/templates/UI | `0005_deadlines_notifications.sql` | 範本降級API回400 | 無 |
| DDL-003 | VERIFIED | scheduler/query | `0005_deadlines_notifications.sql` | 單一actionable date與本地發送時間測試 | 無 |
| DDL-004 | VERIFIED | scheduler/deliveries | `0005_deadlines_notifications.sql` | 重複週期、完成停止、dedupe固定答案 | 無 |
| DDL-005 | VERIFIED | 全站/Home警告UI | 不需 | 最高級中斷式、重要級持續顯示 | 無 |
| DDL-006 | VERIFIED | W-8BEN schema/UI | `0005_deadlines_notifications.sql` | 2026-04-18→2029-12-31；確認日與試算並存 | 無 |
| DDL-007 | VERIFIED | tax template/parent child UI | `0005_deadlines_notifications.sql` | 子任務不另啟全站／排程警告 | 無 |
| DDL-008 | AWAITING_USER_SETUP | Web Push encryption/scheduler/device UI | `0005_deadlines_notifications.sql` | 兩裝置密文訂閱與獨立停用D1契約 | 等待真實手機、電腦權限與接收 |
| DDL-009 | AWAITING_USER_SETUP | `src/integrations/resend`, delivery log/test UI | `0005_deadlines_notifications.sql` | adapter、去重、錯誤/重試與secret邊界完成 | 等待Resend key、from及真實收件 |
| OFF-001 | VERIFIED | manifest、service worker、App shell | 不需 | Playwright五種viewport確認manifest連結、受控service worker、離線重開與正式資產 | 無 |
| OFF-002 | VERIFIED | IndexedDB entities/query cache | 不需 | offline-sync unit、Playwright快取資料 | 無 |
| OFF-003 | VERIFIED | `src/core/sync`, `src/core/network/request-gate.ts`, offline CRUD UI + outbox | `0006_sync.sql`，不需新migration | 27種核心輸入類型離線建立／修改／封存／恢復unit；UI離線修改→重開→封存→重開→恢復→D1 E2E；任務、財務、資產、指標、事件、社群、期限流程E2E | 無 |
| OFF-004 | VERIFIED | sync manager/SW lifecycle | `0006_sync.sql` | 離線建立→outbox 1→恢復→0→D1存在，三尺寸E2E | 無 |
| OFF-005 | AWAITING_USER_SETUP | device registration/pull/change log | `0006_sync.sql` | 兩邏輯裝置D1測試通過 | 等待兩台實體裝置最終驗收 |
| OFF-006 | VERIFIED | conflicts API/DataPage | `0006_sync.sql` | LOCAL/SERVER/MERGED，人工合併版本3 | 無 |
| DATA-001 | VERIFIED | full JSON export/import | 不需新migration | checksum、schema、secret排除、空庫還原契約 | 無 |
| DATA-002 | VERIFIED | module CSV export | 不需 | finance/tasks/metrics/social/events/deadlines/import批次，防公式注入 | 無 |
| DATA-003 | VERIFIED | `backup-local.ps1`, `restore-drill.ps1` | 不需 | 2026-08-03備份40,672 bytes、SHA-256驗證、schema 8與108 SQL commands隔離還原成功 | 無 |
| DATA-004 | VERIFIED | CRUD、sync tombstones、import evidence | `0001`~`0006` | true delete→DELETE tombstone；舊離線版本只形成衝突不復活 | 無 |
| UI-001~006 | VERIFIED | `src/styles.css`, `src/app` | 不需／依功能 | 320、390、768、1366、1920px Playwright與全頁截圖；首頁層級、行內超重要期限、對話框、無水平溢位及reduced-motion通過 | 無 |
| UI-CHART-001~010 | VERIFIED | `src/components/charts`, finance/social/metrics pages | 不需 | Recharts wrapper；圖名、雙軸語意、刻度、單位、圖例、鍵盤tooltip、資料品質、完整provenance、事件互動、D1更新曲線E2E逐項通過 | 無 |
| SEC-001~005 | AWAITING_USER_SETUP | Access JWT、AES-GCM、OAuth state/PKCE、export/scan | 視需要 | access/oauth unit+D1、秘密/假資料/RSC掃描通過 | 等待Cloudflare Access真實政策與production檢查 |
| OPS-001~011 | AWAITING_USER_SETUP | `wrangler.toml`, scheduled retention、scripts、`docs/OPERATIONS.md` | 不需 | local build/test/13項D1/backup/restore gate通過 | 等待Cloudflare登入、staging/production migration與部署 |

### 跨域第一批ID狀態索引

下列需求原本只以群組列在帳本中；此索引明確列出每個ID，避免範圍表示造成漏追蹤。狀態以最嚴格的共同閘門表示；若群組內含真實雲端驗收，群組維持`AWAITING_USER_SETUP`。

| 類別 | 需求ID | 狀態 | 實作／證據位置 |
|---|---|---|---|
| 產品原則 | PRD-VISION-001, PRD-VISION-002, PRD-VISION-003, PRD-VISION-004, PRD-VISION-005 | VERIFIED | 正式資料流、指引、角色型指標、事業原則、無延後功能空殼；unit/Worker/E2E |
| 非功能 | NFR-001, NFR-002, NFR-003, NFR-004, NFR-005, NFR-006, NFR-007, NFR-008, NFR-009, NFR-010 | AWAITING_USER_SETUP | 本機效能／UI／provenance／export／安全測試通過；等待免費雲端與Access實測 |
| 架構 | ARCH-001, ARCH-002, ARCH-003 | VERIFIED | `src`模組化單體、增量migration、provider registry；需求覆蓋與契約測試 |
| UI | UI-001, UI-002, UI-003, UI-004, UI-005, UI-006 | VERIFIED | `src/app`, `src/styles.css`；320/390/768/1366/1920px E2E、截圖、首頁層級、reduced-motion與無水平溢位 |
| 圖表 | UI-CHART-001, UI-CHART-002, UI-CHART-003, UI-CHART-004, UI-CHART-005, UI-CHART-006, UI-CHART-007, UI-CHART-008, UI-CHART-009, UI-CHART-010 | VERIFIED | `src/components/charts`；Recharts、軸／刻度／單位／圖例／tooltip／完整provenance／事件互動／D1更新曲線 |
| 安全 | SEC-001, SEC-002, SEC-003, SEC-004, SEC-005 | AWAITING_USER_SETUP | Access/OAuth/密文/匯出邊界與掃描通過；等待production Access政策驗收 |
| 操作 | OPS-001, OPS-002, OPS-003, OPS-004, OPS-005, OPS-006, OPS-007, OPS-008, OPS-009, OPS-010, OPS-011 | AWAITING_USER_SETUP | local verify、保留排程、備份與隔離還原通過；等待staging/production部署 |
| 外部設定 | SETUP-001, SETUP-002, SETUP-003, SETUP-004, SETUP-005, SETUP-006, SETUP-007, SETUP-008, SETUP-009 | AWAITING_USER_SETUP | `docs/SETUP_CHECKLIST.md`已填名稱、路徑、secret與驗證；由SETUP-002登入開始 |

## 2026-08-02 本輪開工紀錄

### 2026-08-03 03:03 最終本機部署閘門稽核（03:13完成）

- 稽核狀態：`VERIFIED`。範圍為`AT-GATE-01`至`AT-GATE-07`可在本機完成的部分；單一完整`npm run verify`於03:07開始，03:13以exit 0完成，總耗時359.8秒。
- 預定修改：若證據一致，只更新`docs/IMPLEMENTATION_STATUS.md`；若發現衝突，依實際缺口修改對應程式、測試及文件。既有`0001`~`0008`不得修改，預期不需新migration。
- 預定測試：需求112 ID雙帳本、lint、client／Worker typecheck、27 unit、16 Worker/D1與API契約、client build、12個隔離D1 Playwright、正式碼假資料／秘密／未實作與skip掃描，以及fresh migration。
- 外部阻擋：Cloudflare CLI尚未登入；`AT-GATE-08`、真實跨裝置、Firstrade CSV、YouTube、Instagram、Push、Resend及production Access不納入本機完成宣稱，維持`AWAITING_USER_SETUP`。
- 稽核衝突（03:05）：`scripts/scan-production-placeholders.mjs`的未實作規則只匹配`TO_DO/FIX_ME`，未實際匹配規格要求的`TODO/FIXME`；測試跳過規則也未涵蓋`.fixme()`。預定修改該掃描器並加入規則自我驗證；完成前`AT-GATE-03/04`不得視為本次已通過。
- 稽核衝突（03:07）：`scripts/verify-requirements.mjs`原先只驗證ID字串存在，歷史紀錄也可造成誤通過，沒有證明每個ID位於正式狀態表。預定改為解析狀態表、展開`PREFIX-001~NNN`、拒絕衝突或未收斂狀態，並要求`AWAITING_USER_SETUP`具體記載外部等待原因。
- 稽核結果：掃描器現已實際阻擋`TODO`、`FIXME`、`NotImplemented`及`.skip/.todo/.fixme/.only`，並以內建sentinel自驗規則；`src`、`public`及13個測試／設定檔通過。需求驗證器現解析兩種正式狀態表格式及範圍，證明112個第一批ID狀態一致：71個`VERIFIED`、41個具體外部閘門的`AWAITING_USER_SETUP`，無衝突、`IN_PROGRESS`或`IMPLEMENTED_UNVERIFIED`第一批ID。
- 安全收斂：`.tmp/`內的Playwright trace解包及`backups/`內的D1 SQL／SHA證據均保留在本機，但整個目錄加入`.gitignore`，避免未來含真實資料的診斷或備份檔誤入Git。
- 實際修改：`.gitignore`、`scripts/scan-production-placeholders.mjs`、`scripts/verify-requirements.mjs`、`docs/IMPLEMENTATION_STATUS.md`；不需migration，未修改`0001`~`0008`。

### 2026-08-03 01:24 圖表與完整viewport證據稽核

- 需求：`CORE-006`, `FIN-003`, `FIN-008`, `SOC-004`, `SOC-005`, `SOC-008`, `UI-001~006`, `UI-CHART-001~010`先改為`IN_PROGRESS`；既有API與計算證據保留，但不得用未覆蓋圖表語意的離線E2E支撐完整UI驗收。
- 規格／程式衝突：`ARCHITECTURE.md`指定Recharts加專案wrapper，目前`MetricLineChart.tsx`以自製SVG繪圖；`AT-CHART-01~10`要求tooltip、設定、事件hover／點擊與更新後曲線改變，目前Playwright未逐項檢查；`AT-UI-03`要求320、390、768、1366及大型桌面，目前只有320、390、1366。
- 預定修改：`src/components/charts/MetricLineChart.tsx`、`src/app/pages/SocialPage.tsx`、必要樣式、`playwright.config.ts`、`scripts/run-e2e.mjs`、`tests/e2e/app.spec.ts`及受影響文件；不修改既有migration，預期不需新migration。
- 預定測試：D1建立財務／指標／社群正式資料後驗證圖名、軸、刻度、單位、圖例、tooltip、定義、來源、篩選／聚合、事件標註與資料更新；另驗證768px與大型桌面、首頁順序及reduced-motion。
- 外部阻擋：Cloudflare仍未登入；圖表與viewport稽核完全可在本機完成，不以外部設定延後。
- 延伸衝突（01:35）：財務分析圖表的`lastUpdated`由前端呼叫`new Date()`產生，並非伺服器計算時間；`finance/analysis`與`net-worth-trend`也缺少圖表層級完整`AnalyticResult`。因此`CORE-007`、`FIN-004`、`FIN-006`同步改為`IN_PROGRESS`，預定修改`src/modules/finance/query.ts`、`FinancePage.tsx`與Worker契約測試；不需migration、無外部阻擋。

### 2026-08-03 02:58 圖表與完整viewport稽核結果

- `CORE-006`, `CORE-007`, `FIN-003`, `FIN-004`, `FIN-006`, `FIN-008`, `SOC-004`, `SOC-005`, `SOC-008`, `UI-001~006`, `UI-CHART-001~010`均完成缺口修正並改為`VERIFIED`。
- `MetricLineChart.tsx`改用規格指定的Recharts wrapper；財務、指標與社群圖表共用明確軸名、刻度、單位、圖例、鍵盤tooltip、事件標記與可展開provenance。社群新增五數分布、事件類型篩選及hover／focus／click狀態。
- 財務analysis與net-worth-trend由伺服器回傳完整`AnalyticResult`，不再用前端目前時間冒充計算時間；Worker固定答案驗證來源、樣本、觀測、缺失、排除、時間窗、篩選、分組、聚合、分母及`calculatedAt`。
- 首頁把今日行動放在第一個主區塊，超重要期限同時提供行內可操作入口與中斷式對話框；320、390、768、1366、1920px及reduced-motion均有Playwright證據與全頁截圖。
- 同步UI修正已完成上傳卻因重分析仍顯示「同步中」的競態；E2E改以`sync/batch`的`APPLIED`與後續`sync/changes`正式snapshot驗證D1寫入及下行同步，避免Windows本機Wrangler在離線恢復後被第二網路client並發讀取觸發崩潰。只有健康檢查確認Worker死亡才允許最多兩次全新D1重試，產品斷言失敗不重試。
- 實際修改：`src/components/charts/MetricLineChart.tsx`、`src/components/design-system/Panel.tsx`、`src/app/pages/FinancePage.tsx`、`MetricsPage.tsx`、`SocialPage.tsx`、`HomePage.tsx`、`src/app/providers/SyncProvider.tsx`、`src/modules/finance/query.ts`、`src/styles.css`、`playwright.config.ts`、`scripts/run-e2e.mjs`、`tests/e2e/app.spec.ts`、`tests/worker/api-d1.test.ts`及本輪受影響文件。
- migration：不需新增；未修改`0001`~`0008`。外部設定閘門未變。

### 續作完成性稽核（23:10開始）

- 需求：`CORE-002`, `CORE-003`, `TASK-003`, `OFF-003`先改為`IN_PROGRESS`；若稽核發現其他證據不足，必須同步降級，不沿用先前宣稱。
- 預定修改：`src/app/pages`、`src/app/hooks/use-resource.ts`、`src/core/sync`、對應module/API；若資料欄位不足只新增`0009_*.sql`，不得修改`0001`~`0008`。
- 預定測試：新增D1契約與Playwright，明確覆蓋延後任務、事業跨模組關聯，以及任務完成、財務交易、資產快照、指標、事件、社群快照／成交、期限完成的離線新增、編輯、刪除／封存、重開與恢復同步。
- 外部閘門：Cloudflare仍未登入；YouTube、Instagram、Firstrade真實CSV、Push、Resend及兩台實體裝置仍維持既有`AWAITING_USER_SETUP`，不影響本輪本機修正。

### 續作完成性稽核結果（2026-08-03 01:20）

- `CORE-002`：補齊通用事業跨模組關聯schema、API、七種正式目標驗證、UI建立／移除與D1契約，改為`VERIFIED`。
- `CORE-003`：補齊各自定義管理資料的編輯、封存／恢復或刪除操作路徑與唯讀provider邊界，改為`VERIFIED`。
- `TASK-003`：首頁可完成與版本化延後；補產生漏掉的歷史發生項、延後日期驗證、audit及離線同步，改為`VERIFIED`。
- `OFF-003`：修正RESTORE欄位、Service Worker離線資產、首次同步競速、共用請求閘門、同步中再次觸發補跑、每輪30秒逾時及非同步表單reset；27種核心輸入類型unit與完整UI重開生命週期通過，改為`VERIFIED`。
- migration：不需新增；現有`0001_core.sql`已有`entity_links`，`0002_tasks.sql`已有發生項延後欄位，`0006_sync.sql`已有裝置游標與change log；未修改任何已套用migration。

### 開工時現況差距

- 工作區只有規格文件；沒有Git repository、`package.json`、正式程式、D1 migration、測試或部署設定。
- `TRACEABILITY_MATRIX.md`提到`ARCH-001~008`，但`ARCHITECTURE.md`只正式定義`ARCH-001~003`。本輪以已定義的三項施工，未自行捏造`ARCH-004~008`；需後續由規格決策補正矩陣文字。
- 所有功能均無實作證據；所有外部整合也尚無帳號、secret、真實CSV、裝置或雲端Access驗收。

### 本輪完成結果

- 已建立正式React／Worker／D1模組化單體、八個只追加migration、本機D1、PWA與完整測試工具鏈；production不seed使用者資料。
- 所有不依賴外部帳號的第一批功能已依上方帳本逐項實作並通過固定答案、D1契約與五種viewport真實E2E。
- 社群比較實際支援平均、總和、中位數與五數分布，保存的比較定義會控制API與圖表；轉化率同時保存總和比與個別比率平均。
- 操作／通知紀錄預設保留365日、OAuth state保留30日；同步change log只在所有有效裝置游標確認後清除。原始匯入檔與provider原始證據不由此排程刪除。
- 仍未通過的項目只有帳本中標示`AWAITING_USER_SETUP`的真實外部驗收；沒有以mock、fixture或示範資料替代。

### 預定修改範圍

- 專案與工具鏈：`package.json`、TypeScript/Vite/Tailwind/Vitest/Playwright/Wrangler設定、CI與掃描腳本。
- Runtime：`src/worker`、`src/core`、`src/modules`、`src/integrations`、`src/service-worker`。
- UI：`src/app`、`src/components`、`public`。
- 資料：新增`migrations/0001_core.sql`至`0006_sync.sql`；首次本機套用後，依寫入冪等與系統級通知／provider定義需求另新增`0007_api_idempotency.sql`及`0008_operational_defaults.sql`，未修改已套用migration。`0008`只建立正式系統設定，不建立使用者或示範資料。
- 測試：`tests/unit`、`tests/database`、`tests/api`、`tests/integration`、`tests/e2e`與本機D1還原驗證。
- 文件：本檔、`TRACEABILITY_MATRIX.md`、`DATA_AND_SYNC.md`、`OPERATIONS.md`、`SETUP_CHECKLIST.md`與受影響架構說明。

### 外部設定閘門

- Cloudflare帳號登入、staging/production D1、Worker、Access政策與正式部署。
- Google OAuth client與真實YouTube頻道授權。
- Meta App與真實Instagram專業帳號授權。
- 使用者提供不進Git的Firstrade遮蔽實際CSV。
- Resend帳號、API key、使用者本人收件信箱。
- 手機及電腦的Web Push權限與真實接收。
- 兩台真實裝置的PWA離線與跨裝置驗收。

## 延後需求

| 需求ID | 狀態 | 說明 |
|---|---|---|
| DEFER-001 | NOT_STARTED | 人際關係正式模組，等待使用者定義 |
| DEFER-002 | NOT_STARTED | 腦子面正式模組，等待使用者定義 |
| DEFER-003 | NOT_STARTED | Facebook、Threads、方格子API |
| DEFER-004 | NOT_STARTED | Firstrade正式自動provider |
| DEFER-005 | NOT_STARTED | 深度投資帳務與損益 |

延後需求不得在正式導航顯示空白頁或「即將推出」卡片。

## Release證據

### Release名稱
`R1-formal`

### 最近測試
- 日期：2026-08-03 03:13（Asia/Taipei）
- commit：尚無初始commit；目前工作樹全部為未追蹤正式專案檔，未代替使用者建立commit。
- lint：`npm run lint`，通過，0 warnings。
- typecheck：`npm run typecheck`，client及Worker皆通過。
- client build：`npm run build:client`通過，798 modules；輸出`app.js` 958.97 kB（gzip 276.06 kB）。Vite仍提示單chunk超過500 kB，且`rrule`套件發出缺上游sourcemap來源警告；兩者不影響本輪正確性閘門，但production效能仍隨`NFR-001~010`維持雲端實測前的`AWAITING_USER_SETUP`，未宣稱已完成真實效能驗收。
- unit：`npm test`，9 files、27/27通過；含27種核心輸入類型離線生命週期與outbox 108筆不遺失、同步併發觸發補跑及30秒逾時固定答案。
- database：`npm run test:worker`，真實D1 migration/schema/CRUD/retention/tombstone/RESTORE共16/16通過。
- API contract：包含於Worker 16/16；Zod錯誤、冪等、版本衝突、OAuth callback、七種事業關聯、任務延後、同步RESTORE與分析固定答案通過。
- Playwright：`npm run test:e2e`，8個獨立desktop正式流程，加上768px、1920px、mobile-390、mobile-320，共12/12通過、exit 0、356.3秒；每組使用全新D1並套用`0001`~`0008`。覆蓋線上D1寫入、離線生命週期、同步協定snapshot、完整圖表語意與互動、D1更新曲線、首頁層級、reduced-motion及無水平溢位。
- 完整閘門：`npm run verify`於2026-08-03 03:07開始，依序執行lint、雙TypeScript、27 unit、16 Worker/D1與API契約、client build、12個隔離D1 Playwright、正式碼掃描及112-ID狀態表驗證，03:13完成，exit 0、總耗時359.8秒。
- fake-data scan：`npm run scan`，`src`及`public`通過；未發現fixture import、demoData、Math.random、秘密、任意程式執行、Firstrade帳密或RSC正式入口；掃描規則sentinel自驗通過。
- unfinished scan：通過；`TODO`、`FIXME`、`NotImplemented`為正式碼阻擋項；13個測試／設定檔未發現`.skip`、`.todo`、`.fixme`或`.only`。
- requirement status gate：112個第一批ID均有一致的正式狀態表紀錄，`VERIFIED=71`、`AWAITING_USER_SETUP=41`；後者各列具體外部等待原因。
- migration fresh：`applyD1Migrations`套用`0001`~`0008`，schema version 8、使用者資料表全空、僅正式系統預設；通過。
- migration upgrade：本輪本機D1按新增順序套用`0001`~`0008`，最後`wrangler d1 migrations apply --local`回報no migrations；未修改已套用migration。因尚無上一個release，無跨release資料集。
- backup restore：`life-manager-local-20260803-002507.sql`，40,672 bytes，SHA-256 `3b97e7abadd7cd2478fd77c0a382f1629aee9e2110a2abe085acb8dd76e633fe`；隔離庫108 SQL commands、schema 8及核心表計數驗證通過。
- dependency audit：`npm audit --omit=dev`回報2個high，皆為同一React Router RSC advisory；本產品未使用RSC入口，掃描阻擋引入，殘餘風險記錄於`OPERATIONS.md`，未宣稱零漏洞。

### 真實外部驗收
- Cloudflare CLI：2026-08-03 03:00以工作區Wrangler設定執行`npx wrangler whoami`，回報未登入；下一步仍為SETUP-002的瀏覽器授權。
- Cloudflare Access：等待SETUP-002/009，尚未建立真實policy與production拒絕smoke。
- YouTube：adapter、scope/state/PKCE測試完成；等待Google OAuth client及真實頻道。
- Instagram：adapter、scope/state測試完成；等待Meta App及真實專業帳號。
- Firstrade CSV：parser／D1去重完成；等待使用者遮蔽真實CSV與官方畫面抽樣。
- Web Push手機：密文、多裝置及停用契約完成；等待真實手機接收。
- Web Push電腦：密文、多裝置及停用契約完成；等待真實電腦接收。
- Resend Email：adapter、去重、retry完成；等待API key、from與本人收件。
- PWA離線：自動化五種viewport通過；等待production手機加入主畫面實測。
- 跨裝置同步：兩邏輯裝置與衝突測試通過；等待兩台實體裝置端到端核對。

### 未完成清單
不得填「無」除非所有第一批項目為`VERIFIED`。

- `INV-002`, `SOC-009`, `SOC-010`, `DDL-008`, `DDL-009`, `OFF-005`：程式與自動測試完成，等待對應真實資料／帳號／裝置。
- `SEC-001`, `SEC-002`, `SEC-003`, `SEC-004`, `SEC-005`：本機安全邊界完成，等待真實Cloudflare Access與外部通道驗收。
- `NFR-001`~`NFR-010`, `OPS-001`~`OPS-011`, `SETUP-001`~`SETUP-009`：本機可驗證部分完成；整組因免費雲端、Access、staging／production部署及實體smoke尚未執行而維持`AWAITING_USER_SETUP`。
- 唯一下一步：執行`npx wrangler login`並在Cloudflare瀏覽器頁同意授權；完成後建立獨立staging D1／Worker並回填實際URL與D1 ID。
