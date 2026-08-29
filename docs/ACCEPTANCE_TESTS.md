# 驗收測試

## 自動化閘門

`npm run verify` 必須全部成功：lint、TypeScript、Vitest、Cloudflare Worker/D1 測試、client build、Playwright E2E、production placeholder/secret scan、需求覆蓋。

## 任務

- 建立分類，只輸入名稱與敘述。
- 建立每日任務，只輸入名稱、敘述與分類。
- 首頁立即出現該任務；當天可完成一次，完成數變化正確。
- 再點一次可撤銷完成；有效完成歷史消失，當天可以重新完成。
- 封存任務或分類後不出現在今日清單；恢復後重新出現，既有歷史不消失。
- 分類累積曲線按照完成紀錄逐日累積。

## 財務

- 兩個目標可設定、修改與清空。
- 可以新增固定月收入與積蓄歷史。
- 歷史可修改日期與金額；圖表立即依修正結果重算。
- 歷史可刪除；刪除最新值後，目前值回到上一筆有效紀錄。
- 同一天多筆只以最後建立且有效的一筆作該日圖表值。
- 未來日期紀錄不影響今天的目前值。

## 離線與同步

- 在線載入後離線新增分類與任務，本機可繼續使用且 outbox 增加。
- 恢復網路後可同步到 D1，outbox 回到 0。
- 同一實體離線連續修改合併為安全操作，不自己製造版本衝突。
- 尚未同步的新資料離線刪除時取消建立；既有資料刪除使用 `deletedAt`。
- 另一裝置可由 change cursor 拉到新版實體。
- 真正跨裝置版本衝突保留衝突紀錄。

## PWA

- client build 會替 Service Worker 寫入新版本戳。
- outbox 非 0 時不可安全接管 waiting worker。
- outbox 為 0 時安全更新可接管並重新載入。
- 不以清除 IndexedDB、Cache Storage 作為正常更新流程。

## 響應式

Playwright 驗證 320、390、768、1366、1920 寬度：沒有水平溢出；三個主要入口可達；更新提示不遮住手機底部導覽／同步列。

## 舊功能退役

舊 areas、finance analysis、social comparison、integrations、deadline completion 等 API 必須回 404；首頁與主導覽不得再顯示領域／事業、社群、期限、指標、外部連線等入口。

## 正式資料庫清理

這不是一般 CI 項目。新增 drop 舊表 migration 前必須人工確認：所有實際裝置 outbox=0、遠端 D1 已備份、新版 staging migration 與 smoke／跨裝置同步已驗證。任何一項未完成都不得 drop。
