# 資料與同步

## 1. 資料原則

- 顯示與每日完成日期語意使用 `Asia/Taipei`。
- 金額第一版只用新台幣整數元，不以浮點數累積。
- 所有可修改產品資料有 version；刪除使用 `deleted_at` tombstone。
- 任務／分類停用優先使用 `archived_at`，歷史紀錄不因封存消失。
- 財務目前值不另存；從有效歷史推導。

## 2. 新版資料表

### `task_categories_v2`
名稱、敘述、封存／刪除、版本。

### `daily_tasks_v2`
分類外鍵、名稱、敘述、封存／刪除、版本。

### `daily_task_completions_v2`
任務外鍵、完成的本地日期、完成時間、刪除、版本。有效列對 `(task_id, completed_local_date)` 唯一，因此同一任務同一天最多完成一次；撤銷以 soft delete 實作。

### `financial_goals_v2`
固定兩種 goal kind：`MONTHLY_INCOME`、`SAVINGS`。金額可為空。

### `financial_history_v2`
固定兩種 metric kind：`MONTHLY_INCOME`、`SAVINGS`。每筆有生效日期與金額，可修改、soft delete。同一天可存在多筆；該日顯示值採最後建立且仍有效的一筆。

## 3. 財務推導

截至今天，先排除未來紀錄；同一天多筆依建立時間與 ID 穩定排序，取最後一筆。跨日期則取日期最新的一筆作目前值。圖表將每個有效日期的最後一筆畫成階梯線，最後值延伸至今天。

## 4. IndexedDB

維持既有 `entities`、`outbox`、`syncMeta`、`conflicts`、`appSettings`、`cachedQueries`。新版 `entityType` 只有：

- `task-categories`
- `daily-tasks`
- `daily-task-completions`
- `financial-goals`
- `financial-history`

離線 UPSERT 同一實體會合併；尚未上傳的新實體若離線刪除，直接取消其建立操作；既有實體 DELETE 在本機標記 `deletedAt`。

## 5. 伺服器同步

操作以 `operationId` 冪等，使用 `baseVersion` 做版本衝突檢查。成功後寫入 D1、`sync_operations`、`sync_change_log` 與 audit。pull 使用裝置 cursor；未註冊或停用裝置不能推進 cursor。

## 6. 舊資料

舊產品資料不自動搬入新版，避免將舊模型的複雜語意誤映射成新模型。既有舊表暫留 D1；只有完成正式備份、所有裝置 outbox=0、新版 staging 驗證後，才可新增 cleanup migration 物理移除。
