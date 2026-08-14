# 使用者需求—開發要求—驗收追蹤矩陣

本表確保每一項主要需求都有對應的正式要求與驗收，不得只出現在說明文字中。

## Current canonical truth（2026-08-14）

需求 current status 的唯一宣告來源是 `docs/IMPLEMENTATION_STATUS.md`；本矩陣只提供 Requirement→Acceptance→實作／證據的追溯。`d7bc306030bd7a1e29182fdbd921eb077249f9b0` 已 push；0011／0012 未 remote apply；成本防線未 deploy；`SOC-009`／`SOC-010`／`DDL-009`、`SETUP-003`～`SETUP-005` current 為 `EXTERNAL_BLOCKED`；`NFR-001`／`OPS-002` 為 `IN_PROGRESS`；X frozen；external quota／billing truth unknown。未受影響的既有 `VERIFIED` 不因本次 reconciliation 重做。

`SETUP-005` 舊 `VERIFIED`、舊 `AT-GATE-08 PASSED` 及 dated provider／deployment evidence 保留為 `Historical / Superseded by 2026-08-14 cost gate`，不再作 current release evidence。`ARCHITECTURE.md` 目前只定義 `ARCH-001`～`ARCH-003`；矩陣較早文字若出現 `ARCH-001~008`，只是已記錄的規格衝突，不創造 `ARCH-004`～`ARCH-008`。

## Governance retrofit traceability（Wave 0 index）

| Requirement | Acceptance family | Canonical requirement／implementation boundary | migration | Current status | Evidence／gap | Owner |
|---|---|---|---|---|---|---|
| `REM-GOV-001` | `AT-REM-GOV-001`～`006` | `AGENTS.md`、`docs/GOVERNANCE_RETROFIT_PLAN.md`、本檔、`docs/ACCEPTANCE_TESTS.md`、`docs/IMPLEMENTATION_STATUS.md` | 不需 migration | `VERIFIED` | static current/history verifier、唯一 current source與diff check通過；visual/mobile明載document-only N/A | Wave 0／final integrator |
| `REM-GOV-002` | `AT-REM-GOV-007`～`012` | `AGENTS.md`、`docs/ORCHESTRATOR_PROTOCOL.md`、`docs/GOVERNANCE_RETROFIT_PLAN.md` | 不需 migration | `IN_PROGRESS` | protocol／report／liveness／single-writer 文件；跨 worker 行為未執行 | Wave 0／final integrator |
| `REM-FS-001` | `AT-REM-FS-001`～`006` | `docs/FILESYSTEM_POLICY.md`、`docs/WORKTREE_CLEANUP_TODO.md`（歷史索引） | 不需 migration | `IN_PROGRESS` | 2026-08-14 targeted inventory、roots與cleanup checkpoint；未清理／未演練 | Wave 0／ops owner |
| `REM-REL-001` | `AT-REM-REL-001`～`006` | `src/modules/tasks/atomic-command.ts`、`src/modules/tasks/schema.ts`、`src/worker/api/index.ts`、`migrations/0013_retrofit_operation_actor.sql`、`src/app/pages/TasksPage.tsx`、`src/app/api/client.ts`、`src/core/sync/client-db.ts`、app/E2E tests | append-only `0013`；本線不新增或修改migration，不修改／不套用`0011`／`0012` | `IMPLEMENTED_UNVERIFIED` | W1A Worker-D1 atomic／rollback／replay與W1B一次POST、duplicate prevention、offline/reload recovery、desktop/mobile/narrow local browser evidence通過；真人／staging仍未驗收 | provider/staging/OAuth與remote migration不在本線 scope；後續唯一 integrator |
| `REM-ASYNC-001` | `AT-REM-ASYNC-001`～`006` | `src/modules/async-jobs/schema.ts`、`src/modules/async-jobs/service.ts`、`src/worker/api/index.ts`、`src/app/components/AsyncJobStatus.tsx`、`src/app/pages/IntegrationsPage.tsx`、app/E2E tests；重用`provider_sync_jobs`／`provider_sync_runs`／`import_batches` | append-only `0013`只為actor-bound idempotency；本線不新增或修改migration，不修改／不套用`0011`／`0012` | `IMPLEMENTED_UNVERIFIED` | W1A async-job.v1／transition／counter／history／reload／unsupported action與W1B server-truth shared UI、provider wait/reload、desktop/mobile/narrow local evidence通過；staging／真實provider仍未驗收 | provider retry/cancel action、非owner staging、YouTube／Instagram／cost sync由後續 integrator與human checkpoint處理 |
| `REM-NAV-001` | `AT-REM-NAV-001`～`006` | 後續 route／desktop/mobile/narrow UI；本輪不改產品 | 不預設 migration | `NOT_STARTED` | acceptance已定義，無visual/mobile evidence | Wave 2 frontend owner |
| `REM-FORM-001` | `AT-REM-FORM-001`～`006` | 後續 field／default／disclosure UI與API contract | 不預設 migration | `NOT_STARTED` | acceptance已定義，無form interaction evidence | Wave 2 frontend owner |
| `REM-INT-001` | `AT-REM-INT-001`～`006` | 後續 integrations lifecycle／history；不新增多帳號 | 後續評估 | `NOT_STARTED` | acceptance已定義，無provider lifecycle evidence | Wave 3 integration/cost integrator |
| `REM-TABLE-001` | `AT-REM-TABLE-001`～`006` | 後續 server query／archive／mobile table | 後續評估 | `NOT_STARTED` | acceptance已定義，無cursor／large dataset evidence | Wave 3 API＋frontend owner |
| `REM-REL-002` | `AT-REM-REL-007`～`012` | `docs/COST_GUARDRAIL_PLAN.md`、`docs/OPERATIONS.md`、`docs/SETUP_CHECKLIST.md`、d7bc306；0011／0012下游 | 不新增；0011／0012未 remote apply | `IN_PROGRESS` | current cost gate、backup／rollback與停止點；未 deploy／未帳務對帳 | integration/cost integrator＋human checkpoint |

Wave 0 acceptance 只定義可驗證案例；未執行的 semantic／interaction／visual/mobile／recovery／security／real scenario 不得寫成 `PASSED`。治理 requirement 的 visual/mobile 不適用時，案例會明載「沒有產品畫面，需由後續 UI requirement 驗收」，而非省略維度。

> **Historical / Superseded by 2026-08-14 cost gate**：下方原有 2026-08-13 A 最終整合摘要與更早段落保存歷史 evidence；其 current status 不得覆蓋上方 current canonical truth。

> **Historical / Superseded by 2026-08-14 cost gate**：A 最終整合狀態（2026-08-13）當時記錄 staging version `db41ff0c-7864-43d2-9a98-54000cebfa92` 為 100% active；`INV-002`／`SETUP-007`、`DDL-008`／`SETUP-006`／`AT-PUSH-01`已完成並為`VERIFIED`，`AT-GATE-08`當時已通過。下方 `26d3ca9b-c910-452b-b3aa-f6a8c59b9450` 與較早的未完成狀態均屬歷史證據，不是目前 gate；current status 以本檔上方 canonical truth及`IMPLEMENTATION_STATUS.md`為準。

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
| Non-functional | NFR-001, NFR-002, NFR-003, NFR-004, NFR-005, NFR-006, NFR-007, NFR-008, NFR-009, NFR-010 | AT-OPS-01~28, AT-SEC-01~04, AT-UI-01~06, AT-DATA-01~05 |
| Architecture | ARCH-001, ARCH-002, ARCH-003 | AT-ARCH-01~03 |
| UI | UI-001, UI-002, UI-003, UI-004, UI-005, UI-006 | AT-UI-01~06 |
| Charts | UI-CHART-001, UI-CHART-002, UI-CHART-003, UI-CHART-004, UI-CHART-005, UI-CHART-006, UI-CHART-007, UI-CHART-008, UI-CHART-009, UI-CHART-010 | AT-CHART-01~10 |
| Security | SEC-001, SEC-002, SEC-003, SEC-004, SEC-005 | AT-SEC-01~04, AT-DATA-05 |
| Operations | OPS-001, OPS-002, OPS-003, OPS-004, OPS-005, OPS-006, OPS-007, OPS-008, OPS-009, OPS-010, OPS-011 | AT-OPS-01~28, AT-DATA-03, AT-SETUP-01, SETUP-010 |
| Setup gates | SETUP-001, SETUP-002, SETUP-003, SETUP-004, SETUP-005, SETUP-006, SETUP-007, SETUP-008, SETUP-009, SETUP-010 | AT-SETUP-01, AT-OPS-15, live smoke tests |

## 2026-08-14 staging release safety audit（current status supersedes prior external gate）

- Migration trace：`migrations/0011_cost_guardrails.sql` 與 `migrations/0012_cost_guardrail_atomic_transitions.sql` 是新增 forward-only 檔案；`0001`～`0010` 無 diff。local fresh／upgrade／reapply、schema version 12、sentinel 保留及新欄位固定答案已通過；remote staging 只允許 pending 0011／0012，清單異常即停止。
- Cost gate trace：D1 rows／storage 與 YouTube Data 由官方 included baseline 建立 `LOCAL_CONSERVATIVE`，狀態為 `ESTIMATED`／`NOT_INVOICE_TRUTH`，採 75／85 reserve；YouTube Analytics unknown 只造成 metrics `PARTIAL`；Instagram 與 Resend 各自 unknown 時只阻擋自身 external operation；Workers／Access／Cloudflare billing 仍 `OBSERVE_ONLY`／`ACCOUNT_CONTROL_REQUIRED`。
- Current status：`SOC-009`、`SETUP-003`、`SOC-010`、`SETUP-004`、`DDL-009`、`SETUP-005` 均為 `EXTERNAL_BLOCKED`。歷史 YouTube／Instagram／Resend 真人驗收、`AT-GATE-08` 與既有 deployment evidence 保留為歷史證據，不能與目前 cost gate 可用性混稱；不重做真人 OAuth、寄信、Push 或匯入。
- Release evidence：本階段需保存 source commit、remote migration plan／apply output、staging active version 100%、bundle／secret／config scan、migration schema query、GET-only Access boundary smoke，以及 local unit／Worker-D1／API／UI synthetic results。`NFR-001`／`OPS-002` 仍 `IN_PROGRESS`，因 authoritative usage／reset／billing／hard cap／production evidence 不足，不得標 `VERIFIED`。

## 2026-08-13 最終整合與 AT-GATE-08（歷史 gate；current status 見上方）

- B `codex/accept-firstrade@300b3d71742024bb28915f6bd55d29a9110237b6` 與 C `codex/accept-web-push-final@f032a5bd60c5b6ecd8d09d38c5ec381c811bd1ec` 均已由 A 以 no-ff merge 保留歷史；兩個來源 commit 實際只變更正式文件，沒有未納入的 runtime、migration 或 secret。
- `INV-002`／`SETUP-007`／`AT-INV-05`：正式staging結果486／486／0／0、D1 USD 17.81、官方Firstrade總數486與兩筆MSTU BUY核對一致、重跑0新增／486重複，未保存未遮蔽CSV或個資。
- `DDL-008`／`SETUP-006`／`AT-PUSH-01`：手機與電腦各自收件；手機停用後為`DISABLED`，電腦維持`ACTIVE`並收件；UI／Push API／D1／delivery一致，最新delivery送至ACTIVE 1、DISABLED 0、錯誤0。
- `SOC-010`／`SETUP-004`／`AT-IG-01`～`AT-IG-05`與`DDL-009`／`SETUP-005`／`AT-MAIL-01`在當時維持`VERIFIED`；YouTube與其他既有已驗收ID當時未重做或降級。結論：歷史 `AT-GATE-08` `PASSED`，2026-08-14 cost gate 後的 current status 以上方 addendum 為準。
- B／C完成線相對已部署A runtime僅帶入正式文件與去識別證據，沒有`src/`、`public/`、設定、script或migration差異；因此 bundle unchanged，最終整合不需重部署。最終 local gate 的 lint（明確排除被保護的`backups/`）、雙typecheck、unit 15 files／52 tests、Worker/D1/API 3 files／27 tests、client build 799 modules、隔離Playwright 13/13、scan、112-ID coverage與`git diff --check`均通過；staging version維持100% active，remote migration list為`No migrations to apply!`。

## 2026-08-13 NFR-001／OPS-002 成本防線文件計畫

- 使用者提供的 Cloudflare 結帳頁是本帳戶特定第一手證據：超出包含額度的使用量按月計費，且已出現授權超額扣款的選項。這項去識別證據優先於先前「Zero Trust Free 超額不會自動扣款」的稽核結論；本矩陣不記錄付款資料、帳戶 email、末四碼或圖片路徑。
- `NFR-001`／`OPS-002` 仍為 `IN_PROGRESS`（runtime Phase 0–2 已實作；`SETUP-010` 的人工唯讀核對已完成，但帳戶 authoritative usage／reset／billing／production evidence 未完成）。Cloudflare／Resend／Google／Meta 的一般 Free 或 quota 文件只能證明官方 baseline，不能取代本帳戶 checkout authorization、plan／SKU、usage、alert 與 invoice 核對。
- 新增 runtime：`src/modules/cost-guardrail/contracts.ts`、`src/modules/cost-guardrail/service.ts`、`scripts/verify-cost-guardrail-config.mjs`、status／observation／override API、Integrations 成本狀態 UI；新增 append-only `0011_cost_guardrails.sql`／`0012_cost_guardrail_atomic_transitions.sql`，尚未套用 staging／production。
- 新增固定答案驗收：`AT-OPS-03`～`AT-OPS-28`；`SETUP-010` 已於 2026-08-14 完成一次唯讀核對並保存去識別摘要，不部署、不修改 Cloudflare 帳務／方案／付款／Secrets／vars／Access。
- 目前 contract 對 D1 rows／storage 與 YouTube Data 允許有官方 provenance 的 `LOCAL_CONSERVATIVE` baseline，但明示 `ESTIMATED`／`providerInvoiceTruth=false`；Analytics、Instagram、Resend 的 unknown 只 fail-closed 各自 cost-causing operation。scheduled／manual shared reservation、drift／UNKNOWN／breaker evidence 已覆蓋；Workers inbound、Access／Zero Trust 與帳務仍是 `OBSERVE_ONLY`／`ACCOUNT_CONTROL_REQUIRED`。外部 metric／API 失效、period/reset 不明或 billing authorization 不明時不得被當成安全。

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
| 導入Firstrade帳務資料 | INV-002 | `src/integrations/firstrade-csv/importer.ts`, `src/integrations/firstrade-csv/service.ts`, `src/app/pages/InvestmentImportPanel.tsx`, `src/worker/api/index.ts`；`0003_finance_investments.sql`（本輪不新增migration） | AT-INV-02～04固定答案、同檔完全相同來源列的stable key固定答案、遮蔽真實樣本D1契約；staging App預覽486列／0 parse errors／UTF-8逗號，正式App結果486／486／0／0；Firstrade官方紀錄總數486，唯讀篩選確認2025-04-16兩筆MSTU BUY、數量1.00及金額-5.71均一致；D1 Amount合計USD 17.81（1781 minor units）、活動BUY255／SELL182／DIVIDEND7／INTEREST15／UNCLASSIFIED27、未知Other 27列原始證據保留、重跑0新增／486重複；正式staging D1 SQL／App完整JSON備份已核對bytes、檔案SHA-256與JSON checksum；共用staging版本`db41ff0c-7864-43d2-9a98-54000cebfa92`承接100%，遠端migration無待套用 | `INV-002`／`SETUP-007`為`VERIFIED`；AT-INV-02～AT-INV-05及正式匯入證據完成，未包含自動provider或深度投資帳務 |
| 不希望不安全、常壞的Firstrade逆向API | INV-003 | provider政策與secret掃描 | AT-SEC-04 |
| W-8BEN到期與續期追蹤 | DDL-001~006 | `modules/deadlines` | AT-DDL-01~06 |
| 報稅也能設提醒 | DDL-001, DDL-007 | 期限範本 | AT-DDL-07 |
| 只要超級無敵重要與超級重要，不要普通通知 | DDL-002 | enum、UI、validation | AT-DDL-02 |
| 一個開始處理日期，全部通知齊開直到完成 | DDL-003~005, DDL-008~009 | Cron、Push、Email、站內警告 | AT-DDL-03~05, AT-PUSH-01, AT-MAIL-01 |
| 手機與電腦都能用同一批資料 | OFF-001, OFF-005 | PWA、D1同步 | AT-OFF-01, AT-OFF-05 |
| 離線輸入，恢復網路後同步 | OFF-002~006 | IndexedDB、outbox、sync API | AT-OFF-02~08 |
| 不想自己開電腦、Docker或養伺服器 | NFR-008, OPS-001 | Workers、D1、Cron | AT-OPS-01 |
| 不需要另一套帳號與登入系統 | NFR-002, SEC-001 | Cloudflare Access | AT-SEC-01 |
| 免費／成本安全 | NFR-001, OPS-002 | `docs/COST_GUARDRAIL_PLAN.md`、`docs/OPERATIONS.md`、`src/modules/cost-guardrail/*`、`migrations/0011_cost_guardrails.sql`、`migrations/0012_cost_guardrail_atomic_transitions.sql`、帳戶／方案 allowlist、平台 usage、App quota gate、恢復稽核 | AT-OPS-02～AT-OPS-28、SETUP-010 |
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
| FIN、INV | `src/modules/finance`, `src/core/money`, `src/integrations/firstrade-csv`, `InvestmentImportPanel.tsx`, `FinancePage.tsx`；`0003` | `finance.test.ts`, `tests/unit/firstrade.test.ts`, `tests/worker/api-d1.test.ts`：預覽／七類活動／未知類型／同檔相同列stable key／D1去重與原始證據契約；遮蔽真實樣本row count、Amount合計、活動類型與重跑結果已取得，正式staging App結果486／486／0／0，官方Firstrade紀錄總數486及兩筆MSTU BUY人工核對一致；正式staging D1 SQL／App完整JSON備份已核對bytes、檔案SHA-256與JSON checksum；共用staging版本、Access邊界、登入頁面及migration唯讀smoke均已核對 | `INV-002`／`SETUP-007`為`VERIFIED`；其餘既有狀態不變 |
| SOC | `src/modules/social`, `src/integrations/structured-csv`, YouTube／Instagram adapters, `src/worker/api/provider-sync.ts`, `src/worker/api/provider-raw.ts`, `src/worker/scheduled/index.ts`, `src/app/api/client.ts`, `SocialPage.tsx`, `IntegrationsPage.tsx`；`0004`, `0007`, `0009`, `0010` | 歷史固定答案與真人證據均保留；新增 cost gate 固定答案：D1／YouTube Data local baseline、YouTube Analytics partial skip、Instagram unknown fail-closed、provider gate isolation、Workers／Access observe-only；不把 40 篇／43 subrequest 當 Meta quota | 歷史 `SOC-009`／`SOC-010` 驗收證據保留，但 current `SOC-009`／`SOC-010` 為`EXTERNAL_BLOCKED`；Analytics／Instagram evidence 補齊後才可恢復目前 external gate |
| DDL | `src/modules/deadlines`, `src/modules/notifications`, `src/integrations/resend`, `src/worker/scheduled`；`0005` | W-8固定答案、dedupe、密文雙裝置Push契約與歷史 Resend delivery 證據保留；新增 Resend unknown isolation／fail-closed cost gate，站內／Push 不因 Resend unknown 被牽連；本輪不重做真人寄信 | `DDL-008`／`SETUP-006`／`AT-PUSH-01`維持`VERIFIED`；current `DDL-009`／`SETUP-005`／`AT-MAIL-01`為`EXTERNAL_BLOCKED`，待 Resend account／quota／reset evidence |
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

歷史 checkpoint（2026-08-12；C final前）：最新 A 整合版本已由 C 唯讀確認為 staging 100% active，remote migration 無待套用；當時 Access session 可載入期限頁且無紅色 API／載入錯誤，手機已停用、電腦為`ACTIVE`，下一步是最後獨立性測試。其後的失敗重現與N2修正、C final完成證據見下方；當時的`IN_PROGRESS`不是目前狀態。

### C線最後獨立性測試失敗（2026-08-12）

預期未停用電腦收到、停用手機不收到且電腦維持 `ACTIVE`；使用者實際回報電腦未收到並在 UI 看到 `DISABLED`。D1 唯讀卻顯示 computer-like=`ACTIVE` 1、mobile-like=`DISABLED` 1、`WEB_PUSH=READY`、delivery `SENT` 10／錯誤 0。此矛盾涉及 Push 狀態讀回／共用通知驗收路徑，C 線停止、不修改 shared code、不部署，移交主線後再驗收；需求仍為 `IN_PROGRESS`。

### C線 Web Push final acceptance（2026-08-13；C線自身驗收紀錄）

A/N2整合commit `007768fae8f56893072cc056a007766cac462595` 的 staging version `db41ff0c-7864-43d2-9a98-54000cebfa92` 經唯讀確認100% active，remote migration為`No migrations to apply!`。使用者在真實電腦完成client安全更新；Service Worker build stamp為`774d9ed6db971987`且placeholder不存在。正式`OPEN`期限、Access期限頁、Web Push `READY`與兩台逐裝置狀態均可讀回。

真人固定答案全部通過：手機與電腦是兩台不同真實裝置，各有1筆獨立訂閱與成功紀錄；手機停用後，未停用電腦仍為`ACTIVE`並收到唯一一次最後測試，手機未收到。最後一次去識別D1聚合為computer `ACTIVE` 1／mobile `DISABLED` 1，各有last success、錯誤0；通道`WEB_PUSH`為enabled／`READY`且有成功紀錄、錯誤0；最新delivery為`SENT` 1、to active 1、to disabled 0、錯誤0，查詢`rows_written=0`。`DDL-008`、`SETUP-006`、`AT-PUSH-01`標為`VERIFIED`；C線自身不執行`AT-GATE-08`，A最終整合線其後在所有外部驗收完成後執行並通過。

需求狀態的唯一權威仍為`IMPLEMENTATION_STATUS.md`；本索引只提供從原意到實際檔案與測試的查找路徑。

### N2 shared notification independence 修正（2026-08-13）

從A整合基準`95b60075fda3fb6afd209b19177d9363bd9c3c87`建立`codex/fix-notification-shared-2`，C `441b9d3`只作去識別驗收證據，未合併C runtime。根因分為三部分：API／UI沒有把`sync_devices.display_name`作為每台裝置的明確標籤；AES-GCM隨機IV使同 endpoint 不能直接以密文判重，且scheduler／API在取`ACTIVE`前未先按裝置挑最新列；shared writeback的channel摘要與 late provider outcome缺乏按每裝置最新狀態的穩定聚合。修正涉及`src/worker/api/index.ts`、`src/modules/notifications/schema.ts`、`src/modules/notifications/persistence.ts`、`src/modules/notifications/push.ts`、`src/worker/scheduled/index.ts`、`src/app/pages/DeadlinesPage.tsx`及直接Worker-D1/API測試；`0005`既有欄位足夠，不新增migration。固定答案覆蓋手機`DISABLED`／電腦`ACTIVE`、只送活動裝置、provider成功／失敗、同 endpoint重訂閱、改名、同timestamp排序、idempotency、空資料與缺少provider message ID；Push 2xx只標示provider accepted，不宣稱真人收件。`DDL-008`／`SETUP-006`／`AT-PUSH-01`維持`IN_PROGRESS`，等A重部署與C真人驗收。

### A整合線 N2／C final 最小安全整合與 staging 部署（2026-08-13；C final前歷史紀錄）

- 保留歷史：N2 `724fa63b9588130b7719b92713cfaa36d83278fb` 以 merge `a8781085d33b515360455570d320f17ef8369144` 納入；C final `441b9d3c6941a6571d3660d4fce3359191ff5223` 以 merge `6362929d9f7cf782a562bee51388bf2cb93dc714` 納入，C 僅提供去識別驗收證據，沒有 runtime／migration 變更。
- 當時 `DDL-008`／`SETUP-006`／`AT-PUSH-01` 仍為 `IN_PROGRESS`：N2 固定答案已覆蓋每裝置最新狀態、停用裝置遮蔽舊列、同 endpoint 重訂閱、裝置改名、provider accepted 與 channel 聚合；C 的真人最後獨立性測試仍是未解矛盾，不能由自動測試或部署證據取代。此為 C final 前歷史狀態，目前已由上方 final matrix 取代。
- A 已從既有 staging public binding 以程序環境注入 `VITE_VAPID_PUBLIC_KEY`，keyed client build 799 modules 通過；bundle 實際包含同一 public key，未發現 private／subject／其他 secret identifier，VAPID private／subject 僅核對 secret 名稱／型別，不讀取值。
- staging version `db41ff0c-7864-43d2-9a98-54000cebfa92` 唯讀確認 100% active；部署使用 `wrangler deploy --config wrangler.toml --env staging --keep-vars`，未執行或新增 migration，remote migration list 前後均為 `No migrations to apply!`。
- 當時整合 gate：lint、雙 typecheck、unit 15 files／52 tests、Worker/D1/API 3 files／27 tests、完整隔離 Playwright 13/13、scan 與 `git diff --check` 通過；`verify:requirements` 的非零只因上述兩個 Push setup 尚未完成。未授權 GET `/deadlines`、通知／Push 訂閱／整合 API 均受 Access 回 302；當時未觸發真人操作或 `AT-GATE-08`。最終 coverage 與 `AT-GATE-08` 結果見本檔最上方 final section。
## RETROFIT-W1A-INTEGRITY-ASYNC execution evidence（2026-08-14）

本節只記錄本線 backend／API／data scope；current status仍唯一由`docs/IMPLEMENTATION_STATUS.md`宣告。branch為`codex/accept-external-integrations`，起始與完成前基線均以`git status --short`核對；本線未建立worktree、未switch/reset、未讀取secret、未執行OAuth／provider external call／remote D1／deploy。

本線補充的版本界線：canonical local migration chain已經由`0013_retrofit_operation_actor.sql`前進到schema version 13；上述較早的schema 12／0011／0012敘述屬既有 release safety audit history。Wave 1A只驗證fresh chain、schema sentinel與migration ledger reapply／record preservation；pre-0013既有資料快照的獨立upgrade案例及remote/staging apply維持`NOT_RUN`。

### REM-REL-001

- Contract：`POST /api/v1/tasks/with-initial-schedule`；input/output為`src/modules/tasks/schema.ts`的`taskWithInitialScheduleInputSchema`／`taskWithInitialScheduleOutputSchema`；server implementation為`src/modules/tasks/atomic-command.ts`。`migrations/0013_retrofit_operation_actor.sql`只新增`api_idempotency.actor_id`及index，保留既有`0011`／`0012`不變。
- Transaction：task、optional schedule、兩筆必要稽核（含`actor_id`／`request_id`）、actor-bound idempotency與兩個sync snapshots在同一D1 batch；reference、schedule relation、date range在寫入前驗證；D1 statement failure以batch rollback，不使用UI compensating delete。
- Fixed-answer evidence：`tests/worker/retrofit-w1a.test.ts`涵蓋 task only、task+schedule linked、invalid schedule zero/zero、injected second-write rollback、same-key/same-payload replay、same-key/different-payload conflict、cross-actor conflict/no leak。既有`tasks`與`task-schedules` CRUD／offline sync未刪除；TasksPage未修改。
- W1B actual：AT-REM-REL-003在desktop、mobile-390、narrow-320的local TasksPage recovery UI通過；AT-REM-REL-006以隔離browser route abort／reload／同operation recovery核對最終一個task與一個WEEKLY schedule通過。offline fallback以unit固定答案核對同一IndexedDB transaction寫入task與schedule resource outbox；這仍是既有resource-level sync，不冒充server atomic offline protocol。真實使用者／staging scenario維持`NOT_RUN`。
- Full-suite runtime evidence（`RETROFIT-W1B-E2E-DIAG`）：Wrangler `4.118.0`的正式`npm run test:e2e`最終exit 0，13個runner case（9 desktop＋tablet-768＋large-desktop＋mobile-390＋mobile-320）在既有runtime-crash retry後均PASS；一次重現中Wrangler/workerd已退出且4173 listener不存在，Playwright後續才在`tests/e2e/app.spec.ts:9`等待`/api/v1/sync/devices`達120秒，故該timeout記為server-death downstream symptom，不是已觀察到的120秒API handler。此local evidence不升級requirement為`VERIFIED`。

### REM-ASYNC-001

- Contract：`src/modules/async-jobs/schema.ts`定義`async-job.v1`、status／phase enum、transition map、counter invariant、progress、capabilities、error、history與provenance；`src/modules/async-jobs/service.ts`只讀既有persisted資料。API為`GET /api/v1/async-jobs`與`GET /api/v1/async-jobs/:id`，list cursor固定為`updated_at DESC,id DESC`，cursor version不符回`ASYNC_CURSOR_STALE`，不存在回`NOT_FOUND`。
- Capability matrix：provider manual/scheduled sync＝persisted job＋run、phase為來源status映射、source counters／retry/dead-letter/stale recovery／history可讀、background continuation=true、retry/cancel action=false；CSV import＝persisted`import_batches`＋真實row counters、reload read=true、history/retry/cancel=false；export＝`export_history`只記短同步完成紀錄，restore＝request內同步且有idempotency/audit，兩者不分類為async job，未造假progress。
- Fixed-answer evidence：同一Worker-D1測試涵蓋合法／非法status transition、provider `RETRY_WAIT`／`PARTIAL` counters與history、reload後讀到D1新狀態、dead-letter、無total不產生percentage、stable cursor與stale cursor、import `2+1+1=4` row partition、not-found/no-leak與unsupported cancel/retry flags。既有provider cost admission／external adapter／scheduler transition code未改。
- W1B actual：AT-REM-ASYNC-003在desktop、mobile-390、narrow-320的local provider fixture通過，包含persisted phase、last update、attempt、source counters、history、provenance、reload與無percentage／ETA；`retrySupported=false`／`cancelSupported=false`時沒有retry/cancel按鈕。AT-REM-ASYNC-005的staging非owner Access與AT-REM-ASYNC-006真實YouTube／Instagram／cost sync仍`NOT_RUN`。
- Full-suite runtime evidence（`RETROFIT-W1B-E2E-DIAG`）：同一fresh-local-D1 runner的最終結果為exit 0；首次runtime death與下游`/api/v1/sync/devices`等待已由process／port evidence分離，沒有修改產品、async contract、runner timeout或migration。staging Access、真實provider與cost sync仍`NOT_RUN`，不把full-suite local PASS當作外部驗收。

## RETROFIT-W1B-SHARED-UI execution evidence（2026-08-14）

本節只記錄本線 client/UI/interaction/browser scope；current status仍唯一由`docs/IMPLEMENTATION_STATUS.md`宣告。branch為`codex/accept-external-integrations`；本線未建立worktree、未執行OAuth／provider external call／remote D1／deploy，且未新增或修改migration。

### REM-REL-001

- UI contract consumption：`TasksPage`以`createTaskWithInitialSchedule`對既有`POST /api/v1/tasks/with-initial-schedule`一次提交task與optional schedule；不再以兩個POST形成partial task。成功後只接受server response作為success；TypeError時保留同一operationId供reload recovery；offline時以既有IndexedDB resource outbox保留輸入。
- Fixed-answer／unit：`tests/unit/tasks-page.test.tsx`驗證double click只呼叫一次且payload含task與schedule；`tests/unit/offline-sync.test.ts`驗證task與schedule同一IndexedDB transaction寫入兩個pending entities/outbox。
- Browser：`tests/e2e/app.spec.ts`的atomic recovery案例以隔離local route abort第一個request，reload後以同operationId重新提交，核對request count=2、最終一個task與一個WEEKLY schedule；desktop、mobile-390、mobile-320均通過。這是local synthetic browser evidence，不是staging／真人scenario。

### REM-ASYNC-001

- UI contract consumption：`src/app/components/AsyncJobStatus.tsx`只讀`GET /api/v1/async-jobs`回傳的`async-job.v1`，顯示server status／phase、timestamps、counters、sourceCounters、history、error、capabilities與provenance；不同量綱或`progress=null`不產生percentage／ETA。`IntegrationsPage`將provider manual sync等待、reload與4秒poll接到同一truth。
- Fixed-answer／unit：`tests/unit/async-job-status.test.tsx`驗證`RETRY_WAIT`、source counters、history、provenance、empty state與unsupported retry/cancel flags；`tests/unit/integrations-page-pending.test.tsx`保留manual long-request duplicate prevention。
- Browser：同一provider fixture的async-job persisted truth／reload案例在desktop、mobile-390、mobile-320通過，且核對窄版無水平溢出、不顯示假百分比／ETA、不渲染不存在的retry action。staging Access、真實provider與cost sync仍`NOT_RUN`。
