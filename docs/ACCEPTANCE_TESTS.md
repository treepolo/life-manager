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

使用者提供遮蔽Firstrade實際CSV後，解析row count、總金額及選定數筆與Firstrade畫面人工核對。未完成此測試不得將INV-002標為`VERIFIED`。

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

N線自動固定答案（2026-08-12）：`tests/worker/notifications-writeback-d1.test.ts`以兩個有效訂閱驗證同一 shared test-send operation 只送一次；裝置A收到provider 410時保存`EXPIRED`／`PUSH_SUBSCRIPTION_EXPIRED`，裝置B成功時保存`ACTIVE`／`last_success_at`，共用Web Push channel仍為`READY`且成功摘要可讀回；`GET /api/v1/push-subscriptions`回傳兩台逐裝置狀態。空訂閱回傳`PUSH_SUBSCRIPTION_MISSING`且API為空陣列，不產生示範資料。此為自動化與API/UI資料路徑證據，不取代A部署後由C執行的兩台真人收件、獨立停用與瀏覽器通知授權；本驗收維持`IN_PROGRESS`。

C線 final acceptance checkpoint（2026-08-12）：Access session 下的期限頁唯讀載入成功，標題為「重要期限與多通道警告」且無紅色 API／載入錯誤；使用者已準備一筆正式 `OPEN` 期限，頁面已出現「測試發送」入口，但仍為空 Push 訂閱狀態，尚未觸發任何 POST。下一步依固定流程由真實電腦先完成授權／訂閱，再驗收手機、測試通知、逐裝置狀態讀回及獨立停用；`AT-PUSH-01` 維持 `IN_PROGRESS`。

### AT-MAIL-01　真實郵件

Resend寄到使用者本人信箱，收到測試信；錯誤與message ID保存。正式日誌不得包含API key。

D線狀態（2026-08-12）：`VERIFIED`。使用者已確認Resend帳號建立，staging `RESEND_API_KEY`／`RESEND_FROM`均由只讀清單核對為`secret_text`，遠端D1已核對加密收件設定、Email `READY`、正式`OPEN`期限及`EMAIL`／`USER_TEST`／`SENT` delivery；使用者再確認已在垃圾郵件收到本人測試信，完成真人收件驗收。共用通道摘要缺陷已移交，不影響本次delivery與收件證據。

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

Cloudflare、Resend及其他服務設定未啟用付費方案；文件列出目前方案與額度查核日期。

D線支援證據（2026-08-12）：`docs/OPERATIONS.md`已記錄Resend官方免費額度與限制、Idempotency-Key及查核日期；實際帳號方案與用量仍待Resend Usage頁人工核對，故不單獨宣稱`AT-OPS-02`已完成。

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
