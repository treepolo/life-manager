# 技術架構與擴充規則

## 1. 架構目標

### ARCH-001　模組化單體

使用一個Cloudflare Worker部署前端靜態資產與API，一個D1資料庫保存正式資料。程式內以模組隔離領域，不拆成多個需要獨立部署、監控及付費的服務。

### ARCH-002　新增功能以新增為主

新增領域功能時，主要新增模組、migration、API、UI及測試；不得要求財務、任務或社群模組彼此直接存取內部repository。跨模組分析透過公開service／query介面。

### ARCH-003　Provider可替換

YouTube、Instagram、Firstrade CSV、未來方格子等整合均遵循provider介面：

- `connect`／`authorize`（若適用）；
- `refreshCredentials`；
- `fetchAccounts`；
- `fetchContent`；
- `fetchMetrics`；
- `importFile`（若適用）；
- `normalize`；
- `healthCheck`；
- `disconnect`。

原始provider資料與正規化資料分離，新增provider不修改既有分析公式。

YouTube provider的正式來源定義為`youtube-data-v3+analytics-v2@2026-08-09`：上傳播放清單必須走完所有`nextPageToken`，影片明細每批最多50支；Analytics使用官方Channel basic time-based report的`dimensions=day`、`metrics=views,likes,comments`及`sort=day`，不得用未支援的`video,day`組合。來源日依YouTube定義的America/Los_Angeles 00:00–23:59轉成UTC觀測時間；每日值是來源回報的帶符號區間值而非累積快照，禁止把負值截成0。access token在到期前5分鐘以伺服器端refresh token換發並重新AES-GCM加密保存；非401 provider錯誤保留既有授權與手動重試，只有`NEEDS_REAUTH`／`EXPIRED`才要求重新授權。

Provider同步是長時間外部工作，不占用核心outbox的單一瀏覽器請求閘門；頁面在同一provider工作未結束前停用再次同步與撤銷。Worker以`provider_sync_jobs`條件式更新取得單一執行權，手動與Cron不得同時處理同一connection。正規化大量快照時先在單次run快取metric definition，再以最多100個statement的D1 batch寫入；超過10分鐘仍為`RUNNING`的中斷run會標為`FAILED/SYNC_INTERRUPTED`，job依attempt轉成`RETRY`或`DEAD_LETTER`，不得永久留在執行中或以後續Cron成功掩蓋。

原始provider回應以`provider_key + payload_kind + sha256`全域去重，`provider_sync_run_payloads`則按`sync_run_id + payload_order`保存每一次run實際取得的有序證據。即使內容未變而沿用既有`provider_raw_payloads`，每次run仍必須新增關聯；不得用raw列最初建立時的`sync_run_id`冒充之後每次同步的完整證據。

## 2. 技術堆疊

- Runtime／hosting：Cloudflare Workers與Static Assets。
- Database：Cloudflare D1。
- Access control：Cloudflare Access。
- Frontend：React、TypeScript、Vite、Tailwind CSS。
- Routing：React Router；Worker端使用小型Worker-compatible router或受控原生路由。若採第三方router，需固定版本並記錄理由。
- Server state：TanStack Query。
- Validation：Zod，前端、API與測試共用schema。
- Charts：Recharts，外加專案自建chart wrapper與設定面板。
- Local offline store：IndexedDB；可使用經評估的薄封裝，但不能把同步規則藏在不可測黑盒。
- PWA更新：自有Service Worker；正式build依app shell內容寫入版本戳，靜態資產network-first／離線cache fallback，waiting worker只可在outbox為0時由使用者明確「安全更新」接管；更新提示是高層固定介面，不能隨路由文件流落到長頁面底部，手機須避讓既有同步列與導覽。
- Test：Vitest、Cloudflare Workers test integration、Playwright。
- SQL：參數化SQL與repository；migration由Wrangler D1 migrations管理。
- Dates：使用Temporal polyfill或明確時區函式；不得以本機隱含時區處理期限。
- Money：整數minor units及明確匯率精度；可使用固定版本decimal函式庫處理匯率與比例，不直接用浮點數累積金額。
- Recurrence：正式解析RRULE或等價受測模型；UI只暴露常用排程。
- CSV：使用固定版本、支援串流／大型檔案及RFC相容的parser。

所有依賴必須固定確切版本，並驗證Cloudflare Workers相容性。

2026-08-03實作證據：`src/components/charts/MetricLineChart.tsx`是Recharts專案wrapper，統一圖名、座標軸、刻度、單位、圖例、鍵盤tooltip、事件標記與provenance面板；finance、metrics、social頁不得繞過wrapper自行建立無契約圖表。財務時間序列的`calculatedAt`與完整`AnalyticResult`由Worker產生，前端不得以目前時間或畫面資料推測替代。

## 3. 建議目錄

```text
/
├─ AGENTS.md
├─ PROJECT_GUIDE.md
├─ CODEX_START_PROMPT.md
├─ docs/
├─ migrations/
├─ public/
├─ src/
│  ├─ app/
│  │  ├─ router/
│  │  ├─ layouts/
│  │  ├─ pages/
│  │  └─ providers/
│  ├─ components/
│  │  ├─ design-system/
│  │  ├─ charts/
│  │  ├─ data-table/
│  │  └─ feedback/
│  ├─ core/
│  │  ├─ api/
│  │  ├─ auth/
│  │  ├─ database/
│  │  ├─ errors/
│  │  ├─ money/
│  │  ├─ time/
│  │  ├─ provenance/
│  │  ├─ sync/
│  │  └─ validation/
│  ├─ modules/
│  │  ├─ areas/
│  │  ├─ businesses/
│  │  ├─ tasks/
│  │  ├─ metrics/
│  │  ├─ events/
│  │  ├─ finance/
│  │  ├─ investments/
│  │  ├─ social/
│  │  ├─ deadlines/
│  │  └─ notifications/
│  ├─ integrations/
│  │  ├─ youtube/
│  │  ├─ instagram/
│  │  ├─ firstrade-csv/
│  │  └─ resend/
│  ├─ worker/
│  │  ├─ api/
│  │  ├─ scheduled/
│  │  └─ index.ts
│  └─ service-worker/
├─ tests/
│  ├─ fixtures/
│  ├─ unit/
│  ├─ database/
│  ├─ api/
│  ├─ integration/
│  └─ e2e/
└─ scripts/
   ├─ verify-requirements.ts
   ├─ scan-production-placeholders.ts
   ├─ export-backup.ts
   └─ restore-backup.ts
```

`tests/fixtures`不得被`src`引用，CI必須檢查。

## 4. API設計

- 所有API位於`/api/v1`。
- 以資源與明確分析端點組織，不建立一個萬用`/query`接受任意SQL。
- 輸入與輸出均有Zod schema。
- 每個寫入請求包含`operationId`／idempotency key。
- 讀取支援cursor pagination、日期範圍、排序及明確filter。
- 回傳錯誤格式：

```json
{
  "error": {
    "code": "SYNC_VERSION_CONFLICT",
    "message": "顯示給使用者的訊息",
    "details": {},
    "requestId": "..."
  }
}
```

- 分析回傳使用統一`AnalyticResult`：

```json
{
  "metricKey": "social.first_day_impressions",
  "formulaVersion": 1,
  "value": "2000",
  "unit": "impressions",
  "precision": 0,
  "quality": "EXACT",
  "sampleSize": 2,
  "observationCount": 8,
  "missingCount": 0,
  "excludedCount": 0,
  "window": {"kind": "POST_PUBLISH", "fromHours": 0, "toHours": 24},
  "filters": {},
  "aggregation": "MEAN",
  "sourceRefs": [],
  "calculatedAt": "..."
}
```

不得只回傳裸數字。

## 5. 模組邊界

### 5.1 Core

提供ID、時間、money、Access驗證、錯誤、transaction、audit、provenance、sync與schema。Core不得依賴領域模組。

### 5.2 Areas／Businesses

管理可自定義領域、事業、指引與關聯。不得知道社群或財務內部表結構；關聯使用通用link或模組公開API。

目前通用`entity_links`只允許BUSINESS來源，目標由各模組公開的聚合讀取端點提供並在伺服器驗證外鍵語意：收入來源、支出分類、任務、事件、指標、內容及保存檢視。UI不直接猜測或以名稱建立關聯。

### 5.3 Tasks

管理定義、排程及completion。首頁透過query service取得今日行動。

今日query從最早有效排程補產生尚未建立的發生項，保留逾期行動；延後是發生項的版本化狀態轉換，寫audit與sync change，不修改任務定義或抹除完成歷史。

### 5.4 Metrics／Events

提供通用指標、時間序列、公式與事件overlay。領域模組可註冊指標，但不得把所有領域資料硬塞進萬用metric表。

### 5.5 Finance／Investments

Finance負責帳戶、收入、支出、FX、資產快照及淨值。Investments負責券商帳戶及活動匯入；不直接計算社群分析。

### 5.6 Social

管理content assets、platform posts、snapshots、conversion、comparison及事件查詢。外部provider只負責取得與正規化資料。

### 5.7 Deadlines／Notifications

Deadlines決定哪些事項應提醒；Notifications負責in-app、Push及Email傳送與去重。不得將平台寄信邏輯寫在deadline service內。

## 6. 身分與安全

### SEC-001　Cloudflare Access

整個Worker及API由Cloudflare Access保護，不建立自有會員系統。Access policy只允許使用者本人。Worker端對Access JWT做驗證或採Cloudflare直接保護Worker的等價安全方案，並有未授權測試。

### SEC-002　OAuth秘密與token

- Google／Meta client secret及token encryption key存Cloudflare Secret。
- OAuth refresh/access token在伺服器端以AES-GCM等經審查方式加密後存D1；加密主金鑰只在Secret。
- 前端不得取得refresh token。
- token log必須遮蔽。
- OAuth state、PKCE／CSRF防護及redirect URI嚴格驗證。state為一次性且逾時即拒絕；TTL由`OAUTH_STATE_TTL_MINUTES`公開設定控制，正式環境使用60分鐘，允許私人分步授權但不形成無限期state，程式只接受10至120分鐘整數。

### SEC-003　Resend

API key存Secret。Email目的地址由伺服器設定／受保護設定管理，不接受匿名請求指定任意收件人。

### SEC-004　Push

Push subscription endpoint視為秘密資料，API需Access與CSRF防護。傳送內容只含期限名稱、重要級別及安全摘要，不含帳戶金額或稅務細節。

### SEC-005　匯入檔案

CSV在客戶端或Worker受控解析，不執行公式；匯出CSV時防止試算表公式注入。原始檔案若保存，需明確保留策略及可刪除。

## 7. 排程與背景工作

使用一個或少量Cron Triggers觸發`scheduled()`：

- 處理到期通知；
- 執行到期的社群同步工作；
- 更新token；
- 重試失敗provider工作；
- 清理過期暫存及保留範圍內的log。

Cron以UTC執行，所有使用者日期與提醒時間先轉換Asia/Taipei。D1中的`scheduled_jobs`保存`next_run_at`、狀態、attempt、backoff及dedupe key。外部API失敗不得重複建立相同快照。

社群provider工作由`provider_sync_jobs`保存相同排程語意。每次Cron先收斂逾時的`RUNNING` run/job，再以帶原狀態與到期時間條件的更新取得工作；未取得者直接略過，避免兩個Cron或手動同步重入。

## 8. 擴充規則

1. 新增「同一類內容」應由設定完成，例如新事業、新指標、新事件類型。
2. 新增「新行為」應新增正式模組／adapter，例如新API、特殊分析。
3. 不建立EAV萬用資料庫取代所有領域資料。
4. JSON只存不穩定metadata與原始provider payload；可分析核心欄位需正式schema。
5. 常用JSON欄位變重要時，以新增migration升級為正式欄位，不修改既有migration。
6. API版本不可無聲破壞；需要變更時新增版本或向後相容。
7. 每個模組可獨立停用；YouTube故障時財務及任務仍正常。
8. 首頁與導覽對模組使用registry，新增模組只需註冊，不在多處硬編碼。

### 8.1 成本防線模組

`src/modules/cost-guardrail`以版本化quota contract保存來源、品質、measurement window、provider reset、billing period與決策層級。`migrations/0011_cost_guardrails.sql`及`0012_cost_guardrail_atomic_transitions.sql`只新增append-only觀測、local ledger、reservation、breaker、alert、override及drift audit資料；reservation的reserve／commit／release由D1 trigger原子更新，排程與手動同步共用同一budget。

Provider能被應用層阻擋的工作必須先取得admission reservation；Workers inbound invocation、CPU、subrequest、Cron與Cloudflare Access／帳戶計費只能觀測、allowlist及drift audit，不能由Worker假裝硬停。未知、過期、對帳不一致或告警失敗時採fail-closed；local ledger永不宣稱是provider invoice truth。

## 9. 外部整合的完成狀態

- 程式、測試與文件完成但尚未由使用者授權：`AWAITING_USER_SETUP`。
- OAuth成功但未取得真實資料：`IMPLEMENTED_UNVERIFIED`。
- 真實資料同步、原始回應保存、正規化核對及UI顯示通過：`VERIFIED`。
- 平台政策或帳號資格造成無法進行：`EXTERNAL_BLOCKED`，必須附官方錯誤與日期。

## 10. Governance Retrofit boundary（2026-08-14）

Wave 0 只新增治理與文件索引，不改模組化單體、路由、狀態管理、migration或runtime。Control／Execution Plane、single-writer／唯一 integrator與wave dependency見 `docs/ORCHESTRATOR_PROTOCOL.md`／`docs/GOVERNANCE_RETROFIT_PLAN.md`；filesystem containment見 `docs/FILESYSTEM_POLICY.md`。

`ARCHITECTURE.md`目前正式定義的架構需求只有 `ARCH-001`～`ARCH-003`。矩陣或歷史段落出現 `ARCH-001~008`時，僅作既有規格衝突紀錄，不虛構 `ARCH-004`～`ARCH-008`，也不在本輪擴充產品架構。

下游 `REM-REL-001`／`REM-ASYNC-001`需先由單一 backend/API-data owner固定 persisted contract與transaction boundary；`REM-NAV-001`／`REM-FORM-001`的 frontend owner必須等待正式API schema，不能由UI猜測。`REM-INT-001`／`REM-REL-002`由單一 integration/cost integrator處理，保留既定provider cardinality與migration安全邊界。
