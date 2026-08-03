# AGENTS.md — Codex強制工作規則

## 1. 每次工作前必做

1. 依序閱讀：
   - `PROJECT_GUIDE.md`
   - `docs/PRODUCT_REQUIREMENTS.md`
   - `docs/TRACEABILITY_MATRIX.md`
   - `docs/ARCHITECTURE.md`
   - `docs/DATA_AND_SYNC.md`
   - `docs/UI_DESIGN.md`
   - `docs/ACCEPTANCE_TESTS.md`
   - `docs/IMPLEMENTATION_STATUS.md`
   - 與本次工作相關的`docs/OPERATIONS.md`及`docs/SETUP_CHECKLIST.md`
2. 檢查Git狀態、現有架構、migration、測試及目前實作證據。
3. 在`IMPLEMENTATION_STATUS.md`將本次處理的需求改為`IN_PROGRESS`，列出預定修改檔案、測試及外部阻擋。
4. 若文件與現有程式衝突，先記錄衝突，不得暗自選擇簡化版本。

## 2. 絕對禁止

- 禁止把第一批正式版本縮減成MVP、展示版、概念驗證、骨架或半成品。
- 禁止在未明確揭露的情況下省略需求。
- 禁止以漂亮前端掩蓋尚未存在的後端、資料庫或運算。
- 禁止在正式程式中使用寫死數字、`Math.random()`、假API回應、示範統計或測試fixtures。
- 禁止讓空資料狀態自動顯示示範資料；只能顯示「尚無資料」或具體缺少項目。
- 禁止把來源不明的數字標示為真實、估算值標示為精確值，或把累積值誤標為區間值。
- 禁止使用`eval`、`new Function`或任意程式碼執行自定義公式。
- 禁止把OAuth token、API key、Access憑證、Firstrade密碼或其他秘密放入前端、Git、日誌、測試快照或Markdown。
- 禁止使用非官方Firstrade逆向登入API或保存Firstrade帳密。
- 禁止直接在正式D1上試驗migration、清除資料或建立假資料。
- 禁止修改已套用的migration；只能新增migration。
- 禁止無關重構、換框架、換路由器、換狀態管理或大範圍格式化。
- 禁止為了「乾淨」省略圖表軸名、單位、刻度、圖例、資料來源及計算定義。
- 禁止使用超大圓角卡片陣列、Notion／SaaS模板、健康App或習慣養成App風格作為成品。
- 禁止只在聊天中宣稱完成而不更新`IMPLEMENTATION_STATUS.md`與驗收證據。

## 3. 開發原則

- 採模組化單體：新增功能以新增模組、資料表、API、畫面及測試為主。
- 核心欄位使用正式關聯資料表；不穩定附加欄位可使用版本化JSON，但金額、日期、關聯ID、來源與常用篩選欄位不得只藏在JSON。
- 每次寫入使用伺服器驗證、交易、idempotency key及稽核欄位。
- 所有外部資料同時保存原始回應／檔案證據及正規化資料。
- 所有衍生數字由命名、版本化的計算函式產生，回傳值必須包含provenance。
- 新增API必須有Zod輸入／輸出schema、明確錯誤碼及契約測試。
- 離線功能不是「快取幾個頁面」；所有第一批核心輸入流程都必須通過離線建立、編輯、刪除／封存及恢復同步測試。
- UI先處理真實資訊結構，再處理裝飾；不得以空卡片湊版。
- 手機版必須重新安排優先順序，不能只是把桌面卡片堆成長卷。

## 4. 需求完成狀態

只能使用以下狀態：

- `NOT_STARTED`
- `IN_PROGRESS`
- `IMPLEMENTED_UNVERIFIED`
- `AWAITING_USER_SETUP`
- `EXTERNAL_BLOCKED`
- `VERIFIED`

`IMPLEMENTED_UNVERIFIED`不等於完成。需要使用者登入或提供真實CSV時，使用`AWAITING_USER_SETUP`，並在`SETUP_CHECKLIST.md`加入精確步驟。只有自動測試、真實資料驗證及相關文件全部完成後才能標為`VERIFIED`。

## 5. 每項功能的完成證據

每項需求至少需要：

- 實作檔案路徑；
- migration或明確「不需migration」說明；
- 單元／資料庫／API／端對端測試；
- 固定答案測試的輸入與預期輸出；
- 正式資料來源證據；
- 空資料、錯誤、離線與權限失效狀態；
- UI可操作路徑；
- 若涉及外部平台，真實授權與同步紀錄；
- `TRACEABILITY_MATRIX.md`及`IMPLEMENTATION_STATUS.md`更新。

## 6. 統計與圖表特別規則

任何數字元件不能只回傳`value`。至少應提供：

- 指標識別與版本；
- 值與單位；
- 資料來源；
- 觀測筆數及樣本數；
- 時間範圍／發布後時間窗；
- 篩選與分組條件；
- 聚合方式；
- 分母定義；
- 缺失值與排除數；
- 計算時間；
- 是否精確、估算、手動或來源回報。

每張圖表的軸、單位、刻度與時間粒度必須通過可讀性驗收。不得把不同量綱放在同一軸上而不明示；不得把近似24小時數據標成精確首日值。

## 7. 工作結束時

1. 執行lint、typecheck、單元測試、資料庫測試、契約測試及Playwright。
2. 執行正式程式假資料掃描、跳過測試掃描、未實作標記掃描。
3. 更新`IMPLEMENTATION_STATUS.md`，逐項附上證據；未完成部分必須列出，不得模糊描述。
4. 更新受影響的架構、資料、操作及設定文件。
5. 產出本次變更摘要：
   - 完成的需求ID；
   - 未完成／受阻的需求ID；
   - 實際修改檔案；
   - migration；
   - 測試命令與結果；
   - 需要使用者執行的下一個單一步驟。
6. 不得以「主要功能已完成」「基本上完成」「核心已就緒」取代逐項狀態。
