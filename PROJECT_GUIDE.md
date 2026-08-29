# 專案指南

## 權威順序

1. 使用者最新且明確的決定。
2. `docs/PRODUCT_REQUIREMENTS.md`。
3. `docs/ARCHITECTURE.md`、`docs/DATA_AND_SYNC.md`、`docs/UI_DESIGN.md`。
4. 其他文件與舊 Git 歷史。

2026-08-30 的精簡決定已取代舊版領域、事業、社群、投資、期限、通用指標、事件與外部平台整合需求。

## 有效產品範圍

- 每日任務：名稱、敘述、分類，每天一次完成／撤銷。
- 任務分類：名稱、敘述。
- 目標固定月收入、目標積蓄。
- 實際固定月收入與積蓄的日期化歷史，可新增、修改、刪除。
- 首頁分類累積完成曲線、積蓄曲線、固定月收入曲線。
- 首頁／每日任務／設定三個主要入口。

## 必須保留的基礎設施

Cloudflare Worker、Static Assets、D1、Cloudflare Access、IndexedDB、離線 outbox、跨裝置同步、衝突記錄、PWA Service Worker、安全更新、備份能力、免費額度防線、測試與部署閘門。

## 資料庫規則

- migration 只新增，不改已存在且可能套用過的檔案。
- `0001`～`0010` 為歷史；新版從 `0011` 開始。
- 舊產品表暫時留在 D1 不代表舊功能仍有效。
- drop 舊表前必須：所有裝置 outbox=0、遠端 D1 備份完成、新版 staging migration／smoke／同步驗證完成。

## 變更品質

任何產品變更至少通過 `npm run verify`；不得以刪測試、跳過測試、清除 IndexedDB 或簡化掉同步來讓驗證通過。正式部署與破壞性資料庫操作需要另外符合 `docs/OPERATIONS.md` 的安全閘門。
