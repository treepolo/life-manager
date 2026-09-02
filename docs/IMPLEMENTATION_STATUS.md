# 實作狀態

本表追蹤 2026-08-30 精簡改造後的有效需求與目前 production 狀態。舊版完整狀態由 Git 歷史保留。

| 需求 | 狀態 | 證據／目前狀態 |
|---|---|---|
| PROD-001~004 | VERIFIED | 首頁／每日任務／設定三頁、現行資料模型、通用 API 與 Worker 已完成；staging 與 production 均已上線。 |
| PROD-005 | VERIFIED | 正式舊表清理安全閘門已明確實作；目前仍刻意不 drop 舊表，破壞性 cleanup 會獨立執行。 |
| TASK-001~006 | VERIFIED | 任務／分類建立編輯、封存／恢復、每日完成／撤銷、分類與任務成果累積皆已通過單元、Worker/D1 與 Playwright 驗證。 |
| FIN-001~006 | VERIFIED | 固定月收入、淨資產目標與歷史新增／修改／刪除、目前值與圖表均已驗證；舊 `SAVINGS` 相容轉為 `NET_WORTH`。 |
| UI-001~006 | VERIFIED | 三頁紙張／蠟筆介面、成果圖、人口比較與 responsive layout 已通過桌機、大桌機、平板與兩種手機 viewport 驗證。 |
| OFF-001~005 | VERIFIED | IndexedDB、outbox、跨裝置 pull、衝突機制與 PWA 安全更新皆保留並通過回歸。 |
| OPS-001~004 | VERIFIED | Cloudflare/D1/Access/PWA 底座、CI、production readiness 與 deployment gate 已完成並實際經過 staging／production cutover。 |
| OPS-005 | VERIFIED | 破壞性舊表 cleanup 維持獨立安全程序；未把 drop migration 混入一般 production cutover。 |

## Production cutover 完成事項

- production `wrangler.toml` 已綁定正式 D1 與 Cloudflare Access。
- production D1 已建立可驗證備份並套用 `0011`～`0013`，application schema version = 13。
- staging → production 資料 promotion 已完成：現行六張業務表逐表比對一致、外鍵檢查通過，並建立 production 自己的同步 change seed。
- 正式 Worker 已上線；既有資料可見，實際寫入後 outbox=0，重新整理後資料仍存在。
- `ENABLE_PRODUCTION_DEPLOY=true` 已啟用，後續 `master` 只有完整 Verify 成功後才自動發布 production。

## D 階段進度

已完成：

- README、專案指南、實作狀態、維運與設定檢查文件已同步 production 現況、schema 13 與「淨資產」術語。
- 移除退役的 Web Push、CSV／Firstrade、排程與未使用 Vite/PWA/Tailwind plugin 依賴；完整 Verify 通過後才保留變更，安裝套件數由約 623 降至約 330。
- 移除已無引用的舊 money／time utility 與 `decimal.js`；並移除 Worker 測試中的舊 OAuth binding。
- client 已做 route lazy loading，首頁 Recharts 圖表亦獨立 lazy load；最大單一 JS chunk 由約 775 KB 降至約 395 KB，初始 app chunk 約 263 KB，完整 Verify 通過。
- 本輪 dependency、repo audit、decimal、code-split probe branches 已移除；暫時 workflow 也未留在正式 cleanup branch。
- 靜態 unused-code audit 已完成；對仍可能是模組 API／工具入口的 unused export 不為追求零警告而強行移除，避免低收益回歸。

尚待完成：

- `cleanup/post-cutover-20260902` 做最終完整 Verify，確認文件、依賴、source cleanup 與 code splitting 的整體組合全部通過。
- 大量歷史 Codex／ops／refactor 分支多數未合併進 `master`，不自動刪除；若要收斂，另做明確歷史分支清理決策。
- 正式舊表清理尚未執行；執行前再次確認所有實際裝置 `outbox=0`、建立當下 production 備份、在非 production 完整重放 cleanup migration，cleanup 後再驗證現行六張業務表與正式 CRUD／同步。
