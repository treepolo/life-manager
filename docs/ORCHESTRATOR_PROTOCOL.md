# Control Plane／Execution Plane 協作協定

> Wave 0 治理增量（2026-08-14）。本檔是 repo 內唯一的協作行為契約；current 功能狀態仍只由 `docs/IMPLEMENTATION_STATUS.md` 宣告，wave／owner index 由 `docs/GOVERNANCE_RETROFIT_PLAN.md` 維護。

## 1. 角色與權限邊界

- **Control Plane／主控**：由 Sol Xhigh 擔任。負責拆分需求、選定 owner、設定風險／情境 checkpoint、dispatch、整合、驗證與向使用者回報；主控不直接實作 worker 被分派的產品或文件變更。
- **Execution Plane／Worker**：預設使用 Luna MAX。Worker 只在明確 scope、允許檔案與 owner 內執行，需在工作完成、移交、依賴阻擋、人類阻擋或 escalation 前主動回報；不得 silent stop、不得自行開下一 wave、不得喚醒其他 worker。
- **Human checkpoint owner**：處理 OAuth、付款／quota／billing、真實 provider、production deploy、migration apply、資料／backup cleanup 等不可由文件推定的風險決策。
- **唯一 integrator**：每一 wave 只允許一個 integrator 將 worker 輸出整合到 canonical worktree、執行 final regression、更新中央狀態並作 commit／push；其他 worker 不得平行寫同一中央文件或同一 integration surface。

模型路由是治理約束，不是未執行工作的證據。若指定模型或工具不可用，worker 必須回報 `NEEDS_ESCALATION`，不能自行改用未核准模型或假設已完成。

## 2. Dispatch-and-Yield lifecycle

1. Control Plane 建立 task envelope：Task ID、parent thread、requirement／acceptance IDs、scope、允許檔案、禁止操作、owner、依賴、human checkpoint、預期報告時間與 status vocabulary。
2. Worker 先唯讀核對 branch／HEAD／worktree、文件與現況，記錄衝突；若起點不符，停止寫入並回報 `HANDOFF_REQUIRED`。
3. Worker 只在授權範圍內執行，持續維持 project liveness：開始、長時間工具、風險、阻擋、完成均需有可追蹤更新。
4. Worker 在可交付或無法繼續時主動 yield，送出 report envelope；Control Plane 再決定整合、補派、轉換 owner 或 human checkpoint。
5. Worker 不以聊天中的「大致完成」取代檔案、測試、commit、push、current status 與 acceptance evidence。

## 3. Worker report envelope

每次完成／handoff／阻擋回報至少包含：

- `status`：只用 `DONE`、`HANDOFF_REQUIRED`、`BLOCKED_DEPENDENCY`、`BLOCKED_HUMAN`、`NEEDS_ESCALATION`；
- Task ID、parent thread、branch、HEAD、commit／push 結果；
- 完成項目與實際修改檔案；
- Requirement→Acceptance→Traceability→Status 對應及 evidence 路徑；
- 未完成、具體 blocker、next owner 與仍可立即執行的 runnable work；
- migration／external action／secret handling 的明確「未執行」或證據。

`DONE` 只表示本 task 的授權範圍已完成，不代表整個產品或下游 wave 完成。Acceptance 未執行時必須寫 `NOT_RUN`／`AWAITING_USER_SETUP`／`EXTERNAL_BLOCKED` 等真實狀態，不得標 `PASSED`。

## 4. Liveness、single-writer 與 VERIFIED 保留

- Control Plane 必須能從 task envelope、worker report、commit／push 與 status ledger 判斷專案是否仍有 owner；沒有回報不能被解讀為成功。
- 中央治理文件（`AGENTS.md`、需求／矩陣／驗收／狀態／操作／設定及本治理索引）由 Wave 0／final integrator 單一 writer 維護。
- task atomicity／async API-data、shared async UI、navigation／forms、integration／cost／provider sync、final deploy／regression 各自只能有一個 active owner；等待契約的 owner 不得猜測 API。
- 已有 `VERIFIED` 且未被 current evidence 直接影響的需求不得無故重做；受影響 subsystem 要新增明確 regression scope，不以全面重跑掩蓋狀態漂移。

## 5. Risk 與 security checkpoints

涉及真實帳戶、外部 quota／billing、migration apply、production、backup restore、清理、未遮蔽資料或 secret 的動作，都要在 dispatch 前標為 human checkpoint；文件治理 worker 不得代替該決策。任何 token、API key、帳密、付款識別或完整外部 payload 都不得進入 source、Git、log、snapshot 或 Markdown。

Filesystem containment 依 `docs/FILESYSTEM_POLICY.md`；本 wave 不建立外部 worktree、不清理 artifact、不部署、不套用 migration。

## 6. Acceptance

本協定對應 `REM-GOV-002`、`AT-REM-GOV-007`～`AT-REM-GOV-012`。協作 protocol 本身的文件檢查可驗證；尚未執行的跨 worker／human 行為仍不可宣稱通過。
