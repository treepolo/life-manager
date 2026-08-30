# 維運與部署

## 環境

- local：Wrangler 本機 Worker 與 D1。
- staging：`life-manager-staging` 與獨立 staging D1，Cloudflare Access 保護。
- production：正式 Worker／D1；只有 production readiness、安全門檻與自動部署開關都就緒後才允許部署。

## 零成本防線

有效外部資源只剩 Cloudflare Worker、Static Assets、D1 與 Access。不得自動升級付費方案。已退役的 YouTube、Instagram、Firstrade、Resend、Push 不再由新版程式執行同步、排程或傳送，因此也不再維護其產品額度邏輯。

## GitHub Actions 自動部署

同一個 `Verify` workflow 負責驗證與部署，部署 job 必須 `needs: verify`，因此只有完整 CI 成功後才可能執行。

### GitHub Secrets

Repository secrets 必須設定：

- `CLOUDFLARE_API_TOKEN`：Cloudflare API Token。CI 為非互動環境，不能使用本機 `wrangler login` OAuth 狀態。
- `CLOUDFLARE_ACCOUNT_ID`：Worker 所屬 Cloudflare Account ID。

Token 只授予部署 Worker 所需權限，不得把 token 寫入 repo、Wrangler vars 或一般 GitHub Variables。

### GitHub Variables

- `ENABLE_STAGING_DEPLOY=true`：允許 `refactor/core-life-manager` 的 push 在 Verify 成功後自動部署 staging。
- `ENABLE_PRODUCTION_DEPLOY=true`：允許 `master` 的 push 在 Verify 成功後自動部署 production。

兩個開關預設都視為關閉；未設定或不是字串 `true` 時 deployment job 直接跳過。

### staging

目前開發分支為 `refactor/core-life-manager`。啟用 `ENABLE_STAGING_DEPLOY=true` 後，流程為：

1. push 到 `refactor/core-life-manager`。
2. Node 24 Linux CI 執行完整 `npm run verify`。
3. Verify 成功後，部署 job 重新安裝鎖定依賴並產生 production client build。
4. Wrangler 使用 GitHub Secrets 直接部署 `--env staging`。

因此正常開發不再需要在 Windows 本機 `git pull` 後手動執行 `npm run deploy:staging`。本機部署腳本保留作緊急備援。首次啟用自動部署時，以純文件 commit 執行一次 smoke test，確認 Verify 成功後確實能部署到既有 staging Worker。

### production

production 自動部署流程已存在，但 `ENABLE_PRODUCTION_DEPLOY` 在正式安全門檻完成前必須保持關閉。

即使開關被誤設為 `true`，部署前仍會執行 `npm run check:production-deploy-ready`。至少必須滿足：

- `wrangler.toml` 有明確的 `[[env.production.d1_databases]]`，binding 為 `LIFE_DB`，且 database name / UUID 不是 local、staging 或 placeholder。
- `[env.production.vars]` 的 `ENVIRONMENT="production"`、`APP_TIMEZONE`、`ACCESS_TEAM_DOMAIN`、`ACCESS_AUD` 都已設定。

目前 production D1 binding 與 Access 設定尚未補齊，因此 production 自動部署不得啟用。

## 正常發布流程

1. `npm run verify` 全部通過。
2. 備份目標 D1。
3. staging 套用尚未執行的 additive migration。
4. staging health、三頁 UI、CRUD、離線同步、跨裝置 pull、PWA 更新 smoke。
5. 確認 Access 邊界仍正確。
6. 完成 production readiness 與 production migration。
7. 才可把 `ENABLE_PRODUCTION_DEPLOY` 設為 `true`，讓 `master` 的已驗證 commit 自動發布。

## 舊產品表清理閘門

`0001`～`0010` 建立的舊產品表目前可以留在 D1；新版不讀寫它們。禁止僅為了「看起來乾淨」就直接 drop。

只有同時符合以下條件，才可新增 cleanup migration：

1. 所有實際使用裝置的 IndexedDB outbox 都已確認為 0。
2. staging 與 production 目標 D1 均有當下 SQL 備份及 checksum。
3. 新版 `0011` 已在 staging 套用並完成 CRUD、離線恢復同步、跨裝置拉取、PWA 更新驗證。
4. 確認不再需要把舊產品正式資料轉換進新版模型；若要轉換，先另做明確 migration，不可在 drop 時臨時猜測。
5. cleanup migration 在全新資料庫從 `0001` 起完整重放可成功。

本改造分支不會在上述條件未確認時建立或套用 drop migration。

## PWA

build 後 Service Worker 必須含版本戳。既有裝置看到 waiting worker 時，outbox=0 才能按安全更新；手機提示固定在同步列與底部導覽上方。不得要求使用者清站台資料掩蓋更新問題。

## 回復

程式改造在獨立 branch／PR 進行；在合併或部署前都可以放棄 branch。資料庫變更以 additive migration 為主；真正破壞性清理前必須保有可驗證備份。
