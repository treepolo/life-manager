# 維運與部署

## 環境

- local：Wrangler 本機 Worker 與 D1。
- staging：`life-manager-staging` + 獨立 staging D1 + Cloudflare Access。
- production：`life-manager` + 正式 D1 + Cloudflare Access；production cutover 已完成。

現行 application schema version 為 13。staging 與 production 是兩顆獨立 D1；資料不會因 migration 自動跨環境搬移。

## 零成本防線

有效外部資源只剩 Cloudflare Worker、Static Assets、D1 與 Access。不得自動升級付費方案。已退役的 YouTube、Instagram、Firstrade、Resend、Push 不再由現行程式執行同步、排程或傳送。

## GitHub Actions 自動部署

同一個 `Verify` workflow 負責驗證與部署，deployment job 必須 `needs: verify`；完整 CI 失敗時不得部署。

### GitHub Secrets

Repository secrets：

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Token 只授予必要 Cloudflare 權限，不得寫入 repo、Wrangler vars 或一般 GitHub Variables。

### GitHub Variables

- `ENABLE_STAGING_DEPLOY=true`：允許 staging 分支條件符合時自動部署 staging。
- `ENABLE_PRODUCTION_DEPLOY=true`：允許 `master` 在 Verify 成功後自動部署 production。

production 自動部署目前已啟用。變數本身不應被當作 readiness 的唯一安全防線；`npm run check:production-deploy-ready` 仍必須驗證正式 D1 與 Access 設定。

## production readiness

`wrangler.toml` 的 production 必須具備：

- `[[env.production.d1_databases]]`：binding `LIFE_DB`，指向正式 `life-manager` D1。
- `[env.production.vars]`：`ENVIRONMENT="production"`、`APP_TIMEZONE`、`ACCESS_TEAM_DOMAIN`、`ACCESS_AUD`。

2026-09-02 cutover 已完成上述設定與 production deploy。

## 正常發布流程

1. 在非 `master` 分支完成變更與 review／驗證。
2. `npm run verify` 全部通過。
3. 有 schema 變更時，先備份目標 D1，再於 staging 套 migration 並做 health、UI、CRUD、離線同步、跨裝置 pull、PWA smoke。
4. 確認 Access 邊界仍正確。
5. 有 production migration 時，先建立可驗證 production 備份，再套 migration，最後才發布 Worker。
6. 合併到 `master` 後，`ENABLE_PRODUCTION_DEPLOY=true` 允許 Verify 成功的 commit 自動發布。

一般文件或 repo hygiene 變更也會在合併 `master` 後經過同一套 Verify；因此應集中成少量已驗證 commit，避免無意義地重複 production deploy。

## staging → production 資料 promotion

staging 與 production D1 不共用資料。若未來再次需要把 staging 業務資料 promotion 到 production：

1. 先備份兩端 D1 並保存 checksum。
2. 明確列出要 promotion 的現行業務表，不可直接整顆 staging 覆蓋 production。
3. 先在 production snapshot 本地 dry-run。
4. D1 `execute --file` 的匯入 SQL 不自行包 `BEGIN TRANSACTION` / `COMMIT`。
5. promotion 後逐表 row count／內容 checksum 比對，執行 `PRAGMA foreign_key_check`。
6. 若新 production origin 需要讓 IndexedDB 拉到既有資料，建立 production 專用 `sync_change_log` seed；不要直接複製 staging 的 device、cursor 或 operation 歷史。

## 舊產品表清理閘門

`0001`～`0010` 建立的舊產品表目前仍可留在 D1；現行 Worker 不讀寫它們。物理刪除是破壞性維運，不和一般 repo cleanup 混在一起。

新增 cleanup migration 前至少確認：

1. 所有實際使用裝置 outbox=0。
2. staging 與 production 均有當下可讀 SQL 備份與 checksum。
3. 現行 schema 13 在 staging／production 已穩定運作，CRUD、同步與 PWA smoke 通過。
4. 已明確確認不再需要從舊表轉換任何正式資料。
5. cleanup migration 可在新資料庫從 `0001` 起完整重放，並通過 Worker／E2E regression。
6. production cleanup 執行前再建立一份當下備份，cleanup 後重新檢查 schema、現行六張業務表與正式讀寫。

## PWA

build 後 Service Worker 必須含版本戳。waiting worker 只有在 outbox=0 時允許安全接管；不得要求清除 IndexedDB 來掩蓋更新或同步問題。

## 回復

程式變更以 branch／Git 歷史回復。D1 schema 變更以 additive migration 為主；任何破壞性 cleanup 前必須存在可驗證的遠端備份。臨時 production ops workflow 執行完即移除，不保留可重複誤觸入口。
