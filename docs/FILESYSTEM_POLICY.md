# 檔案系統邊界與保留政策

> Wave 0 治理增量（2026-08-14，Asia/Taipei）。本檔只定義邊界、盤點與未來操作閘門；不執行清理、不移動檔案、不讀取或記錄真實資料／secret。

## 1. Canonical roots

以下路徑是本專案唯一核准的長期位置。需要建立新物件時，先以解析後的絕對路徑檢查 containment，再由該工作項目的 owner 及唯一 integrator 確認。

| 名稱 | 絕對路徑 | 用途與限制 |
|---|---|---|
| `PROJECT_ROOT` | `D:\人生管理器` | 唯一 canonical 專案根目錄。正式 source、文件、設定與 Git worktree 的根。 |
| `WORKTREE_ROOT` | `D:\人生管理器\.worktrees` | 未來新增 worktree 的唯一容器；不得建立在專案根外或 sibling 目錄。 |
| `BACKUP_ROOT` | `D:\人生管理器\backups` | 既有備份保留位置。只依明確 retention／restore drill 操作，不因本輪治理搬移或刪除。 |
| `TEMP_ROOT` | `D:\人生管理器\.tmp` | 專案暫存與可重建中間檔；保留期限與刪除須依第 4 節 checkpoint。 |

`D:\soft devloper\VC開發治理文件` 是外部、read-only 的治理來源，不是專案 root、source、worktree 或 backup root；不得複製進 repo。AppData／系統 Temp 等位置只可存在 unavoidable tool-owned cache，不得用來保存本專案 source、worktree 或備份。

## 2. 2026-08-14 targeted audit record

本次只做已核准範圍的 targeted inventory；以下紀錄存在與否及 policy disposition，不記錄其內容、檔案名以外的個資或 secret，也不代表已完成清理。

| 位置／觀測 | 結果 | 本輪處置 |
|---|---|---|
| `D:\人生管理器\.tmp` | 存在（3 個直接項目） | 保留；由 TEMP retention checkpoint 管理。 |
| `D:\人生管理器\.wrangler` | 存在（6 個直接項目） | 保留 tool/runtime artifact；不得當作 source、backup 或可提交證據。 |
| `D:\人生管理器\dist` | 存在（6 個直接項目） | 保留 generated build artifact；依 build retention 管理。 |
| `D:\人生管理器\test-results` | 存在（2 個直接項目） | 保留現有測試證據；不得在本輪刪除或重建。 |
| `D:\人生管理器\playwright-report` | 存在（2 個直接項目） | 保留現有視覺／E2E 證據；不得在本輪刪除或重建。 |
| `D:\人生管理器\backups` | 存在（12 個直接項目） | 保留既有備份；不得讀取內容、搬移或刪除。 |
| `D:\人生管理器-wt-firstrade`、`D:\人生管理器-wt-resend`、`D:\人生管理器-wt-web-push`、`D:\人生管理器-wt-web-push-final` | targeted check 均不存在 | 不建立、不清理；僅作歷史路徑不存在的證據。 |
| `C:\Users\gg013\.codex\worktrees\ef2b\人生管理器`、`...\人生管理器-n2` | targeted check 均不存在 | 不建立、不清理；不擴大掃描。 |
| `git worktree list` | 僅列出 `D:/人生管理器`，HEAD `d7bc306030bd7a1e29182fdbd921eb077249f9b0` | current canonical worktree；不 switch、reset、checkout 或建立 sibling worktree。 |

上述是 audit snapshot，不是「全部磁碟已掃描」的宣稱。未來若需要更大範圍 inventory，必須先產生明確 scope、owner、目的與 approval checkpoint。

## 3. Containment 與寫入規則

- 新 worktree 的 resolved path 必須位於 `WORKTREE_ROOT` 之下，且不能以 prefix 相似但實際越界的 sibling path 通過檢查；建立後以 `git worktree list` 驗證。
- source、migration、測試與設定只能在 canonical worktree 中依任務授權修改。外部治理來源保持 read-only。
- backup 內容視為高敏感度／可能含真實資料：建立時記錄 metadata、來源 commit、schema／用途與 retention owner；文件不得寫出秘密、token、帳密、未遮蔽 CSV 或付款識別。
- `.wrangler`、`dist`、`test-results`、`playwright-report` 等 generated artifacts 不得被當作正式 source 或 current product evidence；只在其所屬工具流程需要時產生，並依 retention 留存。
- `.tmp` 只放可重建的中間資料；任何不可重建或含真實資料的內容不得放入其中。

## 4. Cleanup checkpoint

清理不是「順手刪除」。每一次未來 cleanup 都必須依序留下可核對的記錄：

1. `inventory`：列出明確絕對路徑、owner、類型、大小／數量摘要與 retention 判定；不得用未解析的 glob 直接作為刪除目標。
2. `approval`：由 scope owner 與唯一 integrator 確認可刪除、保留期限已到、沒有 restore／audit 依賴；涉及真實資料或 backup 時增加人類 checkpoint。
3. `verified delete`：只對已核准的狹窄目標執行可恢復或明確刪除，完成後重新確認路徑不存在且 worktree／Git 狀態未被改動。

Wave 0 不執行任何 cleanup，也不刪除既有 `.tmp`、`.wrangler`、`dist`、測試報告或 `backups`。新建 worktree、備份 retention、generated artifact retention 與 cleanup 必須在對應 wave 另行驗證。

## 5. Traceability

本政策對應 `REM-FS-001`、`AT-REM-FS-001`～`AT-REM-FS-006`，Requirement current status 以 `docs/IMPLEMENTATION_STATUS.md` 為準；本檔不是功能完成或清理完成的宣稱。
