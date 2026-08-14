# Governance Retrofit Plan／Current Wave Index

> 唯一 Wave 0–5 治理索引（2026-08-14，Asia/Taipei）。本檔是 scope、dependency、owner 與 wave 的索引，不取代功能狀態帳本；每個 Requirement 的 current status 只以 `docs/IMPLEMENTATION_STATUS.md` 為準。

## 1. Current truth boundary

目前 canonical release truth 是：`d7bc306030bd7a1e29182fdbd921eb077249f9b0` 已 push；`migrations/0011_cost_guardrails.sql` 與 `migrations/0012_cost_guardrail_atomic_transitions.sql` 尚未套用 staging；成本防線尚未 deploy；`SOC-009`／`SOC-010`／`DDL-009`、`SETUP-003`～`SETUP-005` 的 current status 是 `EXTERNAL_BLOCKED`；`NFR-001`／`OPS-002` 是 `IN_PROGRESS`；X frozen；external provider quota／billing truth unknown。舊 `SETUP-005`、舊 `AT-GATE-08` 與 dated deployment／provider evidence 仍保留，但必須標示 `Historical`／`Superseded by 2026-08-14 cost gate`，不能當 current release evidence。

本次生效的上位治理來源為外部 read-only `Layer 1｜AI 軟體開發與產品治理原則.md` 與 `Layer 2｜新專案規劃與 Codex 規格生成 Chat 指令.md`；Orchestrator 已於 2026-08-14 以 UTF-8 完整讀取至 EOF，確認兩檔存在並納入本輪治理依據。本 plan 只落地核准的治理 delta，不複製外部全文。Worker 無法獨立存取該外部路徑屬執行環境 visibility limitation；Orchestrator evidence仍是本輪權威依據，該執行環境限制不產生專案阻擋。後續只需在來源 revision／版本漂移時重新做 read-only核對並由唯一 integrator更新衝突紀錄。

## 2. Requirement index

| Requirement | Wave | Dependency | Owner type | Affected existing IDs | Acceptance family | Current status |
|---|---:|---|---|---|---|---|
| `REM-GOV-001` | 0 | current/history inventory；canonical status source | Wave 0／final integrator | `SETUP-005`、舊 `AT-GATE-08`、dated release evidence | `AT-REM-GOV-*` | `VERIFIED`（static current/history verifier） |
| `REM-GOV-002` | 0 | control／execution role與report envelope | Wave 0／final integrator | `AGENTS.md`、中央 docs | `AT-REM-GOV-*` | `IN_PROGRESS` |
| `REM-FS-001` | 0 | targeted inventory；retention owner | Wave 0／ops owner | `WORKTREE_CLEANUP_TODO.md`、`OPS-004` | `AT-REM-FS-*` | `IN_PROGRESS` |
| `REM-REL-001` | 1 | task／schedule schema與API contract | backend/API/migration owner（單一） | `TASK-001`～`TASK-004` | `AT-REM-REL-*` | `NOT_STARTED` |
| `REM-ASYNC-001` | 1 | shared persisted job contract | backend/API-data owner＋shared UI owner | `TASK-003`、`SOC-009`／`SOC-010`、`OPS-003` | `AT-REM-ASYNC-*` | `NOT_STARTED` |
| `REM-NAV-001` | 2 | API reachability map；mobile route budget | frontend owner（單一） | `UI-001`～`UI-006`、`OFF-001` | `AT-REM-NAV-*` | `NOT_STARTED` |
| `REM-FORM-001` | 2 | API schema與dependency contract | frontend owner（單一） | `CORE-001`～`CORE-007`、`SOC-009`／`SOC-010`、`SETUP-*` | `AT-REM-FORM-*` | `NOT_STARTED` |
| `REM-INT-001` | 3 | provider/account cardinality與history policy | integration/cost integrator（單一） | `SOC-009`／`SOC-010`、`DDL-009`、`SETUP-003`～`SETUP-005` | `AT-REM-INT-*` | `NOT_STARTED` |
| `REM-TABLE-001` | 3 | server query contract與archive semantics | frontend＋API owner，唯一 integrator | `CORE-*`、`FIN-*`、`SOC-*`、`OPS-*` | `AT-REM-TABLE-*` | `NOT_STARTED` |
| `REM-REL-002` | 0→4 | d7bc306 evidence；0011／0012；backup／rollback；staging | integration/cost integrator（單一） | `NFR-001`、`OPS-002`、`SETUP-010` | `AT-REM-REL-*` | `IN_PROGRESS` |

`IMPLEMENTED_UNVERIFIED` 是 `IN_PROGRESS` 的較細分；`EXTERNAL_BLOCKED` 是外部依賴阻擋，不等同 `AWAITING_USER_SETUP`。不得為了套用上位治理字面集合而重設既有狀態；未受影響的 `VERIFIED` 保留。

## 3. Wave boundaries

| Wave | 交付邊界 | 禁止／完成閘門 |
|---:|---|---|
| 0 | current/history reconciliation、治理角色／liveness、filesystem policy、Requirement／Acceptance／Traceability 索引 | 只改 docs/governance；不改產品、不執行 cleanup、migration、OAuth、deploy；唯一 writer／唯一 integrator。 |
| 1 | task＋schedule atomicity、persisted async backend/API/data contract | 先固定 schema／API／idempotency與recovery acceptance；不得讓 UI 猜測未定義 contract。 |
| 2 | shared async UI、desktop/mobile/narrow navigation、form burden remediation | mobile 不刪 capability；真實 phase/counter；需 UI／visual/mobile與離線 recovery evidence。 |
| 3 | integration lifecycle與server-side table/query remediation | 不新增同 provider 多帳號；disconnect 預設保留 history；provider failure／reauth／archive evidence 必須可追溯。 |
| 4 | cost guardrail integration、0011／0012 safe staging apply、backup／rollback與受影響 regression | 必須 human checkpoint；local estimate 不得冒充 invoice truth；不以 staging 空用量推論 production 安全。 |
| 5 | final merge、deploy、real scenario／external regression與 release decision | 唯一 integrator；production、billing、OAuth、cleanup 由人類核准；所有未完成項目仍如實保留。 |

## 4. Human checkpoints

| Checkpoint | 觸發條件 | 必須由誰確認 | Wave 0 結果 |
|---|---|---|---|
| H-02 migration safety | staging／production 套用 0011／0012 | integration/cost integrator＋人類 | 未執行；remote apply 仍是下游 work。 |
| H-03 provider／billing truth | OAuth、quota、invoice、checkout、hard cap | 帳戶／平台管理者 | unknown；不得標 cost release。 |
| H-04 deploy／release | staging deploy 或 production go-live | 唯一 integrator＋人類 | 未執行；X frozen。 |
| H-05 cleanup／restore | 刪除 artifact、worktree、backup 或 restore | ops owner＋人類 | 未執行；依 `FILESYSTEM_POLICY.md`。 |

外部治理 source revision／版本漂移是持續的 read-only review risk，不是 Wave 0 blocker；不要求使用者重新提供已由 Orchestrator 確認的兩份來源。

## 5. Single-writer conflict map

- Central docs：Wave 0／final integrator 單一 writer。
- Task atomicity＋async API/data：Wave 1 單一 backend/API/migration owner。
- Shared async UI：單一 shared UI owner。
- Navigation/forms：單一 frontend owner；等待 API contract 時不可猜。
- Integrations／cost／provider sync／0011／0012／IntegrationsPage：單一 integration/cost integrator。
- Final merge／deploy／regression：唯一 integrator。

本索引及相關中央文件不能由多個 worker 併寫；worker 必須 dispatch-and-yield 並送出完整 report envelope。

## 6. Acceptance and evidence rule

Requirement families 為 `AT-REM-GOV-*`、`AT-REM-FS-*`、`AT-REM-REL-*`、`AT-REM-ASYNC-*`、`AT-REM-NAV-*`、`AT-REM-FORM-*`、`AT-REM-INT-*`、`AT-REM-TABLE-*`。每項至少有 semantic、interaction、visual/mobile、recovery、security、real scenario；不適用項明列原因。Wave 0 只可驗證文件與靜態 boundary；所有 runtime、external、human acceptance 未執行前，不得寫成 `PASSED` 或 `VERIFIED`。

## 7. Current wave handoff

Wave 0 的下一個 runnable owner 是：由唯一 integrator 依本索引 dispatch Wave 1 backend/API-data owner，先針對 `REM-REL-001`／`REM-ASYNC-001` 建立 contract、migration plan、固定答案與 recovery test plan；不得在沒有 contract 的情況下先改 shared UI。Wave 0 不自行開啟或喚醒該 worker。
