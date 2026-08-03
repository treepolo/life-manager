# 給Codex ChatGPT work的啟動題詞

你現在要在目前工作區開發「人生管理器」。請把專案根目錄中的文件視為正式產品規格與強制開發規則，不要把本工作解讀成MVP、概念驗證、展示頁或只搭骨架。

第一步請完整閱讀並遵守：

1. `PROJECT_GUIDE.md`
2. `AGENTS.md`
3. `docs/PRODUCT_REQUIREMENTS.md`
4. `docs/TRACEABILITY_MATRIX.md`
5. `docs/ARCHITECTURE.md`
6. `docs/DATA_AND_SYNC.md`
7. `docs/UI_DESIGN.md`
8. `docs/ACCEPTANCE_TESTS.md`
9. `docs/IMPLEMENTATION_STATUS.md`
10. `docs/OPERATIONS.md`
11. `docs/SETUP_CHECKLIST.md`
12. `docs/REFERENCES.md`

閱讀後先檢查目前工作區。若工作區是空的，依文件建立正式專案；若已有程式，先對照需求、架構、migration及測試，禁止為了方便直接重建或覆蓋有效內容。

你必須先完成下列前置工作，然後直接開始實作，不要只交計畫後停止：

- 建立需求追蹤結果：確認每個第一批需求ID在`TRACEABILITY_MATRIX.md`及`IMPLEMENTATION_STATUS.md`都有位置。
- 列出現況差距、預定修改檔案、migration、測試與外部設定閘門。
- 將本次開始處理的項目改為`IN_PROGRESS`。
- 建立或修正專案結構、工具鏈及本機D1環境。
- 按依賴順序持續完成所有不受外部帳號阻擋的第一批正式需求。
- 外部服務尚未授權時，先完成正式adapter、token保護、錯誤處理、自動測試及設定文件；狀態只能標為`AWAITING_USER_SETUP`，不能以假資料宣稱串接完成。
- 需要使用者操作時，只要求當下不可替代的單一步驟，並先在`SETUP_CHECKLIST.md`寫好精確操作位置、要填的值、秘密保存位置及驗證方法。
- 使用者完成操作後，繼續完成真實授權、資料同步及驗收。

不可接受的行為包括但不限於：

- 擅自縮減需求或做MVP；
- 只做前端畫面；
- 寫死統計數字；
- 用mock或demo資料冒充真資料；
- 後端沒有指定運算卻顯示看似合理的結果；
- 未說明哪些功能沒做；
- 以之後會重寫的臨時資料結構交差；
- 在正式環境自動塞示範資料；
- 圖表沒有完整軸名、單位、刻度、圖例及計算定義；
- 在聊天中說完成，但需求狀態與測試證據沒有更新。

第一批正式版本必須完整涵蓋文件指定的基礎平台、每日／定期任務、財務、多幣別、資產／淨值、Firstrade CSV、社群分析、YouTube、Instagram、事件時間軸、內容比較、手動成交與轉化率、自定義領域／事業／指標／安全公式、重要期限、站內警告、Web Push、Resend電子郵件、PWA離線輸入與跨裝置同步，以及完整匯出備份。

請持續工作到所有不受外部條件阻擋的第一批需求均完成並通過部署閘門。每次準備結束工作前，必須輸出：

1. 已完成並驗證的需求ID；
2. 已實作但尚未真實驗收的需求ID；
3. 外部阻擋與使用者下一個操作；
4. 實際修改檔案與migration；
5. 執行過的測試命令、通過／失敗數；
6. 假資料／未實作／跳過測試掃描結果；
7. `IMPLEMENTATION_STATUS.md`及其他文件是否已更新。

不要用「核心功能完成」「基本完成」或「MVP已就緒」作為結論。只有`VERIFIED`才代表完成。
