import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { v7 as uuidv7 } from "uuid";

import { apiGet, apiPost } from "@/app/api/client";
import { cacheQuery, commitOfflineMutation, readCachedQuery } from "@/core/sync/client-db";
import { PageHeader } from "@/components/design-system/PageHeader";
import { EmptyState, Panel, StatusMark } from "@/components/design-system/Panel";

interface Dashboard {
  today: string;
  todayActions: Array<Record<string, unknown>>;
  deadlineWarnings: Array<Record<string, unknown>>;
  providerConnections: Array<Record<string, unknown>>;
  cachedAt?: string;
}

async function loadDashboard(): Promise<Dashboard> {
  try {
    const response = await apiGet<{ data: Dashboard }>("/api/v1/dashboard");
    await cacheQuery("dashboard", response.data);
    return response.data;
  } catch (error) {
    if (!navigator.onLine || error instanceof TypeError) {
      const cached = await readCachedQuery<Dashboard>("dashboard");
      if (cached) return { ...cached.value, cachedAt: cached.cachedAt };
    }
    throw error;
  }
}

function nextLocalDate(localDate: string): string {
  const date = new Date(`${localDate}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function DeferControl(props: {
  action: Record<string, unknown>;
  pending: boolean;
  onDefer: (action: Record<string, unknown>, deferredToLocalDate: string) => void;
}) {
  const effectiveDate = String(props.action.effective_local_date ?? props.action.scheduled_local_date);
  const [deferredToLocalDate, setDeferredToLocalDate] = useState(nextLocalDate(effectiveDate));
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    props.onDefer(props.action, deferredToLocalDate);
  };
  return (
    <form className="action-list__defer" onSubmit={submit}>
      <label>
        <span>延後至</span>
        <input aria-label={`延後「${String(props.action.title)}」至`} type="date" min={nextLocalDate(effectiveDate)} value={deferredToLocalDate} onChange={(event) => setDeferredToLocalDate(event.target.value)} required />
      </label>
      <button className="button button--quiet" type="submit" disabled={props.pending}>延後</button>
    </form>
  );
}

export function HomePage() {
  const queryClient = useQueryClient();
  const dashboard = useQuery({ queryKey: ["dashboard"], queryFn: loadDashboard });
  const complete = useMutation({
    mutationFn: async (action: Record<string, unknown>) => {
      const data = {
        id: uuidv7(),
        taskDefinitionId: action.task_id,
        taskOccurrenceId: action.occurrence_id,
        scheduledLocalDate: action.scheduled_local_date,
        completedAt: new Date().toISOString(),
        note: "",
        numericValue: null,
        metricDefinitionId: null,
      };
      if (!navigator.onLine) {
        await commitOfflineMutation({ entityType: "task-completions", entityId: data.id, kind: "APPEND", baseVersion: null, payload: data });
        return action;
      }
      await apiPost("/api/v1/task-completions", { operationId: uuidv7(), data });
      return action;
    },
    onSuccess: (action) => {
      const current = queryClient.getQueryData<Dashboard>(["dashboard"]);
      if (current) {
        const next = { ...current, todayActions: current.todayActions.filter((item) => item.occurrence_id !== action.occurrence_id) };
        queryClient.setQueryData(["dashboard"], next);
        if (!navigator.onLine) void cacheQuery("dashboard", next);
      }
      if (navigator.onLine) void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
  const defer = useMutation({
    mutationFn: async ({ action, deferredToLocalDate }: { action: Record<string, unknown>; deferredToLocalDate: string }) => {
      const occurrenceId = String(action.occurrence_id);
      const baseVersion = Number(action.occurrence_version);
      const data = { taskOccurrenceId: occurrenceId, baseVersion, deferredToLocalDate };
      if (!navigator.onLine) {
        await commitOfflineMutation({ entityType: "task-deferrals", entityId: occurrenceId, kind: "APPEND", baseVersion, payload: data });
      } else {
        await apiPost(`/api/v1/task-occurrences/${occurrenceId}/defer`, { operationId: uuidv7(), data });
      }
      return { action, deferredToLocalDate };
    },
    onSuccess: ({ action }) => {
      const current = queryClient.getQueryData<Dashboard>(["dashboard"]);
      if (current) {
        const next = { ...current, todayActions: current.todayActions.filter((item) => item.occurrence_id !== action.occurrence_id) };
        queryClient.setQueryData(["dashboard"], next);
        if (!navigator.onLine) void cacheQuery("dashboard", next);
      }
      if (navigator.onLine) void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
  const data = dashboard.data;
  const critical = data?.deadlineWarnings.filter((item) => item.importance === "SUPER_CRITICAL") ?? [];
  return (
    <div className="page page--home">
      <PageHeader eyebrow="COMMAND / TODAY" title="今天先推進什麼" description="先做已決定的重要行動，再看整體狀態。這裡不會用分數取代你的判斷。" />
      <Panel title="今日行動中心" index="01" tone="accent">
        {critical.length ? <a className="critical-inline-entry" href="/deadlines"><strong>超級無敵重要期限</strong><span>{String(critical[0].name)}已進入處理期間，完成前持續顯示。</span></a> : null}
        {dashboard.isLoading ? <p className="loading-line">讀取今日行動…</p> : null}
        {dashboard.error ? <p className="form-error">{dashboard.error.message}</p> : null}
        {data?.cachedAt ? <p className="offline-notice">目前離線，顯示 {new Date(data.cachedAt).toLocaleString("zh-TW")} 的最近同步資料。</p> : null}
        {data && !data.todayActions.length ? <EmptyState title="今天尚無排定行動" detail="建立任務與週期後，到期、逾期與釘選下一步會顯示在這裡。" action={<a className="button" href="/tasks">建立任務</a>} /> : null}
        <ol className="action-list">
          {data?.todayActions.map((action) => {
            const effectiveDate = String(action.effective_local_date ?? action.scheduled_local_date);
            const overdue = effectiveDate < data.today;
            return (
              <li key={String(action.occurrence_id)}>
                <div className="action-list__rank">{String(action.priority).padStart(2, "0")}</div>
                <div className="action-list__content">
                  <div><strong>{String(action.title)}</strong>{overdue ? <StatusMark tone="danger">逾期</StatusMark> : <StatusMark tone="neutral">今日</StatusMark>}</div>
                  <p>{String(action.low_clarity_guide || action.completion_criteria || "尚未填寫狀態差時的指引")}</p>
                  <small>預定 {String(action.scheduled_local_date)}{action.deferred_to_local_date ? ` · 已延至 ${String(action.deferred_to_local_date)}` : ""} · {action.estimated_minutes ? `${String(action.estimated_minutes)} 分鐘` : "未估時間"}</small>
                </div>
                <div className="action-list__controls">
                  <button className="button" type="button" disabled={complete.isPending || defer.isPending} onClick={() => complete.mutate(action)}>完成</button>
                  <DeferControl action={action} pending={complete.isPending || defer.isPending} onDefer={(item, deferredToLocalDate) => defer.mutate({ action: item, deferredToLocalDate })} />
                </div>
              </li>
            );
          })}
        </ol>
        {complete.error ? <p className="form-error">{complete.error.message}</p> : null}
        {defer.error ? <p className="form-error">{defer.error.message}</p> : null}
      </Panel>
      {critical.length ? (
        <aside className="critical-interrupt" role="alertdialog" aria-label="超級無敵重要期限">
          <span>SUPER CRITICAL</span>
          <div><strong>{String(critical[0].name)}</strong><p>已進入處理期間；完成前會持續顯示。</p></div>
          <a className="button button--danger" href="/deadlines">立即處理</a>
        </aside>
      ) : null}
      <div className="home-grid">
        <Panel title="重要期限" index="02">
          {data && !data.deadlineWarnings.length ? <EmptyState title="沒有已啟動期限" detail="只有超級無敵重要與超級重要兩級會出現在這裡。" /> : null}
          <ul className="compact-list">
            {data?.deadlineWarnings.map((deadline) => <li key={String(deadline.id)}><StatusMark tone={deadline.importance === "SUPER_CRITICAL" ? "danger" : "warn"}>{deadline.importance === "SUPER_CRITICAL" ? "超級無敵重要" : "超級重要"}</StatusMark><strong>{String(deadline.name)}</strong><span>開始：{String(deadline.actionable_from_local_date)}</span></li>)}
          </ul>
        </Panel>
        <Panel title="系統狀態" index="03">
          <dl className="status-grid">
            <div><dt>資料日期</dt><dd>{data?.today ?? "—"}</dd></div>
            <div><dt>外部連線</dt><dd>{data?.providerConnections.length ?? 0}</dd></div>
            <div><dt>錯誤連線</dt><dd>{data?.providerConnections.filter((item) => item.status !== "CONNECTED").length ?? 0}</dd></div>
            <div><dt>資料品質</dt><dd>{data ? "依來源呈現" : "尚未載入"}</dd></div>
          </dl>
        </Panel>
      </div>
      <Panel title="人生面板入口" index="04">
        <div className="module-strips">
          <a href="/areas"><span>ACTION / SYSTEM / CAPABILITY / OUTCOME</span><strong>領域與事業</strong></a>
          <a href="/finance"><span>MONEY / ASSET / BASELINE</span><strong>財務與淨值</strong></a>
          <a href="/social"><span>CONTENT / EVENT / CONVERSION</span><strong>社群分析</strong></a>
        </div>
      </Panel>
    </div>
  );
}
