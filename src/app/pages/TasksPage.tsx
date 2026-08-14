import { useEffect, useRef, useState, type FormEvent } from "react";
import { v7 as uuidv7 } from "uuid";

import {
  createTaskWithInitialSchedule,
  listPendingTaskCommands,
  removePendingTaskCommand,
  type TaskWithInitialScheduleCommand,
} from "@/app/api/client";
import { useResource } from "@/app/hooks/use-resource";
import { Field, FormError, Select, TextArea, TextInput } from "@/components/design-system/FormFields";
import { PageHeader } from "@/components/design-system/PageHeader";
import { EmptyState, Panel, StatusMark } from "@/components/design-system/Panel";

interface Task extends Record<string, unknown> { id: string; title: string; version: number; archivedAt?: string | null }
interface Area extends Record<string, unknown> { id: string; name: string }
interface Business extends Record<string, unknown> { id: string; name: string; areaId: string }
interface Completion extends Record<string, unknown> { id: string; taskDefinitionId: string; scheduledLocalDate: string; completedAt: string }
interface Schedule extends Record<string, unknown> { id: string; taskDefinitionId: string; recurrenceKind: string; version: number; weekdays?: number[] | null }

export function TasksPage() {
  const tasks = useResource<Task>("tasks", "?includeArchived=true");
  const areas = useResource<Area>("areas");
  const businesses = useResource<Business>("businesses");
  const completions = useResource<Completion>("task-completions", "?limit=100");
  const schedules = useResource<Schedule>("task-schedules", "?limit=100");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [areaId, setAreaId] = useState("");
  const [recurrence, setRecurrence] = useState("DAILY");
  const [scheduleEnabled, setScheduleEnabled] = useState(true);
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine);
  const [pendingCommands, setPendingCommands] = useState<TaskWithInitialScheduleCommand[]>([]);
  const submitLock = useRef(false);

  const refreshTaskResources = async () => {
    await Promise.all([tasks.list.refetch(), schedules.list.refetch()]);
  };

  const refreshPendingCommands = async () => {
    setPendingCommands(await listPendingTaskCommands());
  };

  useEffect(() => {
    let disposed = false;
    void listPendingTaskCommands().then((commands) => {
      if (!disposed) setPendingCommands(commands);
    });
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      disposed = true;
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitLock.current) return;
    submitLock.current = true;
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(null);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const taskId = uuidv7();
    const recurrenceKind = String(form.get("recurrenceKind") ?? "DAILY");
    const task = {
      id: taskId,
      areaId: form.get("areaId") || null,
      businessId: form.get("businessId") || null,
      title: form.get("title"),
      description: form.get("description"),
      whyText: form.get("whyText"),
      completionCriteria: form.get("completionCriteria"),
      lowClarityGuide: form.get("lowClarityGuide"),
      metricRole: form.get("metricRole") || null,
      estimatedMinutes: form.get("estimatedMinutes") ? Number(form.get("estimatedMinutes")) : null,
      priority: Number(form.get("priority") ?? 50),
      pinnedNextAction: form.get("pinnedNextAction") === "on",
    };
    const schedule = scheduleEnabled ? {
      id: uuidv7(),
      taskDefinitionId: taskId,
      recurrenceKind,
      startsOnLocalDate: form.get("startsOnLocalDate"),
      dueLocalTime: form.get("dueLocalTime") || null,
      timezone: "Asia/Taipei",
      weekdays: recurrenceKind === "WEEKLY" ? form.getAll("weekdays").map(Number) : null,
      monthDay: recurrenceKind === "MONTHLY" ? Number(form.get("monthDay")) : null,
      rruleText: recurrenceKind === "CUSTOM_RRULE" ? form.get("rruleText") : null,
      intervalValue: Number(form.get("intervalValue") ?? 1),
      endsOnLocalDate: form.get("endsOnLocalDate") || null,
    } : null;
    try {
      const result = await createTaskWithInitialSchedule({ task, schedule });
      formElement.reset();
      setAreaId("");
      setRecurrence("DAILY");
      setScheduleEnabled(true);
      setSaveSuccess(result.pending
        ? "已保存在本機，任務與初始排程等待同步。"
        : result.meta.idempotentReplay
          ? "已恢復先前的任務保存結果，沒有重複建立。"
          : schedule ? "任務與初始排程已保存。"
            : "任務已保存，未建立初始排程。");
      void refreshTaskResources().catch(() => undefined);
      void refreshPendingCommands();
    } catch (error) {
      setSaveError(error);
      void refreshPendingCommands();
    } finally {
      submitLock.current = false;
      setSaving(false);
    }
  };

  const recoverPendingCommand = async (command: TaskWithInitialScheduleCommand) => {
    if (!online || submitLock.current) return;
    submitLock.current = true;
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(null);
    try {
      const result = await createTaskWithInitialSchedule({ ...command, operationId: command.operationId });
      await removePendingTaskCommand(command.operationId);
      setSaveSuccess(result.meta.idempotentReplay
        ? "已恢復先前的任務保存結果，沒有重複建立。"
        : "待恢復的任務與初始排程已保存。");
      void refreshTaskResources().catch(() => undefined);
      void refreshPendingCommands();
    } catch (error) {
      setSaveError(error);
      void refreshPendingCommands();
    } finally {
      submitLock.current = false;
      setSaving(false);
    }
  };
  const editTask = (event: FormEvent<HTMLFormElement>, task: Task) => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    tasks.update.mutate({ id: task.id, version: task.version, patch: { areaId: form.get("areaId") || null, businessId: form.get("businessId") || null, title: form.get("title"), description: form.get("description"), whyText: form.get("whyText"), completionCriteria: form.get("completionCriteria"), lowClarityGuide: form.get("lowClarityGuide"), metricRole: form.get("metricRole") || null, estimatedMinutes: form.get("estimatedMinutes") ? Number(form.get("estimatedMinutes")) : null, priority: Number(form.get("priority")), pinnedNextAction: form.get("pinnedNextAction") === "on" } });
  };
  const editSchedule = (event: FormEvent<HTMLFormElement>, schedule: Schedule) => { event.preventDefault(); const form = new FormData(event.currentTarget); const kind = String(form.get("recurrenceKind")); schedules.update.mutate({ id: schedule.id, version: schedule.version, patch: { recurrenceKind: kind, startsOnLocalDate: form.get("startsOnLocalDate"), dueLocalTime: form.get("dueLocalTime") || null, timezone: "Asia/Taipei", weekdays: kind === "WEEKLY" ? form.getAll("weekdays").map(Number) : null, monthDay: kind === "MONTHLY" ? Number(form.get("monthDay")) : null, rruleText: kind === "CUSTOM_RRULE" ? form.get("rruleText") : null, intervalValue: Number(form.get("intervalValue")), endsOnLocalDate: form.get("endsOnLocalDate") || null } }); };

  return (
    <div className="page">
      <PageHeader eyebrow="ACTION / RECURRENCE" title="每日與定期任務" description="每次完成都形成獨立歷史，不用一個布林值抹掉過去。週期以 Asia/Taipei 語意產生。" />
      {pendingCommands.length ? <Panel title="待恢復保存" index="00" tone="critical">
        <p className="support-copy">有一筆保存請求沒有收到伺服器回應；重新提交會沿用同一 operation，伺服器會以 idempotency 避免重複建立。</p>
        <div className="pending-command-list" data-testid="pending-task-commands">
          {pendingCommands.map((command) => <article key={command.operationId}>
            <div><strong>{String(command.task.title ?? "未命名任務")}</strong><small>{command.schedule ? "含初始排程" : "未含初始排程"} · operation {command.operationId}</small></div>
            <button className="button" type="button" disabled={saving || !online} onClick={() => void recoverPendingCommand(command)}>{online ? "重新提交保存" : "恢復網路後可重試"}</button>
          </article>)}
        </div>
      </Panel> : null}
      <Panel title="建立任務與排程" index="01" tone="accent">
        {!online ? <p className="offline-notice" role="status">目前離線：提交會保存在此裝置並等待同步；不會顯示未從伺服器取得的進度。</p> : null}
        <form className="form-grid form-grid--wide" aria-busy={saving} onSubmit={(event) => void submit(event)}>
          <Field label="任務名稱"><TextInput name="title" required maxLength={240} /></Field>
          <Field label="領域"><Select name="areaId" value={areaId} onChange={(event) => setAreaId(event.target.value)}><option value="">不指定</option>{areas.list.data?.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</Select></Field>
          <Field label="事業"><Select name="businessId"><option value="">不指定</option>{businesses.list.data?.filter((business) => !areaId || business.areaId === areaId).map((business) => <option key={business.id} value={business.id}>{business.name}</option>)}</Select></Field>
          <Field label="角色"><Select name="metricRole"><option value="">不指定</option><option value="ACTION">可控行動</option><option value="SYSTEM">系統</option><option value="CONDITION">條件</option><option value="CAPABILITY">能力</option><option value="OUTCOME">結果</option></Select></Field>
          <Field label="優先順序（0–100）"><TextInput name="priority" type="number" min="0" max="100" defaultValue="50" /></Field>
          <Field label="預估分鐘"><TextInput name="estimatedMinutes" type="number" min="0" /></Field>
          <Field label="說明"><TextArea name="description" rows={2} /></Field>
          <Field label="為什麼"><TextArea name="whyText" rows={2} /></Field>
          <Field label="完成條件"><TextArea name="completionCriteria" rows={2} /></Field>
          <Field label="狀態差時的指引"><TextArea name="lowClarityGuide" rows={2} /></Field>
          <label className="check-field"><input type="checkbox" name="createInitialSchedule" checked={scheduleEnabled} onChange={(event) => setScheduleEnabled(event.target.checked)} />同次建立初始排程（可稍後再設定）</label>
          {scheduleEnabled ? <>
            <Field label="週期"><Select name="recurrenceKind" value={recurrence} onChange={(event) => setRecurrence(event.target.value)}><option value="ONCE">一次性</option><option value="DAILY">每日</option><option value="WEEKLY">每週</option><option value="MONTHLY">每月</option><option value="CUSTOM_RRULE">自訂 RRULE</option></Select></Field>
            <Field label="開始日期"><TextInput name="startsOnLocalDate" type="date" required={scheduleEnabled} /></Field>
            <Field label="時間"><TextInput name="dueLocalTime" type="time" /></Field>
            <Field label="間隔"><TextInput name="intervalValue" type="number" min="1" max="365" defaultValue="1" /></Field>
            <Field label="結束日期"><TextInput name="endsOnLocalDate" type="date" /></Field>
            {recurrence === "WEEKLY" ? <fieldset className="weekday-field"><legend>星期</legend>{["一","二","三","四","五","六","日"].map((label, index) => <label key={label}><input type="checkbox" name="weekdays" value={index} />{label}</label>)}</fieldset> : null}
            {recurrence === "MONTHLY" ? <Field label="每月日期"><TextInput name="monthDay" type="number" min="1" max="31" required /></Field> : null}
            {recurrence === "CUSTOM_RRULE" ? <Field label="RRULE" hint="例如 FREQ=DAILY;INTERVAL=2"><TextInput name="rruleText" required /></Field> : null}
          </> : null}
          <label className="check-field"><input type="checkbox" name="pinnedNextAction" />釘選為下一步</label>
          <FormError error={saveError} />
          {saveSuccess ? <p className="success-line" role="status">{saveSuccess}</p> : null}
          <button className="button" type="submit" disabled={saving}>{saving ? "保存中…" : "建立任務"}</button>
        </form>
      </Panel>
      <Panel title="任務定義" index="02">
        {!tasks.list.data?.length ? <EmptyState title="尚無任務" detail="建立一次性或週期任務後，首頁會依到期日與優先順序顯示今日行動。" /> : null}
        <div className="data-table-wrap"><table className="data-table"><thead><tr><th>任務</th><th>角色</th><th>下一步</th><th>預估</th><th>狀態</th><th>操作</th></tr></thead><tbody>
          {tasks.list.data?.map((task) => <tr key={task.id}><td><strong>{task.title}</strong><small>{String(task.completionCriteria || "未填完成條件")}</small></td><td>{String(task.metricRole || "—")}</td><td>{String(task.lowClarityGuide || "—")}</td><td>{task.estimatedMinutes ? `${String(task.estimatedMinutes)} 分` : "—"}</td><td><StatusMark tone={task.archivedAt ? "neutral" : task.pending ? "pending" : "good"}>{task.archivedAt ? "已封存" : task.pending ? "待同步" : "啟用"}</StatusMark></td><td><details className="inline-editor"><summary>編輯</summary><form className="form-grid" onSubmit={(event) => editTask(event, task)}><Field label="領域"><Select name="areaId" defaultValue={String(task.areaId ?? "")}><option value="">不指定</option>{areas.list.data?.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</Select></Field><Field label="事業"><Select name="businessId" defaultValue={String(task.businessId ?? "")}><option value="">不指定</option>{businesses.list.data?.map((business) => <option key={business.id} value={business.id}>{business.name}</option>)}</Select></Field><Field label="任務名稱"><TextInput name="title" defaultValue={task.title} required /></Field><Field label="角色"><Select name="metricRole" defaultValue={String(task.metricRole ?? "")}><option value="">不指定</option><option value="ACTION">可控行動</option><option value="SYSTEM">系統</option><option value="CONDITION">條件</option><option value="CAPABILITY">能力</option><option value="OUTCOME">結果</option></Select></Field><Field label="優先順序"><TextInput name="priority" type="number" min="0" max="100" defaultValue={Number(task.priority ?? 50)} required /></Field><Field label="預估分鐘"><TextInput name="estimatedMinutes" type="number" min="0" defaultValue={task.estimatedMinutes == null ? "" : Number(task.estimatedMinutes)} /></Field><Field label="說明"><TextArea name="description" defaultValue={String(task.description ?? "")} /></Field><Field label="為什麼"><TextArea name="whyText" defaultValue={String(task.whyText ?? "")} /></Field><Field label="完成條件"><TextArea name="completionCriteria" defaultValue={String(task.completionCriteria ?? "")} /></Field><Field label="狀態差時的指引"><TextArea name="lowClarityGuide" defaultValue={String(task.lowClarityGuide ?? "")} /></Field><label className="check-field"><input type="checkbox" name="pinnedNextAction" defaultChecked={Boolean(task.pinnedNextAction)} />釘選為下一步</label><button className="button">保存修改</button><button className="button button--quiet" type="button" onClick={() => tasks.archive.mutate({ id: task.id, version: task.version, restore: Boolean(task.archivedAt) })}>{task.archivedAt ? "恢復" : "封存"}</button></form></details></td></tr>)}
        </tbody></table></div>
      </Panel>
      <Panel title="排程設定" index="02A">{!schedules.list.data?.length ? <EmptyState title="尚無排程" detail="建立任務時會同時保存正式排程。" /> : <div className="data-table-wrap"><table className="data-table"><thead><tr><th>任務</th><th>週期</th><th>開始／結束</th><th>操作</th></tr></thead><tbody>{schedules.list.data.map((schedule) => <tr key={schedule.id}><td>{tasks.list.data?.find((task) => task.id === schedule.taskDefinitionId)?.title ?? schedule.taskDefinitionId}</td><td>{schedule.recurrenceKind} · 每 {String(schedule.intervalValue)} 單位</td><td>{String(schedule.startsOnLocalDate)}–{String(schedule.endsOnLocalDate ?? "持續")}</td><td><details className="inline-editor"><summary>編輯排程</summary><form className="form-grid" onSubmit={(event) => editSchedule(event, schedule)}><Field label="週期"><Select name="recurrenceKind" defaultValue={schedule.recurrenceKind}><option value="ONCE">一次性</option><option value="DAILY">每日</option><option value="WEEKLY">每週</option><option value="MONTHLY">每月</option><option value="CUSTOM_RRULE">自訂 RRULE</option></Select></Field><Field label="開始日期"><TextInput name="startsOnLocalDate" type="date" defaultValue={String(schedule.startsOnLocalDate)} required /></Field><Field label="時間"><TextInput name="dueLocalTime" type="time" defaultValue={String(schedule.dueLocalTime ?? "")} /></Field><Field label="間隔"><TextInput name="intervalValue" type="number" min="1" max="365" defaultValue={Number(schedule.intervalValue)} required /></Field><Field label="結束日期"><TextInput name="endsOnLocalDate" type="date" defaultValue={String(schedule.endsOnLocalDate ?? "")} /></Field><fieldset className="weekday-field"><legend>每週星期</legend>{["一","二","三","四","五","六","日"].map((label, index) => <label key={label}><input type="checkbox" name="weekdays" value={index} defaultChecked={schedule.weekdays?.includes(index)} />{label}</label>)}</fieldset><Field label="每月日期"><TextInput name="monthDay" type="number" min="1" max="31" defaultValue={schedule.monthDay == null ? "" : Number(schedule.monthDay)} /></Field><Field label="RRULE"><TextInput name="rruleText" defaultValue={String(schedule.rruleText ?? "")} /></Field><button className="button">保存排程</button><button className="button button--quiet" type="button" onClick={() => schedules.archive.mutate({ id: schedule.id, version: schedule.version })}>刪除排程</button></form></details></td></tr>)}</tbody></table></div>}<FormError error={schedules.update.error || schedules.archive.error} /></Panel>
      <Panel title="完成歷史" index="03">{!completions.list.data?.length ? <EmptyState title="尚無完成紀錄" detail="每次完成會新增獨立紀錄，不會覆蓋任務定義或過去歷史。" /> : <div className="data-table-wrap"><table className="data-table"><thead><tr><th>任務</th><th>預定日期</th><th>實際完成</th><th>備註／數值</th><th>來源</th></tr></thead><tbody>{completions.list.data.map((completion) => <tr key={completion.id}><td>{tasks.list.data?.find((task) => task.id === completion.taskDefinitionId)?.title ?? completion.taskDefinitionId}</td><td>{completion.scheduledLocalDate}</td><td>{new Date(completion.completedAt).toLocaleString("zh-TW")}</td><td>{String(completion.note || "—")}{completion.numericValue == null ? "" : ` · ${String(completion.numericValue)}`}</td><td>{String(completion.sourceType)}</td></tr>)}</tbody></table></div>}</Panel>
    </div>
  );
}
