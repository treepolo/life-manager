# 維運與部署

## 環境

- local：Wrangler 本機 Worker 與 D1。
- staging：`life-manager-staging` 與獨立 staging D1，Cloudflare Access 保護。
- production：正式 Worker／D1；本次改造不自動建立或部署 production。

## 零成本防線

有效外部資源只剩 Cloudflare Worker、Static Assets、D1 與 Access。不得自動升級付費方案。已退役的 YouTube、Instagram、Firstrade、Resend、Push 不再由新版程式執行同步、排程或傳送，因此也不再維護其產品額度邏輯。

## 正常部署流程

1. `npm run verify` 全部通過。
2. 備份目標 D1。
3. staging 套用尚未執行的 additive migration。
4. staging health、三頁 UI、CRUD、離線同步、跨裝置 pull、PWA 更新 smoke。
5. 確認 Access 邊界仍正確。
6. 才能考慮 production migration／deploy。

## 舊產品表清理閘門

`0001`～`0010` 建立的舊產品表目前可以留在 D1；新版不讀寫它們。禁止僅為了「看起來乾淨」就直接 drop。

只有同時符合以下條件，才可新增 cleanup migration：

1. 所有實際使用裝置的 IndexedDB outbox 都已確認為 0。
2. staging 與 production 目標 D1 均有當下 SQL 備份及 checksum。
3. 新版 `0011` 已在 staging 套用並完成 CRUD、離線恢復同步、跨裝置拉取、PWA 更新驗證。
4. 確認不再需要把舊產品正式資料轉換進新版模型；若要轉換，先另做明確 migration，不可在 drop 時臨時猜測。
5. cleanup migration 在全新資料庫從 `0001` 起完整重放可成功。

本改造分支不會在上述條件未確認時建立或套用 drop migration。

## PWA

build 後 Service Worker 必須含版本戳。既有裝置看到 waiting worker 時，outbox=0 才能按安全更新；手機提示固定在同步列與底部導覽上方。不得要求使用者清站台資料掩蓋更新問題。

## 回復

程式改造在獨立 branch／PR 進行；在合併或部署前都可以放棄 branch。資料庫變更以 additive migration 為主；真正破壞性清理前必須保有可驗證備份。
