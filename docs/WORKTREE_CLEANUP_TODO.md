# Worktree 收斂與 C 槽清理待辦

狀態：`IN_PROGRESS`

建立日期：2026-08-12

正式專案唯一保留位置：`D:\人生管理器`

## 必須完成的結果

- 最終程式碼、正式文件、Git branch 與驗收證據都必須收斂回 `D:\人生管理器`。
- C 槽不得留下本專案的 Codex worktree、`node_modules` 或建置產物。
- A／B／C／D／N 等輔助 worktree 在成果合併、推送及驗收完成後都必須移除，不保留多份專案資料夾。
- 後續若仍需建立 worktree，只能明確建立於 `D:\人生管理器-wt-*`；不得再使用 Codex 預設的 `C:\Users\gg013\.codex\worktrees\*`。

## 目前不得刪除

- `C:\Users\gg013\.codex\worktrees\ef2b\人生管理器-n2`
  - 目前 branch：`codex/fix-notification-shared-2`
  - N2 source `724fa63b9588130b7719b92713cfaa36d83278fb` 已測試、commit 並 push；在 B／C／D 全部收斂及主線確認前仍不得清理。
- 任何 `git status` 非乾淨、尚未 push、或尚未整合回正式 D 槽專案的 worktree。

## 收斂順序

- [x] N2 完成測試、commit 並 push `codex/fix-notification-shared-2`（`724fa63b9588130b7719b92713cfaa36d83278fb`）。
- [x] 在 `D:\人生管理器` 核對遠端 N2 commit，完成 N2／C final 證據整合與 staging 重部署；最新 version `db41ff0c-7864-43d2-9a98-54000cebfa92` 為 100% active，未執行 migration。
- [ ] 由主線喚醒 C 線，依 `SETUP-006` 重驗兩台真人裝置及 `AT-PUSH-01`；本項尚未完成，不得將 Push 需求升為 `VERIFIED`。
- [ ] B／C 最終驗收完成，所有相關正式文件與證據合併回 `D:\人生管理器`。
- [ ] 最終整合與 `AT-GATE-08` 完成，確認 canonical branch 已 push。
- [ ] 逐一核對所有輔助 worktree：branch、HEAD、`git status`、遠端 HEAD 與合併狀態。
- [ ] 使用 `git worktree remove` 移除已安全收斂的 D 槽輔助 worktree。
- [ ] 使用 `git worktree remove` 移除下列 C 槽 worktree：
  - `C:\Users\gg013\.codex\worktrees\ef2b\人生管理器`
  - `C:\Users\gg013\.codex\worktrees\ef2b\人生管理器-n2`
- [ ] 執行 `git worktree prune`，確認 Git 不再登記已移除 worktree。
- [ ] 確認 `C:\Users\gg013\.codex\worktrees` 下不再存在本專案副本、依賴或建置產物。
- [ ] 確認 `D:\人生管理器\docs` 包含最新 `IMPLEMENTATION_STATUS.md`、`TRACEABILITY_MATRIX.md`、`ACCEPTANCE_TESTS.md`、`OPERATIONS.md`、`SETUP_CHECKLIST.md` 與全部驗收證據。
- [ ] 確認 `D:\人生管理器` worktree clean、遠端同步、沒有遺漏分支成果，再將本待辦改為 `VERIFIED`。

## 安全限制

- 不得手動複製檔案取代 Git 整合；以 commit／merge 保留來源與歷史。
- 不得在未確認遠端 HEAD 與 worktree clean 前刪除任何資料夾。
- 不得使用 `git reset --hard`、`git checkout --` 或直接遞迴刪除來處理尚未收斂的變更。
- 清理完成後，`D:\人生管理器` 是唯一正式來源；其他 worktree 不得被當作最終文件來源。
