# 使用者需求—開發要求—驗收追蹤矩陣

本表確保每一項主要需求都有對應的正式要求與驗收，不得只出現在說明文字中。

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
| 導入Firstrade帳務資料 | INV-002 | `integrations/firstrade-csv` | AT-INV-02~05 |
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
| FIN、INV | `src/modules/finance`, `src/core/money`, `src/integrations/firstrade-csv`, `FinancePage.tsx`；`0003` | `finance.test.ts`, `firstrade.test.ts`、D1篩選／匯率／淨值／去重／完整provenance契約，以及資料更新後圖表點數與路徑改變E2E | `INV-002`等待真實遮蔽CSV；其餘`VERIFIED` |
| SOC | `src/modules/social`, `src/integrations/structured-csv`, YouTube／Instagram adapters, `src/worker/api/provider-sync.ts`, `src/worker/api/provider-raw.ts`, `src/worker/scheduled/index.ts`, `src/app/api/client.ts`, `SocialPage.tsx`, `IntegrationsPage.tsx`；`0004`, `0007`, `0009`, `0010` | 首日容許誤差、平均／總和／中位數／五數分布、轉化率、標籤／保存檢視、事件篩選／hover／click、provenance、OAuth scope/state/PKCE、60分鐘state、完整分頁、Pacific日界、token續期／官方撤銷端點、錯誤重試UI與D1 partial unique契約；provider長請求不阻塞outbox、D1 batch、stale recovery、單一job claim及pending UI鎖定固定答案；相同raw全域只存1列但兩個run各有完整有序關聯的D1固定答案；真實Cron、Studio 26天精確核對、Google App「實際運作中」、撤銷／重連均通過；2026-08-10新版真實MANUAL按下約1.6秒內顯示「同步中」並鎖定撤銷，D1 run 19秒成功、fetched 4、四類order 0～3 link各1、linked snapshot 545、語意重複0、job與財務隔離通過 | `SOC-009`已完成真實OAuth、撤銷／排程錯誤隔離／重連、refresh、MANUAL pending UI與per-run raw追溯，為`VERIFIED`；`SOC-010`等待真實授權；其餘維持既有狀態 |
| DDL | `src/modules/deadlines`, `src/modules/notifications`, `src/integrations/resend`, `src/worker/scheduled`；`0005` | W-8固定答案、範本級別、子任務、dedupe、密文雙裝置Push契約；`tests/unit/resend.test.ts`、`tests/worker/resend-d1.test.ts`驗證Resend測試信標示、provider錯誤映射、delivery log、重試與去重；遠端D1已核對加密收件地址與Email `READY`，仍待真實收件證據 | `DDL-008`等待真實裝置；`DDL-009`／`SETUP-005`為`IN_PROGRESS`，Resend帳號已確認建立，`RESEND_API_KEY`／`RESEND_FROM`均核對為`secret_text`，收件設定已保存，仍待本人收件與真實寄送；`AT-MAIL-01`尚未通過；其餘`VERIFIED` |
| OFF | `src/core/offline`, `src/core/sync`, `src/core/network/request-gate.ts`, `public/sw.js`, `PwaUpdate.tsx`, `src/styles.css`, `scripts/stamp-service-worker.mjs`, `DataPage.tsx`；`0006` | 27種核心輸入類型IndexedDB／outbox unit、同步中再次觸發補跑、RESTORE／DELETE tombstone、衝突三解、離線修改／封存／恢復／重開及五viewport；跨裝置真實outbox與D1聚合通過。PWA build固定答案證明同名app shell內容變更會改變SW版本；更新固定答案證明繞過HTTP cache、outbox存在時阻擋、為0才安全接管；320／390／768／1366／1920提示固定可見且手機不壓住同步列。staging outbox 0時只按一次安全更新並自動reload，新CSS固定定位且未清資料 | `OFF-001`～`OFF-006`全部`VERIFIED` |
| DATA | `src/modules/exports`, `scripts/backup-local.ps1`, `scripts/restore-drill.ps1` | schema/checksum/secret排除、CSV公式防護、`life-manager-local-20260803-002507.sql` SHA-256、schema 8與108 commands隔離還原 | `VERIFIED` |
| UI、CHART | `src/app`, `src/components/charts`, `src/styles.css` | 9個desktop正式流程，加768、1920、390、320共13個隔離D1 Playwright案例；Recharts、manifest/SW版本戳、provider pending、首頁層級、reduced-motion、無溢位、軸／刻度／單位／圖例／tooltip／來源／計算定義／事件互動；更新提示五viewport初始可見、固定層級與手機安全區固定答案，並核對staging正式CSS為fixed／z-index 30 | 圖表與`UI-001`～`UI-006`全部`VERIFIED` |
| SEC | `src/core/auth`, `src/core/crypto`, OAuth/export邊界 | Access本機限定、production缺設定拒絕、JWT格式、OAuth callback去敏、正式程式掃描；staging未授權302、本人JWT/email health 200、單一Allow政策與電腦／手機實體App通過 | staging Access已驗收；production Access與外部OAuth／通知秘密仍待設定，因此`AWAITING_USER_SETUP` |
| OPS、SETUP、NFR | `wrangler.toml`, `package.json`, `src/worker/scheduled`, `scripts`, `docs/OPERATIONS.md`, `docs/SETUP_CHECKLIST.md` | local gates、需求112 ID、保留政策D1、備份還原；staging D1 schema 10、兩個social snapshot partial unique index與per-run raw link索引存在、migration list空；PWA提示修正版部署版本14 `488a92a7-3ff1-47ec-8a04-49c8b75572a0`為100%流量、CLI exit 0；四個必要Secret名稱／型別存在、無session health 302；真實Cron、Studio、Google App長期狀態、撤銷／重連、安全更新與新版MANUAL pending UI／per-run raw追溯均成功；migration 0010前remote SQL備份與SHA-256已核對；`0001`～`0010`隔離D1 Playwright 13/13通過 | `SETUP-002`、`SETUP-003`已`VERIFIED`；其他OPS／NFR／SETUP項目仍等待production與外部服務 |

需求狀態的唯一權威仍為`IMPLEMENTATION_STATUS.md`；本索引只提供從原意到實際檔案與測試的查找路徑。
