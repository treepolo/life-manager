# 人生管理器

一個自用、離線優先的人生進度工具。新版只保留四件事：每天完成固定任務、用分類累積成果、追蹤固定月收入、追蹤積蓄。

## 產品畫面

- 首頁：今日每日任務、固定月收入／積蓄目前值與目標、三張成果曲線。
- 每日任務：新增與編輯任務分類、每日任務，並可封存／恢復。
- 設定：財務目標、固定月收入／積蓄歷史新增／修正／刪除、同步狀態。

視覺採紙張與兒童蠟筆手繪風格；資料仍保留清楚的日期、單位、圖例與數值。

## 技術底座

React + TypeScript + Vite + Recharts；Cloudflare Worker + Static Assets + D1；Cloudflare Access；IndexedDB 離線資料與 outbox；自有 Service Worker 安全更新。

## 開發

```bash
npm ci
npm run db:migrate
npm run dev
```

完整驗證：

```bash
npm run verify
```

`0001`～`0010` 是既有資料庫 migration 歷史，不回頭修改；精簡版資料模型由 `0011_simple_core.sql` 開始。正式環境舊產品表在完成 D1 備份、所有裝置 outbox=0 與 staging 驗證前不會刪除。
