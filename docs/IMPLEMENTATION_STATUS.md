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

## D 階段進行中

- 同步仍停留在 schema 11、積蓄、尚未 production 上線等舊文件敘述。
- 收斂大量歷史 Codex／ops／refactor 分支，只保留仍有用途的長期分支。
- 確認並移除未使用 npm 依賴／舊腳本，不以猜測刪除。
- 評估 bundle/code splitting 與其他 repo hygiene。
- 正式舊表清理尚未執行；執行前再次確認所有實際裝置 `outbox=0`、建立當下 production 備份、在非 production 完整重放 cleanup migration，cleanup 後再驗證現行六張業務表與正式 CRUD／同步。
