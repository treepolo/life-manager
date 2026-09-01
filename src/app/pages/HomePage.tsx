import { useMemo, type CSSProperties, type FormEvent } from "react";

import { useResource } from "@/app/hooks/use-resource";
import { CrayonLineChart } from "@/components/CrayonLineChart";
import { PopulationComparisonCard } from "@/components/PopulationComparisonCard";
import {
  buildFinancialAchievement,
  buildTaskAchievements,
  type FinancialAchievement,
  type TaskAchievement,
} from "@/modules/simple/achievements";
import {
  buildFinancialSeries,
  buildTaskCategorySeries,
  currentFinancialValue,
} from "@/modules/simple/analytics";
import { ageOnDate, birthdayYearProgress, daysUntilNextBirthday, taipeiDate } from "@/modules/simple/date";
import type {
  DailyTask,
  DailyTaskCompletion,
  FinancialGoal,
  FinancialHistory,
  TaskCategory,
  UserProfile,
} from "@/modules/simple/model";
import type { FinancialMetricKind } from "@/modules/simple/schema";
import {
  TAIWAN_MONTHLY_INCOME_INFO,
  TAIWAN_MONTHLY_INCOME_MODEL,
  TAIWAN_NET_WORTH_INFO,
  TAIWAN_NET_WORTH_MODEL,
} from "@/modules/simple/taiwan-distributions";

import "./HomePage.css";

const money = new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 0 });

function moneyText(value: number | null | undefined): string {
  return value === null || value === undefined ? "尚未設定" : `NT$ ${money.format(value)}`;
}

function signedMoney(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "±";
  return `${sign}NT$ ${money.format(Math.abs(value))}`;
}

function signedPercent(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "±";
  return `${sign}${Math.abs(value).toFixed(Math.abs(value) >= 10 ? 0 : 1)}%`;
}

function errorText(error: unknown): string | null {
  return error instanceof Error ? error.message : error ? "操作失敗，請稍後再試。" : null;
}

function MilestoneTrack({ achievement }: { achievement: TaskAchievement }) {
  const style = { "--milestone-progress": `${achievement.milestoneProgress * 100}%` } as CSSProperties;
  return (
    <div className="milestone-track" style={style} aria-label={`下一個里程碑 ${achievement.nextMilestone ?? achievement.count}`}>
      <span>{achievement.reachedMilestone ?? 0}</span>
      <i aria-hidden="true"><b /></i>
      <span>{achievement.nextMilestone ?? "∞"}</span>
    </div>
  );
}

function TaskAchievementCard({ achievement }: { achievement: TaskAchievement }) {
  const milestoneClass = achievement.milestoneTier ? ` is-milestone milestone-${achievement.milestoneTier}` : "";
  return (
    <article className={`achievement-card task-achievement${milestoneClass}`}>
      <p className="achievement-kicker">你完成了</p>
      <div className="achievement-number-row">
        <strong>{achievement.count}</strong><b>{achievement.achievementUnit}</b>
      </div>
      <span className="achievement-name">{achievement.achievementName}</span>
      <MilestoneTrack achievement={achievement} />
      {achievement.milestoneTier ? (
        <div className="milestone-note">幹得漂亮啊我自己，有認真地活著吧</div>
      ) : null}
    </article>
  );
}

function LifeRibbon({ birthDate, today }: { birthDate: string | null; today: string }) {
  const age = birthDate ? ageOnDate(birthDate, today) : null;
  const birthdayDays = birthDate ? daysUntilNextBirthday(birthDate, today) : null;
  const birthdayYear = birthDate ? birthdayYearProgress(birthDate, today) : null;
  return (
    <div className="life-ribbon" aria-label="這一歲的生日年度進度">
      <div className="life-ribbon-summary">
        <span>這一歲</span>
        <strong>{age === null ? "—" : `${age} 歲`}</strong>
        <b>{birthdayDays === null ? "設定生日" : birthdayDays === 0 ? "今天生日" : `生日還有 ${birthdayDays} 天`}</b>
      </div>
      {birthdayYear ? (
        <div
          className="birthday-year-axis"
          aria-label={`${birthdayYear.currentAge}歲生日到${birthdayYear.nextAge}歲生日；今天位於年度的${Math.round(birthdayYear.progress * 100)}%`}
        >
          <div className="birthday-age-labels" aria-hidden="true">
            <span>{birthdayYear.currentAge}歲</span>
            <span>{birthdayYear.nextAge}歲</span>
          </div>
          <div className="birthday-year-line">
            {birthdayYear.monthTicks.map((tick) => (
              <span
                className="birthday-month-tick"
                key={tick.date}
                style={{ left: `${tick.progress * 100}%` }}
                title={tick.date}
              >
                <i />
                <small>{tick.label}</small>
              </span>
            ))}
            <mark
              className="birthday-today-marker"
              style={{ left: `${birthdayYear.progress * 100}%` }}
              title={`今天 ${today}`}
              aria-label={`今天 ${today}`}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AchievementBoard({
  taskAchievements,
  history,
  incomeGoal,
  netWorthGoal,
  birthDate,
  today,
  achievementCardsReady,
}: {
  taskAchievements: TaskAchievement[];
  history: FinancialHistory[];
  incomeGoal: number | null;
  netWorthGoal: number | null;
  birthDate: string | null;
  today: string;
  achievementCardsReady: boolean;
}) {
  return (
    <section className="achievement-board" aria-label="成就">
      <div className="achievement-board-head">
        <div className="achievement-title-copy"><p className="eyebrow">成就</p><h1>你已經累積到這裡</h1></div>
        <LifeRibbon birthDate={birthDate} today={today} />
      </div>
      <div className="achievement-grid" aria-busy={!achievementCardsReady}>
        {achievementCardsReady ? (
          <>
            {taskAchievements.slice(0, 2).map((achievement) => <TaskAchievementCard achievement={achievement} key={achievement.taskId} />)}
            <PopulationComparisonCard
              label="月收入"
              metricKind="MONTHLY_INCOME"
              history={history}
              goal={incomeGoal}
              today={today}
              model={TAIWAN_MONTHLY_INCOME_MODEL}
              info={TAIWAN_MONTHLY_INCOME_INFO}
            />
            <PopulationComparisonCard
              label="淨資產"
              metricKind="NET_WORTH"
              history={history}
              goal={netWorthGoal}
              today={today}
              model={TAIWAN_NET_WORTH_MODEL}
              info={TAIWAN_NET_WORTH_INFO}
            />
          </>
        ) : null}
      </div>
    </section>
  );
}

function FinancialSummaryCard({
  label,
  current,
  goal,
  achievement,
  today,
  currentRecordDate,
}: {
  label: string;
  current: number | null;
  goal: number | null;
  achievement: FinancialAchievement;
  today: string;
  currentRecordDate: string | null;
}) {
  const ratio = current !== null && goal !== null && goal > 0 ? Math.max(0, Math.min(current / goal, 1)) : 0;
  const newRecordToday = achievement.isRecordHigh && currentRecordDate === today;
  return (
    <article className={newRecordToday ? "crayon-panel money-card has-record" : "crayon-panel money-card"}>
      <div className="money-card-title"><p className="eyebrow">{label}</p>{newRecordToday ? <b className="record-stamp">新高</b> : null}</div>
      <strong>{moneyText(current)}</strong>
      <span>目標 {moneyText(goal)}</span>
      <div className="money-deltas">
        {achievement.changeFromFirst !== null && achievement.changeFromFirst !== 0 ? <b>{signedMoney(achievement.changeFromFirst)}<small>比開始記錄時</small></b> : null}
        {achievement.sixMonthChangePercent !== null && Math.abs(achievement.sixMonthChangePercent) >= 0.1 ? <b>{signedPercent(achievement.sixMonthChangePercent)}<small>比六個月前</small></b> : null}
      </div>
      {newRecordToday ? <p className="record-note">新的{label}紀錄。<br />這是你開始記錄以來最高的一次。</p> : null}
      <div className="scribble-progress" aria-label={`${label}目標進度`}>
        <span style={{ width: `${ratio * 100}%` }} />
      </div>
    </article>
  );
}

export function HomePage() {
  const today = taipeiDate();
  const profileResource = useResource<UserProfile>("user-profile");
  const categoriesResource = useResource<TaskCategory>("task-categories", "?includeArchived=true");
  const tasksResource = useResource<DailyTask>("daily-tasks", "?includeArchived=true");
  const completionsResource = useResource<DailyTaskCompletion>("daily-task-completions");
  const goalsResource = useResource<FinancialGoal>("financial-goals");
  const historyResource = useResource<FinancialHistory>("financial-history");

  const profile = (profileResource.list.data ?? [])[0] ?? null;
  const categories = useMemo(() => categoriesResource.list.data ?? [], [categoriesResource.list.data]);
  const tasks = useMemo(() => tasksResource.list.data ?? [], [tasksResource.list.data]);
  const completions = useMemo(() => completionsResource.list.data ?? [], [completionsResource.list.data]);
  const goals = useMemo(() => goalsResource.list.data ?? [], [goalsResource.list.data]);
  const history = useMemo(() => historyResource.list.data ?? [], [historyResource.list.data]);
  const birthDate = profile?.birthDate ?? null;

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
  const netWorthSeries = useMemo(() => buildFinancialSeries(history, "NET_WORTH", today), [history, today]);
  const incomeSeries = useMemo(() => buildFinancialSeries(history, "MONTHLY_INCOME", today), [history, today]);
  const currentNetWorthRecord = currentFinancialValue(history, "NET_WORTH", today);
  const currentIncomeRecord = currentFinancialValue(history, "MONTHLY_INCOME", today);
  const currentNetWorth = currentNetWorthRecord?.amountMinor ?? null;
  const currentIncome = currentIncomeRecord?.amountMinor ?? null;
  const netWorthGoal = goals.find((goal) => goal.goalKind === "NET_WORTH")?.amountMinor ?? null;
  const incomeGoal = goals.find((goal) => goal.goalKind === "MONTHLY_INCOME")?.amountMinor ?? null;
  const completedCount = activeTasks.filter((task) => todayCompletionByTask.has(task.id)).length;
  const allDone = activeTasks.length > 0 && completedCount === activeTasks.length;
  const taskAchievements = useMemo(() => buildTaskAchievements(tasks, completions, today), [tasks, completions, today]);
  const incomeAchievement = useMemo(() => buildFinancialAchievement(history, "MONTHLY_INCOME", today), [history, today]);
  const netWorthAchievement = useMemo(() => buildFinancialAchievement(history, "NET_WORTH", today), [history, today]);
  const achievementCardsReady = tasksResource.list.data !== undefined && completionsResource.list.data !== undefined;

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
    if (!Number.isInteger(amount) || !effectiveLocalDate || effectiveLocalDate > today) return;
    historyResource.create.mutate({
      metricKind,
      effectiveLocalDate,
      amountMinor: amount,
      currencyCode: "TWD",
      minorUnitScale: 0,
    });
    event.currentTarget.reset();
  };

  const loading = [profileResource.list, categoriesResource.list, tasksResource.list, completionsResource.list, goalsResource.list, historyResource.list]
    .some((query) => query.isLoading);
  const loadError = [profileResource.list.error, categoriesResource.list.error, tasksResource.list.error, completionsResource.list.error, goalsResource.list.error, historyResource.list.error]
    .find(Boolean);
  const actionError = completionsResource.create.error ?? completionsResource.remove.error ?? historyResource.create.error;

  return (
    <div className="page crayon-page">
      <AchievementBoard
        taskAchievements={taskAchievements}
        history={history}
        incomeGoal={incomeGoal}
        netWorthGoal={netWorthGoal}
        birthDate={birthDate}
        today={today}
        achievementCardsReady={achievementCardsReady}
      />

      <section className={allDone ? "hero-scribble hero-with-tasks is-all-done" : "hero-scribble hero-with-tasks"}>
        <div className="hero-main-copy">
          <p className="eyebrow">今天 · {today}</p>
          <h1>今天把這些完成就好</h1>
          <p>固定任務每天重新開始，完成紀錄會留在你的累積曲線裡。</p>
        </div>
        <div className={allDone ? "today-score is-complete" : "today-score"} aria-label="今日完成進度">
          <strong>{completedCount}/{activeTasks.length}</strong>
          <span>{allDone ? "收工" : "今日完成"}</span>
        </div>
        <div className="hero-task-area" aria-label="今天的每日任務清單">
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
        </div>
      </section>

      {loading ? <p className="notice-strip">正在讀取今天的資料…</p> : null}
      {loadError ? <p className="notice-strip notice-strip--danger">{errorText(loadError)}</p> : null}
      {actionError ? <p className="notice-strip notice-strip--danger">{errorText(actionError)}</p> : null}

      <section className="money-overview" aria-label="財務進度">
        <FinancialSummaryCard label="固定月收入" current={currentIncome} goal={incomeGoal} achievement={incomeAchievement} today={today} currentRecordDate={currentIncomeRecord?.effectiveLocalDate ?? null} />
        <FinancialSummaryCard label="淨資產" current={currentNetWorth} goal={netWorthGoal} achievement={netWorthAchievement} today={today} currentRecordDate={currentNetWorthRecord?.effectiveLocalDate ?? null} />
        <article className="crayon-panel quick-record-card">
          <p className="eyebrow">快速記錄</p>
          <h2>更新今天的數字</h2>
          <div className="quick-record-grid">
            <form onSubmit={(event) => addFinancialRecord(event, "MONTHLY_INCOME")}>
              <label>固定月收入<input name="amount" type="number" min="0" step="1" required placeholder="例如 35000" /></label>
              <input name="date" type="date" defaultValue={today} max={today} required />
              <button className="crayon-button" disabled={historyResource.create.isPending}>記一筆收入</button>
            </form>
            <form onSubmit={(event) => addFinancialRecord(event, "NET_WORTH")}>
              <label>目前淨資產<input name="amount" type="number" step="1" required placeholder="例如 120000" /></label>
              <input name="date" type="date" defaultValue={today} max={today} required />
              <button className="crayon-button" disabled={historyResource.create.isPending}>記一筆淨資產</button>
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
          timelineStartDate={birthDate}
          birthDate={birthDate}
        />
        <CrayonLineChart
          title="固定月收入變化"
          description="每筆紀錄從該日期起生效，直到下一次更新。"
          data={incomeSeries}
          series={[{ key: "value", name: "固定月收入" }]}
          yLabel="月收入（新台幣）"
          valueFormatter={(value) => `NT$ ${money.format(value)}`}
          curve="stepAfter"
          timelineStartDate={birthDate}
          birthDate={birthDate}
        />
        <CrayonLineChart
          title="淨資產變化"
          description="使用你手動記錄的淨資產歷史；同一天多筆紀錄以最後一筆為準。"
          data={netWorthSeries}
          series={[{ key: "value", name: "淨資產" }]}
          yLabel="淨資產（新台幣）"
          valueFormatter={(value) => `NT$ ${money.format(value)}`}
          curve="stepAfter"
          timelineStartDate={birthDate}
          birthDate={birthDate}
        />
      </div>
    </div>
  );
}
