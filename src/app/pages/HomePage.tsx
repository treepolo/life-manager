import { useMemo, type FormEvent } from "react";

import { useResource } from "@/app/hooks/use-resource";
import { CrayonLineChart } from "@/components/CrayonLineChart";
import {
  buildFinancialSeries,
  buildTaskCategorySeries,
  currentFinancialValue,
} from "@/modules/simple/analytics";
import { taipeiDate } from "@/modules/simple/date";
import type {
  DailyTask,
  DailyTaskCompletion,
  FinancialGoal,
  FinancialHistory,
  TaskCategory,
} from "@/modules/simple/model";
import type { FinancialMetricKind } from "@/modules/simple/schema";

const money = new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 0 });

function moneyText(value: number | null | undefined): string {
  return value === null || value === undefined ? "尚未設定" : `NT$ ${money.format(value)}`;
}

function errorText(error: unknown): string | null {
  return error instanceof Error ? error.message : error ? "操作失敗，請稍後再試。" : null;
}

function FinancialSummaryCard({
  label,
  current,
  goal,
}: {
  label: string;
  current: number | null;
  goal: number | null;
}) {
  const ratio = current !== null && goal !== null && goal > 0 ? Math.max(0, Math.min(current / goal, 1)) : 0;
  return (
    <article className="crayon-panel money-card">
      <p className="eyebrow">{label}</p>
      <strong>{moneyText(current)}</strong>
      <span>目標 {moneyText(goal)}</span>
      <div className="scribble-progress" aria-label={`${label}目標進度`}>
        <span style={{ width: `${ratio * 100}%` }} />
      </div>
    </article>
  );
}

export function HomePage() {
  const today = taipeiDate();
  const categoriesResource = useResource<TaskCategory>("task-categories", "?includeArchived=true");
  const tasksResource = useResource<DailyTask>("daily-tasks", "?includeArchived=true");
  const completionsResource = useResource<DailyTaskCompletion>("daily-task-completions");
  const goalsResource = useResource<FinancialGoal>("financial-goals");
  const historyResource = useResource<FinancialHistory>("financial-history");

  const categories = useMemo(() => categoriesResource.list.data ?? [], [categoriesResource.list.data]);
  const tasks = useMemo(() => tasksResource.list.data ?? [], [tasksResource.list.data]);
  const completions = useMemo(() => completionsResource.list.data ?? [], [completionsResource.list.data]);
  const goals = useMemo(() => goalsResource.list.data ?? [], [goalsResource.list.data]);
  const history = useMemo(() => historyResource.list.data ?? [], [historyResource.list.data]);

  const activeCategoryIds = useMemo(
    () => new Set(categories.filter((category) => !category.archivedAt && !category.deletedAt).map((category) => category.id)),
    [categories],
  );
  const activeTasks = useMemo(
    () => tasks.filter((task) => !task.archivedAt && !task.deletedAt && activeCategoryIds.has(task.categoryId)),
    [tasks, activeCategoryIds],
  );
  const todayCompletionByTask = useMemo(
    () => new Map(completions.filter((completion) => completion.completedLocalDate === today).map((completion) => [completion.taskId, completion])),
    [completions, today],
  );

  const chartCategories = useMemo(
    () => categories.filter((category) => !category.deletedAt && tasks.some((task) => task.categoryId === category.id)),
    [categories, tasks],
  );
  const taskSeries = useMemo(
    () => buildTaskCategorySeries({ categories: chartCategories, tasks, completions, today }),
    [chartCategories, tasks, completions, today],
  );
  const savingsSeries = useMemo(() => buildFinancialSeries(history, "SAVINGS", today), [history, today]);
  const incomeSeries = useMemo(() => buildFinancialSeries(history, "MONTHLY_INCOME", today), [history, today]);
  const currentSavings = currentFinancialValue(history, "SAVINGS", today)?.amountMinor ?? null;
  const currentIncome = currentFinancialValue(history, "MONTHLY_INCOME", today)?.amountMinor ?? null;
  const savingsGoal = goals.find((goal) => goal.goalKind === "SAVINGS")?.amountMinor ?? null;
  const incomeGoal = goals.find((goal) => goal.goalKind === "MONTHLY_INCOME")?.amountMinor ?? null;
  const completedCount = activeTasks.filter((task) => todayCompletionByTask.has(task.id)).length;

  const toggleTask = (task: DailyTask) => {
    const existing = todayCompletionByTask.get(task.id);
    if (existing) {
      completionsResource.remove.mutate({ id: existing.id, version: existing.version });
      return;
    }
    completionsResource.create.mutate({
      taskId: task.id,
      completedLocalDate: today,
      completedAt: new Date().toISOString(),
    });
  };

  const addFinancialRecord = (event: FormEvent<HTMLFormElement>, metricKind: FinancialMetricKind) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const amount = Number(form.get("amount"));
    const effectiveLocalDate = String(form.get("date"));
    if (!Number.isInteger(amount) || !effectiveLocalDate) return;
    historyResource.create.mutate({
      metricKind,
      effectiveLocalDate,
      amountMinor: amount,
      currencyCode: "TWD",
      minorUnitScale: 0,
    });
    event.currentTarget.reset();
  };

  const loading = [categoriesResource.list, tasksResource.list, completionsResource.list, goalsResource.list, historyResource.list]
    .some((query) => query.isLoading);
  const loadError = [categoriesResource.list.error, tasksResource.list.error, completionsResource.list.error, goalsResource.list.error, historyResource.list.error]
    .find(Boolean);
  const actionError = completionsResource.create.error ?? completionsResource.remove.error ?? historyResource.create.error;

  return (
    <div className="page crayon-page">
      <header className="hero-scribble">
        <div>
          <p className="eyebrow">今天 · {today}</p>
          <h1>今天把這些完成就好</h1>
          <p>固定任務每天重新開始，完成紀錄會留在你的累積曲線裡。</p>
        </div>
        <div className="today-score" aria-label="今日完成進度">
          <strong>{completedCount}/{activeTasks.length}</strong>
          <span>今日完成</span>
        </div>
      </header>

      {loading ? <p className="notice-strip">正在讀取今天的資料…</p> : null}
      {loadError ? <p className="notice-strip notice-strip--danger">{errorText(loadError)}</p> : null}
      {actionError ? <p className="notice-strip notice-strip--danger">{errorText(actionError)}</p> : null}

      <section className="crayon-panel today-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">每日任務</p>
            <h2>今天的清單</h2>
          </div>
          <span className="tiny-note">明天會重新變成未完成</span>
        </div>
        {!activeTasks.length ? (
          <div className="empty-note">還沒有每日任務。到「每日任務」頁新增第一個分類與任務。</div>
        ) : (
          <div className="daily-list">
            {activeTasks.map((task) => {
              const category = categories.find((item) => item.id === task.categoryId);
              const done = todayCompletionByTask.has(task.id);
              return (
                <button
                  className={done ? "daily-task is-done" : "daily-task"}
                  type="button"
                  key={task.id}
                  onClick={() => toggleTask(task)}
                  disabled={completionsResource.create.isPending || completionsResource.remove.isPending}
                >
                  <span className="crayon-checkbox" aria-hidden="true">{done ? "✓" : ""}</span>
                  <span className="daily-task-copy">
                    <strong>{task.name}</strong>
                    {task.description ? <small>{task.description}</small> : null}
                  </span>
                  <span className="category-chip">{category?.name ?? "未分類"}</span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section className="money-overview" aria-label="財務進度">
        <FinancialSummaryCard label="固定月收入" current={currentIncome} goal={incomeGoal} />
        <FinancialSummaryCard label="積蓄" current={currentSavings} goal={savingsGoal} />
        <article className="crayon-panel quick-record-card">
          <p className="eyebrow">快速記錄</p>
          <h2>更新今天的數字</h2>
          <div className="quick-record-grid">
            <form onSubmit={(event) => addFinancialRecord(event, "MONTHLY_INCOME")}>
              <label>固定月收入<input name="amount" type="number" min="0" step="1" required placeholder="例如 35000" /></label>
              <input name="date" type="date" defaultValue={today} max={today} required />
              <button className="crayon-button" disabled={historyResource.create.isPending}>記一筆收入</button>
            </form>
            <form onSubmit={(event) => addFinancialRecord(event, "SAVINGS")}>
              <label>目前積蓄<input name="amount" type="number" step="1" required placeholder="例如 120000" /></label>
              <input name="date" type="date" defaultValue={today} max={today} required />
              <button className="crayon-button" disabled={historyResource.create.isPending}>記一筆積蓄</button>
            </form>
          </div>
        </article>
      </section>

      <div className="chart-stack">
        <CrayonLineChart
          title="每日任務累積完成次數"
          description="每條線代表一個任務分類；今天完成一次就累積一次。"
          data={taskSeries}
          series={chartCategories.map((category) => ({ key: category.id, name: category.name }))}
          yLabel="累積完成次數（次）"
          curve="stepAfter"
        />
        <CrayonLineChart
          title="固定月收入變化"
          description="每筆紀錄從該日期起生效，直到下一次更新。"
          data={incomeSeries}
          series={[{ key: "value", name: "固定月收入" }]}
          yLabel="月收入（新台幣）"
          valueFormatter={(value) => `NT$ ${money.format(value)}`}
          curve="stepAfter"
        />
        <CrayonLineChart
          title="積蓄變化"
          description="使用你手動記錄的有效歷史；同一天多筆紀錄以最後一筆為準。"
          data={savingsSeries}
          series={[{ key: "value", name: "積蓄" }]}
          yLabel="積蓄（新台幣）"
          valueFormatter={(value) => `NT$ ${money.format(value)}`}
          curve="stepAfter"
        />
      </div>
    </div>
  );
}
