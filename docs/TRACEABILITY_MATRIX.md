# 使用者需求—開發要求—驗收追蹤矩陣

本表確保每一項主要需求都有對應的正式要求與驗收，不得只出現在說明文字中。

> 最新 A 整合線部署（2026-08-13）為 staging version `db41ff0c-7864-43d2-9a98-54000cebfa92`、100% active。下方 `26d3ca9b-c910-452b-b3aa-f6a8c59b9450` 僅屬 2026-08-12 N1 歷史證據；需求狀態仍以最新整合段落及 `IMPLEMENTATION_STATUS.md` 為準。

## 第一批需求ID覆蓋索引

下列索引使用完整ID（不依賴`~`範圍的隱含展開），供部署閘門與`IMPLEMENTATION_STATUS.md`交叉檢查。各ID的實作位置與驗收證據仍以本檔下方矩陣及狀態帳本的逐項紀錄為準。

| 類別 | 明確納入的第一批ID | 主要驗收範圍 |
|---|---|---|
| 產品原則 | PRD-VISION-001, PRD-VISION-002, PRD-VISION-003, PRD-VISION-004, PRD-VISION-005 | AT-CORE-01~06, AT-TASK-03~04, AT-SCOPE-01 |
| Core | CORE-001, CORE-002, CORE-003, CORE-004, CORE-005, CORE-006, CORE-007 | AT-CORE-01~06, AT-PROV-01, AT-SOC-04 |
| Tasks | TASK-001, TASK-002, TASK-003, TASK-004 | AT-TASK-01~04 |
| Finance | FIN-001, FIN-002, FIN-003, FIN-004, FIN-005, FIN-006, FIN-007, FIN-008 | AT-FIN-01~08 |
| Investments | INV-001, INV-002, INV-003, INV-004 | AT-INV-01~05, AT-SEC-04 |
| Social | SOC-001, SOC-002, SOC-003, SOC-004, SOC-005, SOC-006, SOC-007, SOC-008, SOC-009, SOC-010, SOC-011 | AT-SOC-01~09, AT-YT-01~05, AT-IG-01~05, AT-PROV-01, AT-ARCH-03 |
| Deadlines | DDL-001, DDL-002, DDL-003, DDL-004, DDL-005, DDL-006, DDL-007, DDL-008, DDL-009 | AT-DDL-01~07, AT-PUSH-01, AT-MAIL-01, AT-UI-05 |
| Offline | OFF-001, OFF-002, OFF-003, OFF-004, OFF-005, OFF-006 | AT-OFF-01~08 |
| Data | DATA-001, DATA-002, DATA-003, DATA-004 | AT-DATA-01~05 |
| Non-functional | NFR-001, NFR-002, NFR-003, NFR-004, NFR-005, NFR-006, NFR-007, NFR-008, NFR-009, NFR-010 | AT-OPS-01~02, AT-SEC-01~04, AT-UI-01~06, AT-DATA-01~05 |
| Architecture | ARCH-001, ARCH-002, ARCH-003 | AT-ARCH-01~03 |
| UI | UI-001, UI-002, UI-003, UI-004, UI-005, UI-006 | AT-UI-01~06 |
| Charts | UI-CHART-001, UI-CHART-002, UI-CHART-003, UI-CHART-004, UI-CHART-005, UI-CHART-006, UI-CHART-007, UI-CHART-008, UI-CHART-009, UI-CHART-010 | AT-CHART-01~10 |
| Security | SEC-001, SEC-002, SEC-003, SEC-004, SEC-005 | AT-SEC-01~04, AT-DATA-05 |
| Operations | OPS-001, OPS-002, OPS-003, OPS-004, OPS-005, OPS-006, OPS-007, OPS-008, OPS-009, OPS-010, OPS-011 | AT-OPS-01~02, AT-DATA-03, AT-SETUP-01 |
| Setup gates | SETUP-001, SETUP-002, SETUP-003, SETUP-004, SETUP-005, SETUP-006, SETUP-007, SETUP-008, SETUP-009 | AT-SETUP-01, live smoke tests |

規格衝突紀錄：本檔原有一列寫作`ARCH-001~008`，但`ARCHITECTURE.md`目前只定義`ARCH-001`、`ARCH-002`、`ARCH-003`。未定義的`ARCH-004~008`不列入虛構需求；原列保留供規格擁有者修正。

| 使用者需求／原意 | 需求ID | 主要實作位置 | 驗收ID |
|---|---|---|---|
| 像遊戲一樣記錄人生重要面向、能力與成果 | PRD-VISION-001, CORE-001~006, UI-001~006 | `modules/core`, `modules/metrics`, 首頁與領域頁 | AT-CORE-01~06, AT-UI-01 |
| 狀態好時留下指引，渾噩時仍知道該做什麼 | PRD-VISION-002, TASK-003, TASK-004 | 今日行動、領域／事業指引 | AT-TASK-03, AT-TASK-04 |
| 重視系統、環境、條件、積累，不只追逐結果 | PRD-VISION-003 | 指標角色、總覽分組 | AT-CORE-05 |
| 道德、健康及生活品質也是目標的一部分 | PRD-VISION-004, CORE-002 | 事業原則與策略欄位 | AT-CORE-02 |
| 每日或定期完成能產生複利的任務 | TASK-001~003 | `modules/tasks` | AT-TASK-01~03 |
| 人際、愛情與腦子面未來要能增加，但現在先不做 | DEFER-001, DEFER-002, CORE-001, CORE-006 | 通用領域與指標；無空殼正式頁 | AT-SCOPE-01 |
| 每月開銷、各收入來源、資產分布及淨值 | FIN-001~006 | `modules/finance` | AT-FIN-01~06 |
| 看離偶爾／穩定經濟自立還有多遠 | FIN-007 | 財務分析service與總覽 | AT-FIN-07 |
| 收入來源是否有上升趨勢 | FIN-003, FIN-007, FIN-008 | 財務時間序列與圖表 | AT-FIN-08 |
| 多幣別及TWD基準淨值 | FIN-001, FIN-004, FIN-005 | money與FX模型 | AT-FIN-04, AT-FIN-05 |
| 投資帳戶總值、配置與淨值 | INV-001 | 投資帳戶及快照 | AT-INV-01 |
| 導入Firstrade帳務資料 | INV-002 | `src/integrations/firstrade-csv/importer.ts`, `src/integrations/firstrade-csv/service.ts`, `src/app/pages/InvestmentImportPanel.tsx`, `src/worker/api/index.ts`；`0003_finance_investments.sql`（本輪不新增migration） | AT-INV-02～04固定答案、同檔完全相同來源列的stable key固定答案、遮蔽真實樣本D1契約；staging App預覽486列／0 parse errors／UTF-8逗號，官方Firstrade紀錄總數486並以唯讀篩選確認第39、40列兩筆來源交易；Amount合計USD 17.81、活動BUY255／SELL182／DIVIDEND7／INTEREST15／UNCLASSIFIED27、未知Other 27列原始證據保留、重跑0新增／486重複；正式staging D1 SQL／App完整JSON備份已核對bytes、檔案SHA-256與JSON checksum；修正版staging版本`7d7171c5-7be9-49c8-a28b-e7e0b2dfbe18`承接100%，未登入health 302、已登入`/finance` smoke正常、遠端migration無待套用 | `INV-002`／`SETUP-007`恢復`AWAITING_USER_SETUP`；AT-INV-05仍待正式匯入後App畫面金額合計核對，未完成前不可改為`VERIFIED` |
| 不希望不安全、常壞的Firstrade逆向API | INV-003 | provider政策與secret掃描 | AT-SEC-04 |
| W-8BEN到期與續期追蹤 | DDL-001~006 | `modules/deadlines` | AT-DDL-01~06 |
| 報稅也能設提醒 | DDL-001, DDL-007 | 期限範本 | AT-DDL-07 |
| 只要超級無敵重要與超級重要，不要普通通知 | DDL-002 | enum、UI、validation | AT-DDL-02 |
| 一個開始處理日期，全部通知齊開直到完成 | DDL-003~005, DDL-008~009 | Cron、Push、Email、站內警告 | AT-DDL-03~05, AT-PUSH-01, AT-MAIL-01 |
| 手機與電腦都能用同一批資料 | OFF-001, OFF-005 | PWA、D1同步 | AT-OFF-01, AT-OFF-05 |
| 離線輸入，恢復網路後同步 | OFF-002~006 | IndexedDB、outbox、sync API | AT-OFF-02~08 |
| 不想自己開電腦、Docker或養伺服器 | NFR-008, OPS-001 | Workers、D1、Cron | AT-OPS-01 |
| 不需要另一套帳號與登入系統 | NFR-002, SEC-001 | Cloudflare Access | AT-SEC-01 |
| 免費 | NFR-001, OPS-002 | 免費額度與成本防線 | AT-OPS-02 |
| 功能未來會增加，架構不能一改就炸 | CORE-003, ARCH-001~008 | 模組化單體、migration、provider | AT-ARCH-01~03 |
| 在軟體內增加領域、事業與想追蹤的東西 | CORE-001~006 | core、metrics、views | AT-CORE-01~06 |
| 複雜新行為仍交給Codex正式開發 | CORE-003 | 模組規則 | AT-ARCH-02 |
| 社群曝光等數據與時間關係圖 | SOC-002, SOC-004 | 社群快照與圖表 | AT-SOC-02, AT-SOC-04 |
| 在時間軸標註發新片等事件 | CORE-005, SOC-004 | 事件overlay | AT-SOC-04 |
| 比較不同風格首日曝光、轉化率、轉化數 | SOC-005~008 | comparison service | AT-SOC-05~09 |
| 成交數由自己輸入 | SOC-007 | conversions | AT-SOC-07 |
| 串接YouTube | SOC-009 | `integrations/youtube` | AT-YT-01~05 |
| 串接Instagram專業帳號 | SOC-010 | `integrations/instagram` | AT-IG-01~05 |
| 方格子、FB、Threads未來可加 | SOC-011, DEFER-003 | provider介面 | AT-ARCH-03 |
| 不要AI擅自做MVP或半成品 | AGENTS §2, STATUS規則 | CI、狀態文件、部署閘門 | AT-GATE-01~08 |
| 不要假數字、假後端、假完成 | CORE-007, SOC-008, AGENTS §6 | provenance、契約與固定答案測試 | AT-PROV-01~05, AT-GATE-02 |
| 要知道做了什麼、沒做什麼 | `IMPLEMENTATION_STATUS.md` | 狀態帳本與證據 | AT-GATE-01 |
| UI不要常見AI美學、Notion、健康App | UI-001~006, UI禁止事項 | design system與代表頁面 | AT-UI-01~06 |
| 淺色、科技、克制、硬派、明顯遊戲感但不幼稚 | UI-001~004 | tokens、layout、motion | AT-UI-01~04 |
| 今日行動最上面，其他總覽也都完整 | TASK-003, UI-005 | 首頁 | AT-UI-05 |
| 資訊有層次，不能過鬆或過緊 | UI-003, UI-006 | 總覽／分析層級 | AT-UI-03, AT-UI-06 |
| 圖表軸名、圖名、刻度、單位及設定必須齊全 | UI-CHART-001~010 | chart framework | AT-CHART-01~10 |
| 雲端設定要告訴使用者何時做、怎麼做 | SETUP-001~009 | `SETUP_CHECKLIST.md` | AT-SETUP-01 |
| 做好後直接從手機／電腦開，不再手動啟動 | OPS-001 | production deployment | AT-OPS-01 |
| 資料管理方便、能備份搬家 | DATA-001~004 | exports、D1 SQL、restore | AT-DATA-01~05 |

## R1-formal實作證據索引（2026-08-03）

| 需求群組 | 實際程式／資料位置 | 自動驗收證據 | 目前閘門 |
|---|---|---|---|
| CORE、TASK | `src/modules/areas`, `src/modules/tasks`, `src/modules/metrics`, `src/modules/events`, `src/app/pages`；`0001`, `0002` | `formula.test.ts`, `tasks-deadlines.test.ts`、七種事業關聯與任務延後Worker契約、Playwright線上／離線寫入 | `VERIFIED` |
| FIN、INV | `src/modules/finance`, `src/core/money`, `src/integrations/firstrade-csv`, `InvestmentImportPanel.tsx`, `FinancePage.tsx`；`0003` | `finance.test.ts`, `tests/unit/firstrade.test.ts`, `tests/worker/api-d1.test.ts`：預覽／七類活動／未知類型／同檔相同列stable key／D1去重與原始證據契約；遮蔽真實樣本的row count、Amount合計、活動類型與重跑結果已取得，staging App預覽與官方Firstrade紀錄亦已核對；正式staging D1 SQL／App完整JSON備份已核對bytes、檔案SHA-256與JSON checksum；修正版staging部署版本、Access邊界、登入頁面及migration唯讀smoke均已核對，仍待正式匯入後App畫面金額合計核對 | `INV-002`／`SETUP-007`為`AWAITING_USER_SETUP`；其餘`VERIFIED` |
| SOC | `src/modules/social`, `src/integrations/structured-csv`, YouTube／Instagram adapters, `src/worker/api/provider-sync.ts`, `src/worker/api/provider-raw.ts`, `src/worker/scheduled/index.ts`, `src/app/api/client.ts`, `SocialPage.tsx`, `IntegrationsPage.tsx`；`0004`, `0007`, `0009`, `0010` | 首日容許誤差、平均／總和／中位數／五數分布、轉化率、標籤／保存檢視、事件篩選／hover／click、provenance、OAuth scope/state/PKCE、60分鐘state、完整分頁、Pacific日界、token續期／官方撤銷端點、錯誤重試UI與D1 partial unique契約；provider長請求不阻塞outbox、D1 batch、stale recovery、單一job claim及pending UI鎖定固定答案；相同raw全域只存1列但兩個run各有完整有序關聯的D1固定答案；Instagram profile另以官方`/me`／`user_id` request unit與D1帳號upsert固定答案覆蓋；budget fix另以單次media清單、每輪40篇Insights、`ignored_count`及未同步／最久未同步輪替固定答案覆蓋；真實Cron、Studio 26天精確核對、Google App「實際運作中」、撤銷／重連均通過；2026-08-10新版真實MANUAL按下約1.6秒內顯示停用「同步中」並鎖定撤銷，D1 run 19秒成功、fetched 4、四類order 0～3 link各1、linked snapshot 545、語意重複0、job與財務隔離通過；Instagram兩次真實run均成功，首輪fetched 43／created 51／updated 0／ignored 10，次輪fetched 43／created 0／updated 51／ignored 10，每輪43筆raw／run link、每輪40篇內容各280筆snapshot，50篇內容、兩輪輪替與560個唯一snapshot semantic key均核對完成 | `SOC-009`與`SOC-010`均為`VERIFIED`；`AT-IG-01`～`AT-IG-05`覆蓋Access／最小scope／callback與`/me` profile、真實內容與Insights、raw／normalized／run link、冪等／無語意重複、40／10輪替及Instagram views／reach與YouTube impressions的來源定義分離；舊版本第一次完整同步觸發Free plan外部subrequest上限的錯誤保留為歷史證據，不影響新版本驗收 |
| DDL | `src/modules/deadlines`, `src/modules/notifications`, `src/integrations/resend`, `src/worker/scheduled`；`0005` | W-8固定答案、範本級別、子任務、dedupe、密文雙裝置Push契約；`tests/unit/resend.test.ts`、`tests/worker/resend-d1.test.ts`、`tests/worker/notifications-writeback-d1.test.ts`驗證Resend測試信標示、provider錯誤映射、delivery log、重試／恢復、同operation去重、Email channel摘要及Web Push逐裝置成功／410失效寫回；`GET /api/v1/push-subscriptions`與`DeadlinesPage.tsx`讀出逐裝置狀態；遠端D1已核對加密收件地址、Email `READY`、1筆正式`OPEN`期限、真實`SENT` delivery及provider message ID非空；使用者確認在垃圾郵件收到測試信；A已將shared writeback與含public VAPID client build的整合版本部署至staging 100%流量，remote migration list為空 | `DDL-008`／`SETUP-006`／`AT-PUSH-01`為`IN_PROGRESS`，仍等待可用Access session下的期限／通知GET smoke、手機／電腦實收及獨立停用；`DDL-009`／`SETUP-005`／`AT-MAIL-01`維持`VERIFIED`，本線未修改Resend adapter或重做外部驗收；其餘`VERIFIED` |
| OFF | `src/core/offline`, `src/core/sync`, `src/core/network/request-gate.ts`, `public/sw.js`, `PwaUpdate.tsx`, `src/styles.css`, `scripts/stamp-service-worker.mjs`, `DataPage.tsx`；`0006` | 27種核心輸入類型IndexedDB／outbox unit、同步中再次觸發補跑、RESTORE／DELETE tombstone、衝突三解、離線修改／封存／恢復／重開及五viewport；跨裝置真實outbox與D1聚合通過。PWA build固定答案證明同名app shell內容變更會改變SW版本；更新固定答案證明繞過HTTP cache、outbox存在時阻擋、為0才安全接管；320／390／768／1366／1920提示固定可見且手機不壓住同步列。staging outbox 0時只按一次安全更新並自動reload，新CSS固定定位且未清資料 | `OFF-001`～`OFF-006`全部`VERIFIED` |
| DATA | `src/modules/exports`, `scripts/backup-local.ps1`, `scripts/restore-drill.ps1` | schema/checksum/secret排除、CSV公式防護、`life-manager-local-20260803-002507.sql` SHA-256、schema 8與108 commands隔離還原 | `VERIFIED` |
| UI、CHART | `src/app`, `src/components/charts`, `src/styles.css` | 9個desktop正式流程，加768、1920、390、320共13個隔離D1 Playwright案例；Recharts、manifest/SW版本戳、provider pending、首頁層級、reduced-motion、無溢位、軸／刻度／單位／圖例／tooltip／來源／計算定義／事件互動；更新提示五viewport初始可見、固定層級與手機安全區固定答案，並核對staging正式CSS為fixed／z-index 30 | 圖表與`UI-001`～`UI-006`全部`VERIFIED` |
| SEC | `src/core/auth`, `src/core/crypto`, OAuth/export邊界 | Access本機限定、production缺設定拒絕、JWT格式、OAuth callback去敏、正式程式掃描；staging未授權302、本人JWT/email health 200、單一Allow政策與電腦／手機實體App通過 | staging Access已驗收；production Access與外部OAuth／通知秘密仍待設定，因此`AWAITING_USER_SETUP` |
| OPS、SETUP、NFR | `wrangler.toml`, `package.json`, `src/worker/scheduled`, `scripts`, `docs/OPERATIONS.md`, `docs/SETUP_CHECKLIST.md` | local gates、需求112 ID、保留政策D1、備份還原；staging D1 schema 10、兩個social snapshot partial unique index與per-run raw link索引存在、migration list空；PWA提示修正版部署版本14 `488a92a7-3ff1-47ec-8a04-49c8b75572a0`為100%流量、CLI exit 0；四個必要Secret名稱／型別存在、無session health 302；真實Cron、Studio、Google App長期狀態、撤銷／重連、安全更新與新版MANUAL pending UI／per-run raw追溯均成功；Instagram budget fix部署版本`2342cd82-9788-47f8-8c87-a0826003d534`、兩次真實run、raw／run link／snapshot／輪替／冪等核對均成功；migration 0010前remote SQL備份與SHA-256已核對；`0001`～`0010`隔離D1 Playwright 13/13通過 | `SETUP-002`、`SETUP-003`、`SETUP-004`均`VERIFIED`；`SETUP-004`的Meta App、最小permission、callback設定、本人帳號、關閉Webhook、兩個Secret、Access登入、最小權限同意、真實OAuth callback/profile connection及AT-IG-01～05證據完整；其他OPS／NFR／SETUP項目等待production與外部服務 |

### C線 Web Push staging evidence（2026-08-11）

`DDL-008`／`SETUP-006`／`AT-PUSH-01` 維持 `IN_PROGRESS`。Wrangler OAuth 已成功，staging 已核對 `WEB_PUSH_VAPID_PRIVATE_KEY` 與 `WEB_PUSH_VAPID_SUBJECT` 的 `secret_text` 名稱／型別；`WEB_PUSH_VAPID_PUBLIC_KEY` 已以 `plain_text` binding 部署至 100% staging 流量，且值比對一致。client build 注入、兩台實體裝置收件及共用 scheduler 每裝置狀態回寫仍待完成。未修改 migration、共用通知 orchestration、scheduler 或 deadline UI/API。

### C線責任邊界與A整合線 handoff（2026-08-12）

`VITE_VAPID_PUBLIC_KEY` 的 client build／共用 staging deployment 由 A 整合線負責：使用包含最新 A／D 內容的整合 branch，以暫時 build env 注入、保留 dashboard vars 的 `wrangler deploy --keep-vars` 發布，並回報 commit／active version／bundle scan 證據。C 線不以乾淨 master 覆蓋整合 staging；收到證據後恢復 AT-PUSH-01 的真實電腦→手機→獨立停用順序。每台裝置狀態回寫仍由 D／共用通知線處理。

### A整合線第一階段 no-deploy baseline（2026-08-12）

A線已以保留歷史的merge納入B `4f7b1cb`、C `7853ed9`、D `4bc74a8`；C只有文件／設定證據，沒有新增runtime。`SOC-010`／`SETUP-004`為`VERIFIED`，`INV-002`／`SETUP-007`為`AWAITING_USER_SETUP`，`DDL-008`／`SETUP-006`／`AT-PUSH-01`為`IN_PROGRESS`，`DDL-009`／`SETUP-005`／`AT-MAIL-01`為`VERIFIED`。本階段僅完成local gate與隔離Playwright，不部署、不跑remote migration、不執行`AT-GATE-08`；共用通知摘要與每裝置狀態回寫缺陷移交N線。

### N線 shared notification writeback 修正（2026-08-12）

由整合基準`b7f947a1be71598ef40809db8b44457a73f65b81`建立`codex/fix-notification-shared`。根因是共用`src/worker/scheduled/index.ts`及使用者測試通知只更新`notification_deliveries`，沒有在同一寫入交易同步`notification_channels`摘要與Web Push逐裝置欄位；因此不是Resend adapter或UI文字問題。新增`src/modules/notifications/persistence.ts`集中保存成功／provider error／410失效結果，`src/modules/notifications/schema.ts`提供API輸出契約，新增Push逐裝置GET並在`DeadlinesPage.tsx`顯示真實狀態；核對`0005_deadlines_notifications.sql`已有正式欄位，本線不新增migration、不修改既有migration。自動證據為Email與Push Worker-D1/API固定答案、Email缺少provider message ID unit、完整unit／lint／雙typecheck／client build；A部署後仍由C完成真人AT-PUSH-01，需求狀態不提前改為`VERIFIED`。

### A整合線第二階段 staging部署（2026-08-12；N1歷史紀錄）

A以no-ff merge commit`edc1cd25de07da237d08cd958457701d24723212`保留N commit`1e5bc687df538cc0e761b7fcb5eb646cd40cfe39`，依`wrangler deploy --config wrangler.toml --env staging --keep-vars`部署；version`26d3ca9b-c910-452b-b3aa-f6a8c59b9450`經唯讀deployment status確認100% active。`VITE_VAPID_PUBLIC_KEY`只在建置程序注入，bundle public-key presence、與C既有Worker public binding一致性及private／subject／其他secret identifier排除均以布林結果核對；既有VAPID Secret只核對名稱／型別，未讀取值。remote D1 migration list為`No migrations to apply!`。未授權GET頁面與期限／通知／Push／整合API均由Access邊界回302；本階段沒有可用Access session，因此不把登入頁當成授權API smoke，也不把`DDL-008`或`AT-PUSH-01`升級；未執行任何POST、真人Email、Push、Firstrade匯入或`AT-GATE-08`。

### C線 final acceptance 唯讀 checkpoint（2026-08-12）

最新 A 整合版本已由 C 唯讀確認為 staging 100% active，remote migration 無待套用；目前 Access session 可載入期限頁且無紅色 API／載入錯誤。使用者已準備一筆真實正式 `OPEN` 期限並完成真實電腦與手機授權／啟用及兩台收件；使用者已停用手機，D1 唯讀聚合確認手機 `DISABLED`、電腦 `ACTIVE`、兩台既有成功紀錄／錯誤 0、`WEB_PUSH=READY`、delivery `SENT` 9。`DDL-008`／`SETUP-006`／`AT-PUSH-01` 仍為 `IN_PROGRESS`；下一步只從未停用電腦做最後測試，確認手機不再收件。

### C線最後獨立性測試失敗（2026-08-12）

預期未停用電腦收到、停用手機不收到且電腦維持 `ACTIVE`；使用者實際回報電腦未收到並在 UI 看到 `DISABLED`。D1 唯讀卻顯示 computer-like=`ACTIVE` 1、mobile-like=`DISABLED` 1、`WEB_PUSH=READY`、delivery `SENT` 10／錯誤 0。此矛盾涉及 Push 狀態讀回／共用通知驗收路徑，C 線停止、不修改 shared code、不部署，移交主線後再驗收；需求仍為 `IN_PROGRESS`。

需求狀態的唯一權威仍為`IMPLEMENTATION_STATUS.md`；本索引只提供從原意到實際檔案與測試的查找路徑。

### N2 shared notification independence 修正（2026-08-13）

從A整合基準`95b60075fda3fb6afd209b19177d9363bd9c3c87`建立`codex/fix-notification-shared-2`，C `441b9d3`只作去識別驗收證據，未合併C runtime。根因分為三部分：API／UI沒有把`sync_devices.display_name`作為每台裝置的明確標籤；AES-GCM隨機IV使同 endpoint 不能直接以密文判重，且scheduler／API在取`ACTIVE`前未先按裝置挑最新列；shared writeback的channel摘要與 late provider outcome缺乏按每裝置最新狀態的穩定聚合。修正涉及`src/worker/api/index.ts`、`src/modules/notifications/schema.ts`、`src/modules/notifications/persistence.ts`、`src/modules/notifications/push.ts`、`src/worker/scheduled/index.ts`、`src/app/pages/DeadlinesPage.tsx`及直接Worker-D1/API測試；`0005`既有欄位足夠，不新增migration。固定答案覆蓋手機`DISABLED`／電腦`ACTIVE`、只送活動裝置、provider成功／失敗、同 endpoint重訂閱、改名、同timestamp排序、idempotency、空資料與缺少provider message ID；Push 2xx只標示provider accepted，不宣稱真人收件。`DDL-008`／`SETUP-006`／`AT-PUSH-01`維持`IN_PROGRESS`，等A重部署與C真人驗收。

### A整合線 N2／C final 最小安全整合與 staging 部署（2026-08-13）

- 保留歷史：N2 `724fa63b9588130b7719b92713cfaa36d83278fb` 以 merge `a8781085d33b515360455570d320f17ef8369144` 納入；C final `441b9d3c6941a6571d3660d4fce3359191ff5223` 以 merge `6362929d9f7cf782a562bee51388bf2cb93dc714` 納入，C 僅提供去識別驗收證據，沒有 runtime／migration 變更。
- `DDL-008`／`SETUP-006`／`AT-PUSH-01` 仍為 `IN_PROGRESS`：N2 固定答案已覆蓋每裝置最新狀態、停用裝置遮蔽舊列、同 endpoint 重訂閱、裝置改名、provider accepted 與 channel 聚合；C 的真人最後獨立性測試仍是未解矛盾，不能由自動測試或部署證據取代。
- A 已從既有 staging public binding 以程序環境注入 `VITE_VAPID_PUBLIC_KEY`，keyed client build 799 modules 通過；bundle 實際包含同一 public key，未發現 private／subject／其他 secret identifier，VAPID private／subject 僅核對 secret 名稱／型別，不讀取值。
- staging version `db41ff0c-7864-43d2-9a98-54000cebfa92` 唯讀確認 100% active；部署使用 `wrangler deploy --config wrangler.toml --env staging --keep-vars`，未執行或新增 migration，remote migration list 前後均為 `No migrations to apply!`。
- 整合 gate：lint、雙 typecheck、unit 15 files／52 tests、Worker/D1/API 3 files／27 tests、完整隔離 Playwright 13/13、scan 與 `git diff --check` 通過；`verify:requirements` 僅因上述兩個 Push setup 狀態仍未完成而維持非零。未授權 GET `/deadlines`、通知／Push 訂閱／整合 API 均受 Access 回 302；未觸發真人操作或 `AT-GATE-08`。
