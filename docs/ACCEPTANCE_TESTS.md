# 驗收測試與部署閘門

## 1. 測試原則

- 每個需求ID至少對應一項自動或真實整合驗收。
- 統計使用固定輸入與唯一可人工計算的預期答案。
- 測試需從D1寫入／匯入開始，經service、API到UI；不能只測前端格式化函式。
- 正式外部API需另有live smoke test，不能只靠mock。
- 外部token或使用者檔案尚未提供時，狀態為`AWAITING_USER_SETUP`，不可`VERIFIED`。
- 所有測試skip、todo及only均使部署閘門失敗。

## 2. Core與自定義

### AT-CORE-01　領域與事業CRUD

建立「經濟」領域及「棒球事業」，編輯策略與不知道做什麼時指引，排序、封存及恢復；重新載入與另一裝置同步後一致。

### AT-CORE-02　原則與指引

保存含多行文字的理由、原則、策略、下一步；首頁與事業頁能正確顯示，不被截斷或當成HTML執行。

### AT-CORE-03　自定義指標

建立「訂閱人數」原始指標並輸入三個日期值；時間序列排序正確，單位與角色顯示。

### AT-CORE-04　公式

建立`成交數 / 曝光數 * 100`，輸入成交20、曝光1000，結果為2%，分子、分母及公式版本可展開；曝光0時顯示不可計算而不是Infinity或0%。

### AT-CORE-05　角色分類

同時建立ACTION、SYSTEM、CAPABILITY及OUTCOME指標，總覽分組正確，不用單一分數混合。

### AT-CORE-06　新增內容不改程式

由UI新增新領域、新事業、新標籤、新事件類型及新指標，不需重新部署。

### AT-SCOPE-01　延後模組不做空殼

正式導航沒有「人際關係」或「腦子面」空頁；通用領域仍能建立同名自訂領域，但不出現擅自設計的關係分數或智力評分。

## 3. 任務

### AT-TASK-01　週期

驗證每日、指定星期、每月及自訂週期產生正確occurrence；跨月、閏日及Asia/Taipei換日正確。

### AT-TASK-02　完成歷史

完成同一週期任務三次形成三筆completion；修改排程不刪除歷史。

### AT-TASK-03　今日行動

今天到期、逾期、釘選下一步依規則出現在首頁最上方；完成後立即移入完成狀態。

### AT-TASK-04　離線任務

離線完成任務，重開App仍保留；上線同步後另一裝置出現completion且只一筆。

## 4. 財務

固定測試資料：

| 月份 | 棒球實體課收入 | 線上分析收入 | 開銷 |
|---|---:|---:|---:|
| 1月 | 10,000 | 2,000 | 22,000 |
| 2月 | 18,000 | 4,000 | 22,000 |
| 3月 | 24,000 | 8,000 | 23,000 |

### AT-FIN-01　月總額

1月收入12,000、淨現金流-10,000；3月收入32,000、淨現金流9,000。

### AT-FIN-02　覆蓋率

以實際開銷為基準，1月54.545...%、2月100%、3月139.130...%；UI依設定精度顯示並保留精確計算依據。

### AT-FIN-03　收入來源趨勢

圖表分開顯示兩收入來源，完整軸名、TWD單位、月份刻度及圖例。關閉其中一系列不改變原始資料。

### AT-FIN-04　多幣別

輸入USD 1,000帳戶快照及USD/TWD 32.5，TWD值32,500；修改匯率建立新證據，不覆蓋原幣值。

### AT-FIN-05　缺失匯率

沒有匯率時顯示「缺少USD/TWD匯率」，不得以1或0換算。

### AT-FIN-06　淨值

現金TWD 20,000、美元帳戶TWD換算32,500、負債5,000，淨值47,500；資產配置分母不含負債但淨值扣除。

### AT-FIN-07　移動平均

以固定資料驗證3個月平均收入、開銷及覆蓋率。顯示計算月份與樣本數。

### AT-FIN-08　空資料

新帳號沒有資料時所有圖表顯示無資料與輸入入口，不顯示預設收入或曲線。

## 5. Firstrade

### AT-INV-01　帳戶快照

手動輸入Firstrade美元總值及現金，正確納入資產配置與淨值。

### AT-INV-02　CSV預覽與驗證

上傳固定fixture，預覽欄位、資料型別、日期、幣別及活動類型；錯誤列不進正式表。

### AT-INV-03　去重

同一檔案匯入兩次、重疊期間檔案再匯入，正式活動數量不增加；匯入批次仍保留「已忽略重複」統計。

### AT-INV-04　活動正規化

固定fixture至少含買、賣、股息、利息、存款、提款及費用；每種類型正確映射，未識別類型保留原始資料並要求人工分類，不丟棄。

### AT-INV-05　真實樣本

`VERIFIED`（2026-08-13）。遮蔽真實樣本預覽為486列、0 parse errors；共用staging正式匯入結果為486／486／0／0，去識別D1合計USD 17.81（1781 minor units），活動為BUY255／SELL182／DIVIDEND7／INTEREST15／UNCLASSIFIED27，未知`Other` 27列原始證據保留，重跑為0新增／486重複。Firstrade官方完整日期範圍總數486；唯讀篩選確認2025-04-16兩筆MSTU BUY，數量1.00、金額-5.71均與遮蔽樣本一致。未遮蔽CSV、帳號、姓名、地址與帳密未進入Codex、Git、log、snapshot或文件；因此`INV-002`／`SETUP-007`及AT-INV-05完成。

## 6. 社群統計

固定資料：

- 內容A：教學型，發布10:00；24小時曝光1,000；成交20。
- 內容B：教學型，發布10:00；24小時曝光3,000；成交30。
- 內容C：娛樂型，發布10:00；24小時曝光4,000；成交20。

### AT-SOC-01　內容與平台實體

同一content asset可連到YouTube與Instagram兩個platform post，各自發布時間與指標不混合。

### AT-SOC-02　快照

同一貼文1h、6h、24h及72h快照按時間保存；累積值可下降時保留來源數據並標示異常，不無聲修正。

### AT-SOC-03　CSV去重

同一社群CSV重複匯入不重複快照。

### AT-SOC-04　事件時間軸

在發布後12小時建立「被大型帳號轉發」事件，圖上時間位置正確；時區切換測試不偏移日期。

### AT-SOC-05　教學型首日平均曝光

(1,000 + 3,000) / 2 = 2,000；sampleSize=2。

### AT-SOC-06　教學型總成交與轉化率

總成交50，總曝光4,000，以曝光為分母的整體轉化率1.25%。另驗證「平均個別轉化率」與整體轉化率是不同指標，不能混用。

### AT-SOC-07　手動成交

修改內容A成交20→40後，API與畫面即時變為總成交70、整體轉化率1.75%；此測試防止寫死數字。

### AT-SOC-08　條件與混雜顯示

若教學型全是YouTube、娛樂型全是Instagram，系統顯示平台條件不一致，不能只顯示「風格造成差異」。

### AT-SOC-09　非精確24h

內容只有23h30m快照，若容許誤差15分鐘則`INSUFFICIENT`；若設定45分鐘則`NEAREST`並顯示-30分鐘偏差。

### AT-PROV-01　來源展開

每個比較結果可展開看到內容A/B、原始快照、公式、時間窗、排除數及計算時間。

## 7. YouTube

### AT-YT-01　OAuth安全

state錯誤、redirect mismatch及缺少Access身分均被拒絕；token不出現在URL、前端store或log。

### AT-YT-02　最小權限

要求`yt-analytics.readonly`及必要的YouTube唯讀資料權限，不要求monetary scope。

### AT-YT-03　同步冪等

相同API資料同步兩次不重複建立貼文或快照。相同raw內容可全域去重，但每個run都必須以有序關聯完整列出其實際取得的payload，且完整JSON匯出／還原保留該關聯。

### AT-YT-04　真實頻道

使用者授權後讀取至少一個真實頻道／影片及一項Analytics指標，與YouTube Studio選定期間人工核對；記錄API定義差異。

### AT-YT-05　失效與重試

撤銷token後UI顯示需要重新連接，排程記錄錯誤但財務等其他模組正常。

## 8. Instagram

### AT-IG-01　Instagram Login

只有Access授權使用者可啟動流程；state與token安全測試通過。

### AT-IG-02　專業帳號

連接專業帳號並讀取基本資料；普通帳號或權限不足顯示官方錯誤，不建立假帳號。

### AT-IG-03　Insights

取得至少一篇真實內容及一項可用Insights指標，保存原始payload與正規化snapshot。

### AT-IG-04　冪等與token

重複同步不重複；token加密存D1，前端與export不包含token。

### AT-IG-05　平台差異

Instagram的views／reach等不自動改名為YouTube impressions；比較介面要求使用者選擇可比指標或分面顯示。

## 9. 期限、Push與Email

### AT-DDL-01　兩級限制

API與UI只能建立`SUPER_CRITICAL`及`CRITICAL`；其他值validation失敗。

### AT-DDL-02　範本

W-8BEN與報稅範本固定最高級；可編輯日期及說明但不能降級，除非使用者明確複製為自訂事項。

### AT-DDL-03　單一起始日期

開始日期前不發送；到達日期後站內、Push及Email在同一輪排程啟動，沒有其他階段日期。

### AT-DDL-04　持續到完成

連續三個通知週期均提醒；標記完成後下一週期不提醒，completion歷史存在。

### AT-DDL-05　去重

同一排程因重試執行兩次，單一channel在同一週期最多一筆delivery。

### AT-DDL-06　W-8BEN

依簽署日產生試算到期日；輸入Firstrade確認日期後以確認日期顯示，仍保留試算值與依據。

### AT-DDL-07　報稅

建立年度報稅事項及子任務，通知只由主要開始日期啟動。

### AT-PUSH-01　真實推播

手機與電腦各訂閱一次，送出測試Push並收到；停用一台不影響另一台。

N線自動固定答案（2026-08-13）：`tests/worker/notifications-writeback-d1.test.ts`以兩個有效訂閱驗證同一 shared test-send operation 只送一次；裝置A收到provider 410時保存`EXPIRED`／`PUSH_SUBSCRIPTION_EXPIRED`，裝置B成功時保存`ACTIVE`／`last_success_at`，共用Web Push channel仍為`READY`且以「有活動裝置但仍有裝置錯誤」保留錯誤摘要；`GET /api/v1/push-subscriptions`回傳兩台逐裝置狀態。另一個固定答案以同一時間戳的手機舊`ACTIVE`列與最新`DISABLED`列、電腦`ACTIVE`列重現C情境：API顯示手機`DISABLED`／電腦`ACTIVE`，測試只呼叫電腦端點，delivery以`SENT`保存且`provider_message_id`可為空；裝置名稱由`sync_devices.display_name`對應，並覆蓋同 endpoint 重訂閱、改名與穩定排序。Push 2xx 的語意是 Push service accepted，不代表瀏覽器顯示或真人已看見。空訂閱回傳`PUSH_SUBSCRIPTION_MISSING`且API為空陣列，不產生示範資料。此為自動化與API/UI資料路徑證據；C final 真人驗收已在下方完成，`AT-PUSH-01`現為`VERIFIED`。

C線 final acceptance checkpoint（2026-08-12；N1歷史紀錄）：Access session 下的期限頁唯讀載入成功，標題為「重要期限與多通道警告」且無紅色 API／載入錯誤；使用者已準備一筆正式 `OPEN` 期限並完成真實電腦與手機授權／啟用及兩台收件。使用者已停用手機；D1 唯讀聚合確認手機 `DISABLED`、電腦 `ACTIVE`、兩台既有成功紀錄／錯誤 0，`WEB_PUSH=READY`、delivery `SENT` 9。下一步只從未停用電腦發送一次，確認停用手機不再收件後完成 `AT-PUSH-01`。

C線最後獨立性測試失敗（2026-08-12）：預期未停用電腦收到、停用手機不收到，且電腦維持 `ACTIVE`；使用者實際回報電腦未收到，電腦 UI 顯示 `DISABLED`。D1 唯讀卻回報 computer-like=`ACTIVE` 1、mobile-like=`DISABLED` 1、`WEB_PUSH=READY`、最後一次後 `WEB_PUSH` delivery `SENT` 10／錯誤 0。此為 UI／共用通知狀態與真人收件互相矛盾的最小重現；未修改程式、未部署、未重複發送，`AT-PUSH-01` 維持 `IN_PROGRESS` 並移交主線。

### A整合線 N2 部署證據（2026-08-13；C final前的歷史部署紀錄）

N2 `724fa63b9588130b7719b92713cfaa36d83278fb` 已由 A 以 no-ff merge `a8781085d33b515360455570d320f17ef8369144` 納入；C final `441b9d3c6941a6571d3660d4fce3359191ff5223` 只納入去識別失敗／移交證據，merge `6362929d9f7cf782a562bee51388bf2cb93dc714`，沒有 C runtime。N2 固定答案已覆蓋每裝置最新列、停用裝置遮蔽舊列、同 endpoint 重訂閱、裝置改名與 provider accepted 語意，但不替代真人收件。

A 以 process-only `VITE_VAPID_PUBLIC_KEY` 完成 client build 並部署 staging version `db41ff0c-7864-43d2-9a98-54000cebfa92`；唯讀 status 為 100% active，remote migration 為 `No migrations to apply!`，未執行 migration。bundle 實際含 public key，未發現 private／subject／其他 secret identifier；未授權 `/`、期限頁及通知／Push／整合 GET 均由 Access 回 `302`。在 C final 真人驗收前，三項 Push ID 當時仍為 `IN_PROGRESS`；下方 C final 紀錄已取代該暫時狀態，`AT-GATE-08`則於最終整合 gate 完成。
C線 final acceptance（2026-08-13）：N2整合後staging version `db41ff0c-7864-43d2-9a98-54000cebfa92`為100% active，remote migration無待套用；使用者已在真實電腦完成client安全更新。手機與電腦兩台真實裝置各自訂閱並收到測試Push，手機之後獨立停用；從未停用電腦只發送一次最後測試，電腦收到且手機未收到。UI顯示Web Push `READY`、電腦`ACTIVE`及最新成功時間、手機`DISABLED`及既有成功時間；Push API回讀兩台逐裝置狀態與成功／錯誤欄位；D1最新delivery為`SENT` 1、只送至`ACTIVE`電腦、停用手機0筆，通道摘要`READY`且錯誤0。`AT-PUSH-01`完成，`DDL-008`／`SETUP-006`標為`VERIFIED`；C線本身不執行`AT-GATE-08`，A最終整合線已在所有外部驗收完成後執行並通過。

### AT-MAIL-01　真實郵件

Resend寄到使用者本人信箱，收到測試信；錯誤與message ID保存。正式日誌不得包含API key。

D線歷史狀態（2026-08-12）：`VERIFIED`。使用者已確認Resend帳號建立，staging `RESEND_API_KEY`／`RESEND_FROM`均由只讀清單核對為`secret_text`，遠端D1已核對加密收件設定、Email `READY`、正式`OPEN`期限及`EMAIL`／`USER_TEST`／`SENT` delivery；使用者再確認已在垃圾郵件收到本人測試信，完成真人收件驗收。共用通道摘要缺陷已移交，不影響本次delivery與收件證據。2026-08-14 release safety audit 因目前 Resend account／quota／reset evidence unknown，將目前 `DDL-009`／`SETUP-005` 狀態降為 `EXTERNAL_BLOCKED`；不重做真人寄信，歷史證據不等於目前 gate 可用。

## 10. 離線與同步

### AT-OFF-01　離線啟動

已安裝PWA且載入過資料後斷網，重新開啟可看到今日行動、近期財務及期限。

### AT-OFF-02　離線寫入

斷網新增一筆支出與一筆任務完成；待同步數=2，重開仍存在。

### AT-OFF-03　恢復

恢復網路自動同步；D1各一筆，outbox清空。

### AT-OFF-04　手動同步

不支援Background Sync的瀏覽器能靠回前景／手動按鈕完成。

### AT-OFF-05　跨裝置

手機離線新增後同步，電腦刷新／同步取得資料。

### AT-OFF-06　冪等

同一operation重送三次，D1只有一筆。

### AT-OFF-07　衝突

手機與電腦從version 1離線修改同一交易；第一個成功，第二個收到衝突並顯示差異，不能靜默覆蓋。

### AT-OFF-08　更新App

以相同`/assets/app.js`檔名建置兩個不同內容的正式bundle，兩次`sw.js`必須有不同的內容衍生版本與cache名稱；既有受控client重新整理後要顯示「有新版可用」，不能永久停留舊bundle。提示必須固定且完整落在初始viewport內；320、390、768、1366、1920px都不得靠捲到文件底部才看見，手機並須位於同步狀態與底部導覽上方。註冊與主動檢查更新不得使用HTTP cache。靜態資產在線時採network-first、離線時才回退同版cache，且Cloudflare Access跨來源redirect不得寫入app shell cache。

有待同步outbox時按「安全更新」要明確阻擋、不丟資料、不強制reload；outbox為0時才通知waiting worker接管並reload。更新後在YouTube長請求尚未完成時，該連線的按鈕必須顯示「同步中」且同步／撤銷均停用，完成後才恢復。

## 11. UI與圖表

### AT-UI-01　禁止模板感

人工與視覺回歸檢查：首頁不得由相同大圓角卡片組成，不得呈現Notion／健康App風格。

### AT-UI-02　淺色與遊戲感

淺色主題下仍能透過版面、狀態、領域身分及互動呈現遊戲介面感，不依賴霓虹深色。

### AT-UI-03　密度層級

320px、390px、768px、1366px及大型桌面截圖；資訊不過鬆、不重疊，深度分析仍可讀。

### AT-UI-04　動效

reduced-motion時移除非必要動畫；一般模式完成任務有清楚但不幼稚的回饋。

### AT-UI-05　首頁順序

今日行動為第一個主要區塊；有最高級期限時警告在首屏明顯出現。

### AT-UI-06　不藏資訊

兩次以內操作可從圖表進入計算依據；常用篩選不藏在多層選單。

### AT-CHART-01~10

逐項驗證`UI_DESIGN.md`中UI-CHART-001至010。Playwright至少檢查：

- 圖名；
- X／Y軸名；
- 單位；
- 刻度文字；
- 圖例；
- tooltip；
- 資料定義入口；
- 日期與分組設定；
- 事件標註；
- 原始資料／計算依據連結。

## 12. 安全、操作與資料

### AT-SEC-01

未登入Cloudflare Access無法讀取App及API；只有使用者指定身分可進入。

### AT-SEC-02

Secrets與OAuth token不出現在bundle、source map、export、console或Git掃描。

### AT-SEC-03

CSV公式注入測試：以`=cmd...`開頭的欄位匯出後不被試算表當公式。

### AT-SEC-04

依賴與程式碼掃描無Firstrade逆向登入套件、帳密欄位或下單端點。

### AT-DATA-01

完整JSON匯出後在乾淨本機環境匯入，主要entity counts及checksum一致。

### AT-DATA-02

各模組CSV欄位與資料字典一致。

### AT-DATA-03

D1 SQL匯出、還原及migration驗證通過。

### AT-DATA-04

刪除同步tombstone，離線裝置不會復活資料。

### AT-DATA-05

匯出不含secret、token及Push私鑰。

### AT-ARCH-01

新增測試模組不需修改財務或任務內部repository；架構依賴圖無循環。

### AT-ARCH-02

新增一個需要新行為的分析adapter時，既有API契約與測試維持通過。

### AT-ARCH-03

建立假的future provider測試adapter，能透過provider registry匯入資料，不需修改社群分析公式。

### AT-OPS-01

部署後關閉開發電腦，手機與電腦仍可使用、同步，Cron仍能處理提醒。

### AT-OPS-02

**前置：** 已有去識別的 Cloudflare 結帳頁證據、官方 quota／billing 來源與 `docs/COST_GUARDRAIL_PLAN.md`；staging 可驗證，production 尚未上線。
**步驟：** 對照帳戶特定 checkout authorization、產品／方案 allowlist、官方配額、用量來源與告警狀態；同時對照 Resend／YouTube／Instagram 的外部 quota 契約。
**預期：** 結帳頁明示的超額按月計費與授權使帳戶狀態為「存在自動超額計費風險」，Free 標籤、seat 未滿或沒有當期用量不能改寫為「不會扣款」；未完成帳戶核對時 `NFR-001`／`OPS-002` 不得標 `VERIFIED`。
**證據：** `docs/PRODUCT_REQUIREMENTS.md`、`docs/OPERATIONS.md`、`docs/COST_GUARDRAIL_PLAN.md`、官方來源 URL、去識別 checkout 摘要與 audit id；不得保存付款資料。
**禁止：** 不得用一般 onboarding 文件否定 checkout、不得以 seat 額滿／登入阻擋當成所有成本安全、不得自動升級、綁卡、取消授權或修改帳戶設定。

### AT-OPS-03　帳戶付費產品／SKU drift

**前置：** 有版本化的 account／plan allowlist，並能以唯讀 dashboard 或官方 API 取得產品、方案、binding 與 billing authorization 狀態。
**步驟：** 注入「Workers Paid、R2、Queues、Cloudflare Email Sending、額外 Zero Trust product 或未知 SKU」各一種 drift；再注入讀取失敗與欄位改版。
**預期：** 未列入 allowlist 或狀態為 `UNKNOWN` 時，audit 失敗、production gate fail、非必要同步／部署停止；不自動改方案。
**證據：** 去敏 plan／SKU／binding 摘要、allowlist diff、audit id、固定錯誤碼與阻擋決定。
**禁止：** 不建立資源、不啟用付費產品、不以「目前用量為零」消除 drift。

### AT-OPS-04　固定答案 quota 計算

**前置：** 使用官方來源版本化的 quota contract；測試資料不呼叫真實平台。
**步驟：** 以固定輸入驗證官方 baseline 與本帳戶 evidence 分離：D1 2,500,000／5,000,000 rows read、50,000／100,000 writes、YouTube Data 5,000／10,000 units 可建立 local conservative ledger，但 admission 必須標 `ESTIMATED`／`providerInvoiceTruth=false` 並套用 reserve；Resend 100/day、3,000/month、10 req/s 僅作官方契約 fixture，沒有本帳戶 plan／remaining／reset 時不可放行；YouTube Analytics、Instagram、Zero Trust／Access、KV、R2、Queues、Cloudflare Email 不得填入臆造 allowance，一律 `UNKNOWN`／帳戶控制；再驗證 D1 index write、YouTube method cost、Resend multiple recipients 的計數。
**預期：** unit、period、reset、source、quality 均正確；不把列數、API request 數或 40 篇 Instagram 上限誤當不同 provider 的 quota；local ledger 不得被標為 provider invoice truth。
**證據：** 固定答案輸入／輸出、contract version、source URL、計算時間與 provenance。
**禁止：** 不以估算值通過安全 gate、不把不同日／月窗口相加、不讀寫 staging／production 真實資料作計算測試。

### AT-OPS-05　50／70／75／80／85%告警去重

**前置：** exact metric、固定 period／reset 與可測試的告警 sink。
**步驟：** 同一 resource 在 50／70／75／80／85% 各送兩次；在同一 window 重收、重試、服務重啟；再跨 reset 產生相同比例。
**預期：** 每個 threshold／window 只產生一個業務告警；delivery retry 不產生第二個告警；新 period 才可重新告警。
**證據：** dedupe key、alert row／event、delivery attempt、period／reset 與 notification log。
**禁止：** 不因告警重試重送 provider request、不把缺 metric 當 0%、不刪除歷史 audit 以製造去重通過。

### AT-OPS-06　70／75%降載與80／85% internal hard-stop

**前置：** 分別準備 auto-overage／unknown resource 的 70／80% 與 hard-reject-only resource 的 75／85% exact contract fixture；排程與手動 sync 同時可觸發。
**步驟：** 同時觸發非必要 provider sync、測試信、bulk import 與核心 read／write；觀察 request gate、scheduler、manual path。
**預期：** 非必要操作依狀態被固定 `COST_GUARDRAIL_DEGRADED` 或 `COST_GUARDRAIL_HARD_STOP` 阻擋／降載，核心非相關模組仍可用；不清 outbox、不刪資料、不自動升級。
**證據：** gate decision、被省略的 operation、provider request count、核心操作結果、audit。
**禁止：** 不以「最後一點額度」放行測試、不用 retry／in-flight／race 繞過 reserve、不把 internal stop 寫成 provider 或帳戶 hard cap。

### AT-OPS-07　unknown／平台失敗／internal stop fail-closed

**前置：** metric quality 為 UNKNOWN／STALE／MISMATCH、internal budget 達 80／85%，或平台回 Workers 1027／1102、D1 quota／storage error、Resend 429 quota、YouTube quota error、Instagram rate-limit error。
**步驟：** 觸發排程、手動同步、通知與同一 operation 的重試；再確認其他模組的 read path。
**預期：** 對應資源 circuit open、後續 request 為 0、回固定安全錯誤並保存去敏證據；不把平台失敗轉為成功，非相關模組依 `NFR-009` 可用。
**證據：** error code、request count、circuit state、delivery／audit log、其他模組 smoke。
**禁止：** 不自動切 Workers Paid、不修改付款／Access／plan、不無限重試、不用 mock success 冒充平台恢復。

### AT-OPS-08　排程／手動同步競態

**前置：** 同一 provider connection、同一 quota window、scheduler 與 manual endpoint 可並行，且使用固定 provider stub。
**步驟：** 同時送出 Cron claim 與 manual claim，讓第一個操作保留 retry／in-flight／scheduler race／reset skew reserve，再讓第二個操作重試／超時。
**預期：** 只有一個 job 取得 claim；兩者共享 budget／breaker，不重複計算或發送外部 request；失敗一方得到可稽核的 deferred／guardrail 錯誤。
**證據：** job claim、operation idempotency、budget delta、provider call count、scheduler／manual audit。
**禁止：** 不以兩個成功 run 抵銷 quota、不用第二個 path 繞過 gate、不直接 SQL 改 job 狀態。

### AT-OPS-09　外部 metric／API 失效不得誤報安全

**前置：** quota endpoint timeout、HTTP 5xx、malformed header、缺 included quota、stale timestamp、plan mismatch 各有固定 stub。
**步驟：** 對每一種失效執行一次 schedule、manual sync、告警收集與管理頁讀取。
**預期：** quality 為 `UNKNOWN`，不計算安全百分比、不顯示「目前安全」、非必要外部操作 fail-closed；保留來源錯誤與下一個人工處置。
**證據：** raw error（去敏）、observed_at／stale 判定、quality、gate decision、通知／audit。
**禁止：** 不以 0、上一期、估算或 Free plan label 補空值，不把 collector timeout 當成 quota reset。

### AT-OPS-10　跨日／跨月 reset

**前置：** 可注入 UTC day、provider billing month、Resend month、R2 GB-month 與 Zero Trust billing period 的 clock；所有資料仍為 synthetic。
**步驟：** 在 reset 前以 50／70／75／80／85% 的適用門檻推進，跨過 reset，再以新 window 送同一 threshold；另測「顯示日期已變但 provider reset 尚未確認」。
**預期：** 只有觀測到官方 reset／新 period 才清除該 window 的 used／dedupe；舊 audit 保留，新 window 從 0 或官方回報值開始；未確認時維持 `UNKNOWN`／closed。
**證據：** period start／end、reset_at、timezone、old／new dedupe key 與 alert history。
**禁止：** 不用本機日期直接清 quota、不跨月沿用舊 quota、不重設正式帳戶用量。

### AT-OPS-11　時區與顯示

**前置：** 固定 UTC、Pacific、Resend provider window、Asia/Taipei UI 的 clock fixtures，含跨日與 DST 邊界。
**步驟：** 對 Workers／D1 用 UTC、YouTube 用 Pacific、App 顯示用 Asia/Taipei 計算同一事件；比較 UI、API、audit。
**預期：** 計費／quota 判定使用 provider contract timezone，畫面明確顯示時區；不把 Asia/Taipei 午夜當成 Cloudflare／YouTube reset。
**證據：** fixed clock、period、reset_at、UI label、API provenance。
**禁止：** 不用瀏覽器 local timezone 靜默改變帳戶判定、不省略時間粒度或時區。

### AT-OPS-12　通知失敗與安全狀態

**前置：** in-app、Email、Push／外部通知 sink 可分別回 timeout／429／5xx；成本 gate 已被觸發。
**步驟：** 送一次 50／70／75／80／85% 告警與一次 hard-stop 告警，讓通知失敗後重試，再查管理頁／操作 log。
**預期：** 通知失敗不解除 breaker、不標 safe；依 backoff 去重重試，站內／audit 保留阻擋狀態；恢復需明確管理者動作。
**證據：** notification delivery、attempt、去敏錯誤、gate state、audit。
**禁止：** 不無限重試、不因 email／Push 失敗自動轉另一個付費 channel、不刪除失敗紀錄。

### AT-OPS-13　管理者解除與稽核

**前置：** resource 被 hard-stop；測試角色不是帳戶管理者，另有一個被允許的管理者流程 stub。
**步驟：** 非管理者嘗試解除；管理者先完成 plan／quota／帳務核對，再提交一次明確解除理由與有效 period；執行一個 synthetic operation。
**預期：** 非管理者被拒；管理者解除只影響指定 resource／window；解除前後、理由、證據、操作者角色與 expiry 均 audit；不修改付款設定。
**證據：** authorization decision、解除 audit、synthetic result、scope／expiry、後續 50% 觀測。
**禁止：** 不提供全域無期限 bypass、不把人工核對省略成按鈕、不保存帳戶 email／付款資料。

### AT-OPS-14　staging 模擬不消耗真實付費 quota

**前置：** staging 使用隔離 D1、provider stub／recorded contract fixture、禁止真實 send／authorize 開關；production credentials 不可被測試讀取。
**步驟：** 依序模擬所有 quota、429、reset、告警與恢復案例；檢查 network allowlist、provider call log、Cloudflare／Resend／Google／Meta usage 前後證據。
**預期：** 外部真實 request、email、Push、付費 storage／queue／R2 object 均為 0；所有成功來自 synthetic response；測試不得改 production 或帳戶設定。
**證據：** stub invocation、egress deny log、隔離 D1、無真實 provider delivery、測試前後去識別 usage snapshot。
**禁止：** 不用 staging 真實 OAuth／sync／test email 驗證成本 gate，不按會送出同步或通知的按鈕，不執行 migration／部署作為此案替代。

### AT-OPS-15　production 上線前人工帳務核對

**前置：** 所有自動成本固定答案與 staging synthetic gate 已通過；production 尚未建立或尚未承接流量；管理者能以唯讀方式查看 Cloudflare 中文介面。
**步驟：** 依 `SETUP-010` 一次完成唯讀核對：Cloudflare 首頁 →「管理帳戶」→「計費」，查看「訂閱」／方案、Billable Usage、Notifications／Budget alerts、已啟用產品與 checkout 超額授權；只回報去識別摘要。
**預期：** 明確記錄 product／plan／SKU、超額授權狀態、usage／reset／alert 可用性與未核對欄位；任何未知、付款授權風險或 allowlist drift 都阻擋 production。
**證據：** 去識別畫面摘要／截圖（不進 repo）或管理者逐項摘要、查核日期、audit id；不保存卡片、email、帳號 ID 或原始圖片路徑。
**禁止：** 本階段不要求使用者執行、不修改／儲存／升級／取消任何設定、不要求 OTP、不要求貼付款資料。

### AT-OPS-16　checkout evidence 優先於一般 Free 說明

**前置：** 測試輸入同時包含一般 Free onboarding「無基本費」說明與帳戶特定 checkout「超額按月計費／授權扣款」證據。
**步驟：** 以不同輸入順序交給 evidence resolver，並檢查 plan／billing state。
**預期：** resolver 一律以帳戶特定 checkout 設為 `RISK_PRESENT`；一般文件只補充 base plan，不能覆寫 overage authorization。
**證據：** 去識別 evidence priority decision、source type／timestamp、固定 output。
**禁止：** 不以 seat 尚未用滿、目前 invoice 為零或 generic docs 將結果改為「不會扣款」。

### AT-OPS-17　provider fixed quota／unknown 邊界

**前置：** YouTube Data API 有官方 method cost／10,000 units/day fixture；Resend 有 quota／rate headers；Instagram response 缺少可驗證 account quota。
**步驟：** 分別跑 YouTube exact calculation、Resend header calculation、Instagram 40 Insights／43 subrequest application guard。
**預期：** YouTube Data 可在官方 baseline local ledger 下以 `ESTIMATED` 計算；Resend 只有取得本次 response／account quota evidence 才能計算；Instagram 狀態為 `UNKNOWN`，40／43 只限本程式／Workers，不足以放行長期同步，故 Instagram provider gate fail-closed；YouTube Analytics unknown 只阻擋 metrics operation。
**證據：** method／header／provider source、quality、request count、固定 error code。
**禁止：** 不以本地上限冒充 Meta quota、不捏造 Instagram quota 數字、不用成功一次推算整月安全。

### AT-OPS-18　程式 hard-stop 與帳戶控制邊界

**前置：** 成本 gate 可回 80%／85% internal hard-stop 或 `UNKNOWN`；帳戶 stub 同時含已授權超額扣款。
**步驟：** 觸發 App hard-stop，檢查它是否只阻擋 request／write／schedule；再檢查文件／audit 是否聲稱取消付款或修改 plan。
**預期：** App 只停止本產品用量並保存 audit；Cloudflare checkout／付款／Access／plan 狀態維持原值，文件明確標示需帳戶管理者控制。
**證據：** network zero-after-stop、account state unchanged、error／audit、文案 scan。
**禁止：** 不在程式放入「取消卡片／阻止 invoice」假 API、不以 budget alert 當 hard cap。

### AT-OPS-19　reset／人工批准後安全恢復

**前置：** resource 曾被 80／85% internal hard-stop 阻擋；官方 reset 已觀測或管理者已核准解除，且下一個 operation 為 synthetic。
**步驟：** 先重收 exact metric，再執行一個小批 synthetic；確認結果後才解除指定 circuit，並測試 scheduler／manual 不重疊。
**預期：** reset／批准前仍 blocked；批准後只恢復指定 resource／window，告警 history 保留；若 metric 再變 unknown，立即回 closed。
**證據：** reset observation、approval audit、synthetic result、circuit transition、後續 request count。
**禁止：** 不以時間經過自動清除 hard-stop、不整批重送 backlog、不跳過 quota 重新核對。

### AT-OPS-20　指標品質、來源版本與告警 window 稽核

**前置：** 同一資源提供 `EXACT`、`ESTIMATE`、`UNKNOWN`、stale 與 source version 變更的固定 observations。
**步驟：** 執行百分比、告警、降載、恢復與報表輸出，檢查每項 provenance。
**預期：** 只有 `EXACT` 可計算百分比與解除安全 gate；`ESTIMATE` 顯示「估算／不可作安全證據」；`UNKNOWN`／stale 阻擋；source version／unit／period 變更開新 audit window，不覆寫舊 evidence。
**證據：** observation schema、source URL／version、quality、period／reset、dedupe key、gate decision。
**禁止：** 不把 estimate 標成精確、不把累積值當區間、不刪除舊來源以製造一致性。

### AT-OPS-21　逐資源 risk class 與 reserve 固定答案

**前置：** 載入 versioned contract fixtures，分別包含 auto-overage／unknown、hard-reject-only、account-control 與 unknown allowance。
**步驟：** 驗證 auto-overage／unknown 為 maximum 80%、degrade 70%、hard 80%；hard-reject-only 為 85%、75%、85%；account-control 不建立 App gate。
**預期：** 每個 resource 都有 unit、owner、source、quality、measurement window、reset 與 billing fields；缺 exact allowance 或 remaining 不計百分比並回 `COST_GUARDRAIL_UNKNOWN`／`ACCOUNT_CONTROL_REQUIRED`。
**證據：** contract version、固定輸入／輸出、resource decision、錯誤碼與 audit。
**禁止：** 不把官方 baseline 當成本帳戶實際 allowance，不把 seat／40 篇／43 subrequest 當其他 provider quota。

### AT-OPS-22　原子 reserve／commit／release 與競態

**前置：** 同一 resource／period 同時執行 scheduled、manual、retry 與 duplicate operation。
**步驟：** 以 `planned + retry + in_flight + scheduler_race + reset_clock_skew` 計算 reservation，並測試 budget window、reservation、ledger transition 失敗。
**預期：** 競態只有安全的一方取得 reservation；commit／release／expire 任一重複呼叫不重複扣減；交易失敗不留下 orphan reservation 或 ledger。
**證據：** window counters、reservation status、append-only ledger、breaker event、provider call count。
**禁止：** 不以非原子先加 counter 再補 row、不用重試繞過同一 operation budget。

### AT-OPS-23　local ledger 與 provider usage mismatch

**前置：** provider 回傳 remaining／reset 與 local reservation 不一致、stale、timeout 或 invoice period 不同。
**步驟：** 分別提交 exact observation、local conservative observation、MISMATCH／STALE observation。
**預期：** UI／API 明確回 `providerInvoiceTruth=false`；對帳失敗時非必要功能 fail-closed，不把 local consumed 宣稱為 provider usage。
**證據：** observation quality、measurement／billing periods、source version、decision 與錯誤碼。
**禁止：** 不把 local ledger 轉成帳單數字，不以估算值放寬 internal limit。

### AT-OPS-24　告警失敗不能解除 breaker

**前置：** 50／70／75／80／85% alert sink 回 timeout／429／5xx，breaker 已 DEGRADED 或 OPEN。
**步驟：** 重試告警、重啟 worker、重新送相同 operation。
**預期：** alert dedupe row 保留失敗與 attempt；通知失敗不標 safe、不 release、不關閉 breaker；只有 reset 或具 expiry 的管理者 override 才能恢復。
**證據：** alert row、attempt/error、breaker state、audit log。
**禁止：** 不把「通知送不出去」當成「沒有超額風險」。

### AT-OPS-25　quota reset 與 billing cycle 分離

**前置：** UTC day、Pacific day、rolling provider window、monthly plan 與 invoice cutoff 使用不同 clock fixture。
**步驟：** 跨 quota reset、billing period start/end、invoice cutoff 與 Asia/Taipei 顯示日期各執行一次操作。
**預期：** period／reset／billing fields 分開保存；未取得 authoritative reset_at 或 timezone 時維持 UNKNOWN；新 window 才產生新的 dedupe key。
**證據：** period key、reset_at、reset timezone、billing fields、source／observed_at。
**禁止：** 不用 invoice month 推算 YouTube Pacific day、D1 UTC day 或 Instagram rolling reset。

### AT-OPS-26　expiry override、解除與稽核

**前置：** exact contract 已使 resource DEGRADED／OPEN；管理者提出有 reason、actor、expiry 的短期 override。
**步驟：** 建立不超過 allowance 且不超過 24 小時的 override，測試到期、錯誤 actor／reason／limit 與重複解除。
**預期：** override 只能放寬 local admission 到核准上限；到期自動 EXPIRED；所有 transition 有 actor、reason、expiry、audit；不能作用於 account-control resource。
**證據：** override row、breaker event、audit log、expiry 後錯誤碼。
**禁止：** 不允許無 expiry、超過 exact allowance、永久 bypass 或以 override 改 Cloudflare billing。

### AT-OPS-27　provider gate 與 account-control 邊界

**前置：** YouTube Data、Instagram、Resend 有 gate；YouTube Analytics／Access／Workers inbound 使用 unknown／observe-only fixture。
**步驟：** 分別觸發 scheduled、manual、OAuth finish、provider request、Workers inbound 與 Access seat 狀態。
**預期：** D1／YouTube Data 在有官方 baseline 時可回 `ESTIMATED` 並只阻擋到自身 budget；YouTube Analytics unknown 只回 `PARTIAL`並跳過 metrics；Instagram／Resend unknown 在對應 external operation 前回 `COST_GUARDRAIL_UNKNOWN`，不牽連 read-only UI 或不相關 provider；Workers invocation 與 Access／帳務只回 `OBSERVE_ONLY`／`ACCOUNT_CONTROL_REQUIRED`，不假稱可 hard-stop。
**證據：** request guard、provider fetch count、D1 reservation、API／UI decision、drift audit。
**禁止：** 不以 Worker 內 gate 宣稱能阻止已發生的 invocation 或 Cloudflare 扣款。

### AT-OPS-28　config drift 與 production 前停止點

**前置：** 在 synthetic copy 中加入 KV、R2、Queues、Email binding／付費 SKU drift；production 尚未承接流量。
**步驟：** 執行 config allowlist scan、runtime drift audit、build／secret scan，並檢查未套用 migration 與未部署狀態。
**預期：** drift 以固定錯誤阻擋非必要工作與 production gate；staging synthetic 不呼叫真實 paid provider、不寄送 Email／Push；`SETUP-010` 未完成時 NFR-001／OPS-002 保持 IN_PROGRESS／AWAITING_USER_SETUP。
**證據：** scan output、drift row、migration list、egress／stub log、status 文件。
**禁止：** 不部署 production、不套用遠端 migration、不修改付款／方案／Secrets／vars／Access。

### AT-SETUP-01

每個外部設定閘門都有平台位置、要貼的URL、Secret名稱、驗證方法及未完成時的狀態；不得只有模糊一句「設定OAuth」。

## 13. 部署閘門

### AT-GATE-01　需求狀態

第一批所有需求均有狀態、證據、測試，不得空白。

### AT-GATE-02　假資料掃描

production source不得引用`fixtures`、`mock`、`demoData`、`Math.random`或已知placeholder；合理的測試／故事檔案需排除但不得進bundle。

### AT-GATE-03　未實作掃描

`TODO`、`FIXME`、`NotImplemented`、空handler、永遠回傳常數的分析endpoint均阻止部署，除非位於明確延後且不可達的開發檔案。

### AT-GATE-04　測試完整

lint、typecheck、Vitest、D1、API contract、Playwright全部通過，無skip／todo／only。

### AT-GATE-05　全新資料庫

從零依序套用所有migration並通過seeded acceptance tests。

### AT-GATE-06　既有升級

從上一release資料快照升級，資料數量及關鍵結果不變。

### AT-GATE-07　正式空資料

新正式環境沒有示範資料，所有頁面顯示正確空狀態。

### AT-GATE-08　外部整合

YouTube、Instagram、Push、Resend及Firstrade真實驗收若尚未完成，release不得標為全面完成；可部署staging，但狀態必須明示。

### 2026-08-13 最終整合 gate 結果

`AT-GATE-08` `PASSED`。最新正式狀態為：`SOC-010`／`SETUP-004`／`AT-IG-01`～`AT-IG-05`、`INV-002`／`SETUP-007`／`AT-INV-05`、`DDL-008`／`SETUP-006`／`AT-PUSH-01`、`DDL-009`／`SETUP-005`／`AT-MAIL-01` 均 `VERIFIED`；YouTube `SOC-009`／`SETUP-003`及既有跨裝置／PWA／UI gate維持既有 `VERIFIED`。所有外部真人證據均保留於本檔、`IMPLEMENTATION_STATUS.md`、`TRACEABILITY_MATRIX.md`及`SETUP_CHECKLIST.md`；本 gate 不改production `SETUP-009`。

### 2026-08-14 staging release safety audit addendum

上述 `AT-GATE-08` 是 2026-08-13 成本 gate 之前的歷史結果，不是本輪 runtime 的 current release-ready 宣稱。2026-08-14 先完成本機安全修正與隔離測試，再依下列停止條件執行 staging：

| 驗收範圍 | 本輪固定答案／證據 | current status |
|---|---|---|
| Migration 0011／0012 | 既有 0001～0010 未改；全新與既有 schema 的 local apply、重複 apply、schema version 12、sentinel 保留、settled／succeeded 欄位固定答案通過；remote 只允許 pending 0011／0012 | `IN_PROGRESS`，remote list 異常即停止 |
| D1／YouTube Data | 官方 included baseline 可建立 `LOCAL_CONSERVATIVE`，門檻依 hard-reject-only 75% degrade／85% internal stop；UI／API 顯示 `ESTIMATED`／`NOT_INVOICE_TRUTH`，不當 provider invoice truth | 可局部運作，不代表 NFR-001／OPS-002 完成 |
| YouTube Analytics | allowance／meter unknown 時不發 metrics request，Data sync 保留並回 `PARTIAL`／`COST_GUARDRAIL_UNKNOWN` | `SOC-009`／`SETUP-003` `EXTERNAL_BLOCKED` |
| Instagram／Resend | 各自 quota／account evidence unknown 時只阻擋自身 external operation，明確回 `COST_GUARDRAIL_UNKNOWN`；read-only UI、站內與不相關 provider 不受牽連 | `SOC-010`／`SETUP-004`、`DDL-009`／`SETUP-005` `EXTERNAL_BLOCKED` |
| Workers／Access／帳戶帳務 | 只 observe／account-control；不在 Worker 入口拒絕 inbound，不宣稱 App 可阻止 invocation、Access seat 或 Cloudflare 扣款 | `ACCOUNT_CONTROL_REQUIRED` |
| Staging synthetic | 只用 fixture／stub／隔離 D1；不呼叫 YouTube／Instagram／Resend，不寄 email／Push，不按同步／通知按鈕，不製造真實付費用量 | 通過條件；production 不部署 |

本輪完成證據必須同時保存 source commit、remote migration list／apply output、active version 100%、bundle／secret／config scan、migration schema query、GET-only Access boundary smoke 及本機測試結果。無 authoritative provider/account usage、reset、billing 或 hard cap 證據時，`NFR-001`／`OPS-002` 保持 `IN_PROGRESS`，不得以本輪 staging smoke 升級。
