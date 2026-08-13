# Worktree 收斂與 C 槽清理待辦

狀態：`VERIFIED`

建立日期：2026-08-12

正式專案唯一保留位置：`D:\人生管理器`

## 必須完成的結果

- 最終程式碼、正式文件、Git branch 與驗收證據都必須收斂回 `D:\人生管理器`。
- C 槽不得留下本專案的 Codex worktree、`node_modules` 或建置產物。
- A／B／C／D／N 等輔助 worktree 在成果合併、推送及驗收完成後都必須移除，不保留多份專案資料夾。
- 後續若仍需建立 worktree，只能明確建立於 `D:\人生管理器-wt-*`；不得再使用 Codex 預設的 `C:\Users\gg013\.codex\worktrees\*`。

## 原先不得刪除（已完成收斂後清理）

- `C:\Users\gg013\.codex\worktrees\ef2b\人生管理器-n2` 曾在 B／C／D 全部收斂及主線確認前保留；現已完成 clean、remote HEAD 與 ancestry 核對後移除。
- 任何 `git status` 非乾淨、尚未 push、或尚未整合回正式 D 槽專案的 worktree：本次核對沒有發現此類阻擋。

## 收斂順序

- [x] N2 完成測試、commit 並 push `codex/fix-notification-shared-2`（`724fa63b9588130b7719b92713cfaa36d83278fb`）。
- [x] 在 `D:\人生管理器` 核對遠端 N2 commit，完成 N2／C final 證據整合與 staging 重部署；最新 version `db41ff0c-7864-43d2-9a98-54000cebfa92` 為 100% active，未執行 migration。
- [x] 由主線喚醒 C 線，依 `SETUP-006` 重驗兩台真人裝置及 `AT-PUSH-01`；電腦 `ACTIVE` 且收件、手機 `DISABLED` 且未收件，UI／API／D1／delivery一致，Push需求已`VERIFIED`。
- [x] B／C 最終驗收完成；B `300b3d71742024bb28915f6bd55d29a9110237b6`、C `f032a5bd60c5b6ecd8d09d38c5ec381c811bd1ec`及相關正式文件與證據已合併回 `D:\人生管理器`。
- [x] 最終整合與 `AT-GATE-08` 完成；A branch已保留B/C/D/N2歷史，staging與remote migration狀態已核對。最終A commit／push SHA：`a7a7cd4e0c81fd45e73a3cb77521535ad56d7f06`。
- [x] 逐一核對所有輔助 worktree：branch、HEAD、`git status`、遠端 HEAD 與合併狀態均符合預期；canonical `D:\人生管理器`亦 clean。
- [x] 使用 `git worktree remove` 移除已安全收斂的 D 槽輔助 worktree：
  - `D:\人生管理器-wt-firstrade`
  - `D:\人生管理器-wt-resend`
  - `D:\人生管理器-wt-web-push`
  - `D:\人生管理器-wt-web-push-final`
- [x] 使用 `git worktree remove` 移除下列 C 槽 worktree：
  - `C:\Users\gg013\.codex\worktrees\ef2b\人生管理器`
  - `C:\Users\gg013\.codex\worktrees\ef2b\人生管理器-n2`
- [x] 執行 `git worktree prune`；`git worktree list --porcelain`現只登記canonical `D:\人生管理器`。
- [x] 確認 `C:\Users\gg013\.codex\worktrees` 下不再存在本專案副本、依賴或建置產物；本次精確清理的六個路徑均不存在。
- [x] 確認 `D:\人生管理器\docs` 包含最新 `IMPLEMENTATION_STATUS.md`、`TRACEABILITY_MATRIX.md`、`ACCEPTANCE_TESTS.md`、`OPERATIONS.md`、`SETUP_CHECKLIST.md` 與全部驗收證據。
- [x] 確認 `D:\人生管理器` worktree clean、遠端同步、沒有遺漏分支成果；本待辦狀態改為 `VERIFIED`。

## 實際清理結果（2026-08-13）

- 保留：`D:\人生管理器`／`codex/accept-external-integrations`／`a7a7cd4e0c81fd45e73a3cb77521535ad56d7f06`。
- 已移除：上列四個 D 槽 line worktree，以及兩個 C 槽 Codex worktree；均在移除前確認 clean、已 push、source SHA 已納入 A ancestry，未使用 `--force`，未刪除 branch。
- `git worktree prune`後只剩 canonical worktree；暫時 E2E `L:`映射已解除。

## 安全限制

- 不得手動複製檔案取代 Git 整合；以 commit／merge 保留來源與歷史。
- 不得在未確認遠端 HEAD 與 worktree clean 前刪除任何資料夾。
- 不得使用 `git reset --hard`、`git checkout --` 或直接遞迴刪除來處理尚未收斂的變更。
- 清理完成後，`D:\人生管理器` 是唯一正式來源；其他 worktree 不得被當作最終文件來源。
