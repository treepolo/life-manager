# 人生管理器專案指導文件

## 0. 本文件包的用途

這個文件包是本專案的長期開發依據，供使用者、Codex ChatGPT work及後續接手的開發代理共同使用。它不是腦力激盪稿，也不是可任意縮減的願望清單。第一批正式版本所納入的需求，必須以可保留到最終系統的正式架構完整實作；尚未納入的需求必須明確列為延後，不得在正式介面放置空殼、假資料、寫死數字或無後端支援的展示元件。

本專案的核心不是普通待辦清單、習慣追蹤器或健康App，而是用於長期管理人生重要面向、可控行動、系統條件、能力與成果的單人資料與行動系統。它需要在使用者頭腦清楚時保存方向與指引，並在使用者渾噩、忘記該做什麼時，仍能讓使用者依照既定方向繼續前進。

本軟體由AI協助開發，但軟體本身不需要串接生成式AI，也不得把「加入AI功能」當成預設方向。

## 1. 文件結構與權威順序

1. `AGENTS.md`：所有Codex工作回合必須先讀的強制規則。
2. `docs/PRODUCT_REQUIREMENTS.md`：產品目的、完整需求、第一批正式版本範圍與延後範圍。
3. `docs/TRACEABILITY_MATRIX.md`：每一項使用者需求對應到開發要求、資料結構與驗收證據。
4. `docs/ARCHITECTURE.md`：技術架構、模組邊界、擴充規則與安全設計。
5. `docs/DATA_AND_SYNC.md`：資料模型、離線資料、同步、衝突、公式、匯入與備份。
6. `docs/UI_DESIGN.md`：視覺語言、資訊層級、首頁、圖表與禁止事項。
7. `docs/ACCEPTANCE_TESTS.md`：需求級驗收案例、固定答案測試、整合測試與部署閘門。
8. `docs/IMPLEMENTATION_STATUS.md`：唯一可宣稱實作狀態的帳本。
9. `docs/OPERATIONS.md`：環境、部署、排程、備份、還原與維護。
10. `docs/SETUP_CHECKLIST.md`：需要使用者登入或授權外部平台時的逐步操作。
11. `docs/REFERENCES.md`：官方技術文件與查核日期。
12. `CODEX_START_PROMPT.md`：使用者可直接交給Codex ChatGPT work的啟動題詞。

若文件互相衝突，應先停止衝突部分的實作，記錄衝突位置，並以使用者最新明確決定為最高依據。不得自行挑選最容易做的版本。

### 1.1 Governance Retrofit canonical index

2026-08-14 起，Wave 0–5 的 requirement／dependency／owner／human checkpoint 索引唯一放在 `docs/GOVERNANCE_RETROFIT_PLAN.md`；Control Plane／Execution Plane、dispatch-and-yield、worker report、project liveness、single-writer 與唯一 integrator 規則見 `docs/ORCHESTRATOR_PROTOCOL.md`；filesystem boundary、retention 與 cleanup checkpoint 見 `docs/FILESYSTEM_POLICY.md`。這些是 Layer 1／Layer 2 的 repo delta，不複製外部治理來源。功能 current status 仍唯一以 `docs/IMPLEMENTATION_STATUS.md` 為準；`TRACEABILITY_MATRIX.md` 與 `ACCEPTANCE_TESTS.md` 提供鏈接與案例，不各自宣稱 current。

目前 current truth 為 d7bc306 已 push、0011／0012 尚未 remote apply、成本防線尚未 deploy、受影響外部整合為 `EXTERNAL_BLOCKED`、NFR-001／OPS-002 為 `IN_PROGRESS`；舊 deployment／provider／AT-GATE-08 evidence 必須明示 Historical／Superseded by 2026-08-14 cost gate。Wave 0 不修改產品程式、不執行 migration、deploy、OAuth、同步或 cleanup。

## 2. 已確認的固定決策

- 部署：Cloudflare Workers承載前端靜態資產與後端API，D1保存雲端資料。
- 存取保護：Cloudflare Access保護整個私人應用程式；不建立註冊、會員、忘記密碼等自有帳號系統。
- 客戶端：React、TypeScript、Vite、Tailwind CSS、React Router、TanStack Query、Zod、Recharts。
- 測試：Vitest與Playwright；資料庫及Worker測試使用Cloudflare本機環境。
- 資料庫存取：受控、參數化SQL與repository層，不採用重量級ORM。
- 形式：PWA，手機與電腦皆可使用、安裝到主畫面並共用D1資料。
- 離線：支援離線開啟、離線輸入、待同步狀態、恢復網路後同步；不能把Background Sync當成唯一機制。
- 第一批正式版本：基礎平台、每日／定期任務、財務、社群分析、YouTube、Instagram、Firstrade CSV、期限提醒、Web Push、電子郵件與有限自定義。
- 第一批不做：人際關係正式模組、腦子面正式模組、Facebook／Threads／方格子API、Firstrade逆向登入API、逐筆投資成本與損益系統、YouTube收益資料、軟體內生成式AI。
- 多幣別：保存原幣，基準幣別為新台幣；金錢運算不得直接依賴浮點數。
- 投資：第一批記錄帳戶／資產總值、配置、淨值與Firstrade帳務活動；不建立稅務批次、成本基礎及自行推導的逐筆已實現／未實現損益系統。
- YouTube：第一批串接，使用非收益唯讀權限。
- Instagram：第一批串接，帳號為專業帳號，優先使用Instagram Login。
- 自定義邊界：內容、分類與簡單指標可由使用者新增；新API、新資料行為、複雜公式及全新工作流程由Codex正式開發。
- 自定義公式：支援安全的加減乘除、括號及既有指標引用，不允許任意JavaScript或`eval`。
- 期限提醒：只保留「超級無敵重要」及「超級重要」兩級；不建立普通提醒。
- W-8BEN及報稅：固定屬於「超級無敵重要」。
- 每項重要期限只有一個「開始可以／必須處理日期」作為提醒啟動點；啟動後站內、Web Push與電子郵件一起持續提醒，直到使用者回報完成。
- 通知：第一批同時實作PWA Web Push與Resend電子郵件。
- Firstrade：第一批採完整CSV匯入、手動帳戶資料與未來provider介面；不得儲存Firstrade帳密或使用逆向登入套件。
- UI：淺色優先，明顯遊戲介面感但不幼稚，兼具科技感、克制感與部分硬派／粗獷特徵；不得套用常見AI SaaS、Notion、健康App或習慣養成App美學。
- 首頁：今日行動置頂，其下仍完整提供重要期限、整體狀態、人生領域／事業及資料總覽。
- 圖表：必須具備完整名稱、軸名、單位、刻度、圖例、資料定義、時間窗、樣本數、篩選條件及調整設定。

## 3. 開發方法

本專案採「模組化單體」，不是多服務架構。所有正式功能位於同一個Worker應用與同一個D1資料庫，但每個領域有清楚模組邊界、repository、service、validation、API、UI及測試。新增領域時應以新增模組為主，不得為了小功能重寫既有模組。

第一批正式版本不是MVP。可以分工作批次施工，但每個已納入功能必須完成整條垂直切片：輸入、驗證、保存、修改、刪除／封存、查詢、統計、顯示、匯出、離線同步、錯誤處理及驗收。外部平台需要使用者授權時，Codex應完成程式與自動測試，將狀態標為「等待真實授權驗收」，並依`SETUP_CHECKLIST.md`引導使用者，不得冒充已完成。

## 4. 最終完成的最低條件

只有同時符合下列條件，第一批正式版本才能宣稱完成：

- `IMPLEMENTATION_STATUS.md`內所有第一批需求均為`VERIFIED`，或明確為`EXTERNAL_BLOCKED`且阻擋原因完全由尚未提供的外部帳號／檔案造成。
- 每項需求均能在`TRACEABILITY_MATRIX.md`找到程式位置與驗收測試。
- 沒有被跳過的測試、`TODO`、`FIXME`、`NotImplemented`、正式程式引用fixtures、假數字或不透明fallback。
- 所有統計結果皆可追溯到原始資料、公式版本、時間窗、篩選條件及樣本數。
- 本機全新資料庫可完整套用migration；既有資料庫可增量升級。
- PWA可在離線狀態建立／修改資料，恢復網路後同步，並在另一台裝置看到結果。
- YouTube與Instagram串接在真實帳號完成一次授權、同步及資料驗證。
- Firstrade匯入使用真實或經遮蔽的實際CSV完成去重與核對。
- Web Push與電子郵件均完成真實裝置／信箱測試。
- Cloudflare Access只允許使用者本人進入。
- 正式環境沒有示範資料，空資料狀態明確顯示無資料。
- 使用者能匯出完整JSON、各模組CSV及D1 SQL備份，並完成一次還原演練。
