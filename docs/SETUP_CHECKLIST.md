# 設定與上線檢查

## 本機

- [ ] Node 24 以上。
- [ ] `npm ci` 成功。
- [ ] `npm run db:migrate` 可從空白本機 D1 完整套用 migration 到 application schema 13。
- [ ] `npm run verify` 全部通過。

## staging

- [x] 獨立 staging Worker／D1 已建立。
- [x] Cloudflare Access 未登入阻擋、已登入本人可使用。
- [x] `0011`～`0013` 已套用，health／schema 13 正常。
- [x] 分類、每日任務、完成／撤銷與成果／里程碑流程已驗證。
- [x] 固定月收入／淨資產目標與歷史新增／修改／刪除正常。
- [x] 離線 outbox、恢復同步與跨裝置資料拉取已驗證。
- [x] PWA 更新與 320／390／768／1366／1920 介面回歸已驗證。

## production cutover

- [x] `master` 完整 CI 綠燈。
- [x] production D1 綁定與 Cloudflare Access 設定完成。
- [x] production D1 migration 前備份與 checksum 已建立。
- [x] `0011`～`0013` 已套用，application schema 13。
- [x] 正式 Worker 已部署。
- [x] staging 現行業務資料已 promotion 到 production，逐表比對／外鍵檢查／sync seed 驗證通過。
- [x] 正式站既有資料可見，實際寫入與同步正常。
- [x] `ENABLE_PRODUCTION_DEPLOY=true` 已啟用。

## 每次 production migration／資料操作前

- [ ] 所有實際裝置 outbox=0。
- [ ] 當下 production D1 已備份且可讀，保存 checksum。
- [ ] 相同變更已先在非 production 完整驗證。
- [ ] Access 邊界仍只允許預期使用者。
- [ ] migration／資料操作與 Worker deploy 的順序已明確，不把未驗證的破壞性清理混入一般發布。

## 舊表 cleanup 額外條件

- [ ] staging／production 當下備份存在且可讀。
- [ ] 已明確確認舊產品資料不再需要轉換。
- [ ] cleanup migration 可從空白資料庫由 `0001` 起完整重放。
- [ ] cleanup migration 已通過 Worker、單元與 E2E regression。
- [ ] production 執行 cleanup 前再建立一份新備份。
- [ ] cleanup 後重新確認 schema 13、現行六張業務表、正式 CRUD／同步正常。

任一 cleanup 條件未完成，舊產品表繼續留在 D1；這不影響現行產品使用。
