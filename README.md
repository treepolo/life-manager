# 人生管理器

一個自用、離線優先的人生進度工具。現在的核心是：每天完成固定任務、累積任務成果與里程碑、追蹤固定月收入、追蹤淨資產，並用台灣人口分布模型提供相對位置參考。

## 產品畫面

- 首頁：今日每日任務、任務成果／里程碑、固定月收入與淨資產目前值／目標、成果曲線與人口比較。
- 每日任務：新增與編輯任務分類、每日任務、成果名稱與單位，並可封存／恢復。
- 設定：財務目標、固定月收入／淨資產歷史新增／修正／刪除、出生日期與同步狀態。

視覺採紙張與蠟筆風格；資料仍保留清楚的日期、單位、圖例與數值。

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

## 資料庫與環境

- `0001`～`0010` 是舊產品的 migration 歷史，不回頭修改。
- 現行精簡產品資料模型由 `0011_simple_core.sql` 開始，`0012` 加入成果／個人資料，`0013` 將財務語意統一為淨資產；目前 application schema version 為 13。
- staging 與 production 使用不同 D1；正式 cutover 已完成，production 資料已由 staging promotion 並完成同步種子建立。
- 舊產品表仍暫留 D1；它們不被現行產品讀寫，物理刪除只會在獨立 cleanup migration、可驗證備份與完整回歸條件下進行。
