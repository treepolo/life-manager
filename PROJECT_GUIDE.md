# 專案指南

## 權威順序

1. 使用者最新且明確的決定。
2. `docs/PRODUCT_REQUIREMENTS.md`。
3. `docs/ARCHITECTURE.md`、`docs/DATA_AND_SYNC.md`、`docs/UI_DESIGN.md`。
4. 其他文件與舊 Git 歷史。

2026-08-30 的精簡決定已取代舊版領域、事業、社群、投資、期限、通用指標、事件與外部平台整合需求；之後新增的淨資產、人口比較、生日進度、任務成果與里程碑設計則以較新的使用者決定為準。

## 有效產品範圍

- 每日任務：名稱、敘述、分類、可選的成果名稱／單位，每天一次完成／撤銷。
- 任務分類：名稱、敘述。
- 任務成果：依完成次數累積，里程碑採週期級距與金色／琥珀色強度分級。
- 目標固定月收入、目標淨資產。
- 實際固定月收入與淨資產的日期化歷史，可新增、修改、刪除。
- 台灣收入／資產人口分布比較。
- 個人出生日期與生日年度進度。
- 首頁／每日任務／設定三個主要入口。

## 必須保留的基礎設施

Cloudflare Worker、Static Assets、D1、Cloudflare Access、IndexedDB、離線 outbox、跨裝置同步、衝突記錄、PWA Service Worker、安全更新、備份能力、免費額度防線、測試與部署閘門。

## 資料庫規則

- migration 只新增，不改已存在且可能套用過的檔案。
- `0001`～`0010` 為舊產品歷史；現行模型自 `0011` 起，目前 application schema version 為 13。
- staging 與 production 是獨立 D1；production cutover 與 staging 資料 promotion 已完成。
- 舊產品表暫時留在 D1 不代表舊功能仍有效；現行 Worker 不暴露舊產品 API。
- drop 舊表必須使用新的 cleanup migration，並保留可驗證備份、確認所有實際裝置 outbox=0、先在非 production 完整重放與驗證，再單獨執行 production 清理。

## 分支與部署

- `master` 是 production 發布分支；`ENABLE_PRODUCTION_DEPLOY=true` 時，完整 Verify 成功後才部署 production。
- staging 自動部署仍由 Verify workflow 的 staging 分支條件控制；清理分支不得直接觸發 production。
- 臨時 ops workflow 使用完必須移除，不留可重複誤觸的 production 寫入入口。

## 變更品質

任何產品變更至少通過 `npm run verify`；不得以刪測試、跳過測試、清除 IndexedDB 或簡化掉同步來讓驗證通過。正式部署與破壞性資料庫操作另外遵守 `docs/OPERATIONS.md` 的安全閘門。
