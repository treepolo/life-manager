# 設定與上線檢查

## 本機

- [ ] Node 24 以上。
- [ ] `npm ci` 成功。
- [ ] `npm run db:migrate` 可從空白本機 D1 套用到 schema 11。
- [ ] `npm run verify` 全部通過。

## staging

- [ ] 先匯出 staging D1 SQL 備份。
- [ ] 套用 `0011_simple_core.sql`。
- [ ] health 回報 schema 11。
- [ ] Cloudflare Access 未登入仍阻擋，已登入本人可正常使用。
- [ ] 建分類、每日任務、完成／撤銷正常。
- [ ] 目標、收入／積蓄歷史新增／修改／刪除正常。
- [ ] 手機離線新增後恢復同步，另一裝置可拉到相同新版資料。
- [ ] PWA waiting worker 在 outbox=0 時可安全更新，不清除 IndexedDB。
- [ ] 320／390／768／1366／1920 介面 smoke 無水平溢出。

## production 前

- [ ] `master` 或待部署 commit 的完整 CI 綠燈。
- [ ] production D1 備份與 checksum 已保存。
- [ ] production Cloudflare Access 設定仍只允許本人。
- [ ] 先套 additive migration，再 deploy Worker；不在同一輪做未驗證的破壞性舊表清理。

## 舊表 cleanup 額外條件

- [ ] 所有實際裝置 outbox=0。
- [ ] staging／production 備份存在且可讀。
- [ ] 新版 staging 跨裝置同步與 PWA 驗證完成。
- [ ] 已明確決定舊資料不需轉換，或轉換 migration 已先完成。
- [ ] cleanup migration 可從空白資料庫完整重放。

任一項未完成，舊產品表繼續留在 D1；這不影響新版產品使用。
