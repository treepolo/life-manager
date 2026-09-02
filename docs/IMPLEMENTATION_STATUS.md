# 實作狀態

本表追蹤 2026-08-30 精簡改造後的有效產品與維運狀態。舊版完整狀態由 Git 歷史保留。

| 項目 | 狀態 | 證據／剩餘工作 |
|---|---|---|
| 核心產品改造 | VERIFIED | 首頁／每日任務／設定三頁、新版通用 API、離線同步與 Worker 已完成並通過完整 Verify。 |
| 任務／分類 | VERIFIED | 建立、編輯、封存／恢復、每日完成／撤銷、分類累積成果皆已驗證。 |
| 任務成果／里程碑 | VERIFIED | 成果名稱／單位、週期里程碑級距、金色／琥珀色分級與固定里程碑文案已完成並由 staging 驗收。 |
| 財務 | VERIFIED | 固定月收入、淨資產目標與歷史新增／修改／刪除、目前值與圖表已驗證；`SAVINGS` 舊語意相容轉為 `NET_WORTH`。 |
| 台灣人口比較 | VERIFIED | 收入／資產分布模型、runtime 比較卡與資料驗證已納入 Verify。 |
| 個人資料 | VERIFIED | 出生日期與生日年度進度已納入現行資料模型。 |
| 離線／同步／PWA | VERIFIED | IndexedDB、outbox、跨裝置 pull、衝突機制與 PWA 安全更新皆保留並通過回歸。 |
| staging | LIVE | 獨立 Worker、D1、Cloudflare Access 與自動部署流程已運作。 |
| production | LIVE | production D1／Access／Worker 已完成 cutover；正式 D1 schema 13，staging 業務資料已 promotion，production 實際讀寫與同步已驗收。 |
| production 自動部署 | ENABLED | `ENABLE_PRODUCTION_DEPLOY=true`；只有 `master` 完整 Verify 成功後才允許部署。 |
| 舊產品表 cleanup | PENDING_DESTRUCTIVE_CLEANUP | 安全前置條件已大致完成，但尚未建立／執行 drop 舊產品表 migration；必須獨立驗證與保留可回復備份。 |
| Repo hygiene | IN_PROGRESS | 文件、舊分支、未使用依賴與歷史命名仍在 D 階段清理。 |

## Production cutover 完成事項

- production `wrangler.toml` 已綁定正式 D1 與 Cloudflare Access AUD。
- production D1 已在 migration 前建立完整備份並套用 `0011`～`0013`。
- staging → production 資料 promotion 已完成：現行六張業務表逐表比對一致，外鍵檢查通過，並建立 production 自己的同步 change seed。
- 正式 Worker 已上線，使用者確認既有資料可見，並完成實際寫入／同步驗證。
- `ENABLE_PRODUCTION_DEPLOY=true` 已啟用後續 `master` 自動發布。

## D 階段尚未完成

- 更新所有仍停留在 schema 11、積蓄、尚未 production 上線等舊敘述的文件。
- 收斂大量歷史 Codex／ops／refactor 分支，只保留仍有用途的長期分支。
- 確認並移除未使用 npm 依賴／舊腳本，不以猜測刪除。
- 評估 bundle/code splitting 與其他 repo hygiene。
- 舊 D1 產品表只在新的破壞性 cleanup migration 完成完整重放、備份與驗證後才移除；此工作與一般程式 cleanup 分開執行。
