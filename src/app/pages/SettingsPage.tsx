import type { FormEvent } from "react";

import { useResource } from "@/app/hooks/use-resource";
import { useSyncState } from "@/app/providers/SyncProvider";
import { ageOnDate, daysUntilNextBirthday, taipeiDate } from "@/modules/simple/date";
import type { FinancialGoal, FinancialHistory, UserProfile } from "@/modules/simple/model";
import type { FinancialGoalKind, FinancialMetricKind } from "@/modules/simple/schema";

const money = new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 0 });

const labels: Record<FinancialMetricKind, string> = {
  MONTHLY_INCOME: "固定月收入",
  SAVINGS: "積蓄",
};

function parseAmount(value: FormDataEntryValue | null, nullable = false): number | null {
  const text = String(value ?? "").trim();
  if (!text && nullable) return null;
  const number = Number(text);
  return Number.isInteger(number) ? number : null;
}

function errorText(error: unknown): string | null {
  return error instanceof Error ? error.message : error ? "操作失敗。" : null;
}

function GoalEditor({ goal, onSave, busy }: {
  goal: FinancialGoal;
  onSave: (goal: FinancialGoal, amount: number | null) => void;
  busy: boolean;
}) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSave(goal, parseAmount(form.get("amount"), true));
  };
  return (
    <form className="goal-editor" onSubmit={submit}>
      <label>{labels[goal.goalKind]}
        <span className="money-input"><b>NT$</b><input name="amount" type="number" min="0" step="1" defaultValue={goal.amountMinor ?? ""} placeholder="尚未設定" /></span>
      </label>
      <button className="crayon-button" disabled={busy}>儲存目標</button>
    </form>
  );
}

function HistorySection({
  metricKind,
  history,
  busy,
  onUpdate,
  onDelete,
}: {
  metricKind: FinancialMetricKind;
  history: FinancialHistory[];
  busy: boolean;
  onUpdate: (event: FormEvent<HTMLFormElement>, record: FinancialHistory) => void;
  onDelete: (record: FinancialHistory) => void;
}) {
  const rows = history
    .filter((record) => record.metricKind === metricKind)
    .sort((a, b) => b.effectiveLocalDate.localeCompare(a.effectiveLocalDate) || String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")));
  return (
    <section className="history-section">
      <header><h3>{labels[metricKind]}歷史</h3><span>{rows.length} 筆</span></header>
      {!rows.length ? <div className="empty-note compact-empty">尚無紀錄。</div> : (
        <div className="history-list">
          {rows.map((record) => (
            <article className="history-row" key={record.id}>
              <form onSubmit={(event) => onUpdate(event, record)}>
                <input name="date" type="date" defaultValue={record.effectiveLocalDate} max={taipeiDate()} required aria-label={`${labels[metricKind]}日期`} />
                <span className="money-input compact-money"><b>NT$</b><input name="amount" type="number" step="1" min={metricKind === "MONTHLY_INCOME" ? 0 : undefined} defaultValue={record.amountMinor} required aria-label={`${labels[metricKind]}金額`} /></span>
                <button className="paper-button" disabled={busy}>儲存修正</button>
              </form>
              <button className="danger-pencil" type="button" disabled={busy} onClick={() => onDelete(record)}>刪除</button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export function SettingsPage() {
  const today = taipeiDate();
  const profileResource = useResource<UserProfile>("user-profile");
  const goalsResource = useResource<FinancialGoal>("financial-goals");
  const historyResource = useResource<FinancialHistory>("financial-history");
  const sync = useSyncState();
  const profile = (profileResource.list.data ?? [])[0] ?? null;
  const goals = goalsResource.list.data ?? [];
  const history = historyResource.list.data ?? [];
  const age = profile?.birthDate ? ageOnDate(profile.birthDate, today) : null;
  const birthdayDays = profile?.birthDate ? daysUntilNextBirthday(profile.birthDate, today) : null;

  const saveProfile = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!profile) return;
    const form = new FormData(event.currentTarget);
    const birthDate = String(form.get("birthDate") ?? "").trim() || null;
    if (birthDate && birthDate > today) return;
    profileResource.update.mutate({ id: profile.id, version: profile.version, patch: { birthDate } });
  };

  const saveGoal = (goal: FinancialGoal, amountMinor: number | null) => {
    goalsResource.update.mutate({ id: goal.id, version: goal.version, patch: { amountMinor } });
  };

  const addHistory = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const metricKind = String(form.get("metricKind")) as FinancialMetricKind;
    const amountMinor = parseAmount(form.get("amount"));
    const effectiveLocalDate = String(form.get("date"));
    if (amountMinor === null || !effectiveLocalDate || effectiveLocalDate > today || !(metricKind in labels)) return;
    historyResource.create.mutate({ metricKind, effectiveLocalDate, amountMinor, currencyCode: "TWD", minorUnitScale: 0 });
    event.currentTarget.reset();
  };

  const updateHistory = (event: FormEvent<HTMLFormElement>, record: FinancialHistory) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const amountMinor = parseAmount(form.get("amount"));
    const effectiveLocalDate = String(form.get("date"));
    if (amountMinor === null || !effectiveLocalDate || effectiveLocalDate > today) return;
    historyResource.update.mutate({ id: record.id, version: record.version, patch: { amountMinor, effectiveLocalDate } });
  };

  const deleteHistory = (record: FinancialHistory) => {
    if (!window.confirm(`確定刪除 ${record.effectiveLocalDate} 的${labels[record.metricKind]}紀錄（NT$ ${money.format(record.amountMinor)}）？`)) return;
    historyResource.remove.mutate({ id: record.id, version: record.version });
  };

  const busy = profileResource.update.isPending || goalsResource.update.isPending || historyResource.create.isPending
    || historyResource.update.isPending || historyResource.remove.isPending;
  const error = profileResource.list.error ?? goalsResource.list.error ?? historyResource.list.error
    ?? profileResource.update.error ?? goalsResource.update.error ?? historyResource.create.error
    ?? historyResource.update.error ?? historyResource.remove.error;

  return (
    <div className="page crayon-page">
      <header className="hero-scribble compact-hero">
        <div>
          <p className="eyebrow">設定</p>
          <h1>目標、歷史與維護</h1>
          <p>目標只保存目前設定；實際固定月收入與積蓄則以每一筆歷史紀錄為準。</p>
        </div>
      </header>

      {error ? <p className="notice-strip notice-strip--danger">{errorText(error)}</p> : null}

      <section className="crayon-panel profile-panel">
        <div className="panel-heading"><div><p className="eyebrow">人生時間</p><h2>出生年月日</h2></div></div>
        {profile ? (
          <div className="profile-settings-grid">
            <form className="profile-date-form" onSubmit={saveProfile}>
              <label>出生年月日<input name="birthDate" type="date" defaultValue={profile.birthDate ?? ""} max={today} /></label>
              <button className="crayon-button" disabled={busy}>儲存</button>
            </form>
            <div className="life-stat-pair" aria-label="年齡與生日倒數">
              <div><strong>{age ?? "—"}</strong><span>歲</span></div>
              <div><strong>{birthdayDays ?? "—"}</strong><span>天後生日</span></div>
            </div>
          </div>
        ) : <div className="empty-note">缺少個人設定資料列，請先套用最新資料庫 migration。</div>}
      </section>

      <section className="crayon-panel">
        <div className="panel-heading"><div><p className="eyebrow">目標</p><h2>財務目標</h2></div></div>
        <div className="goal-grid">
          {(["MONTHLY_INCOME", "SAVINGS"] as FinancialGoalKind[]).map((kind) => {
            const goal = goals.find((item) => item.goalKind === kind);
            return goal ? <GoalEditor key={kind} goal={goal} onSave={saveGoal} busy={busy} /> : <div className="empty-note" key={kind}>缺少 {labels[kind]} 目標資料列，請先套用最新資料庫 migration。</div>;
          })}
        </div>
      </section>

      <section className="crayon-panel">
        <div className="panel-heading">
          <div><p className="eyebrow">實際紀錄</p><h2>新增收入或積蓄紀錄</h2></div>
          <span className="tiny-note">首頁的「目前值」永遠取日期最新的一筆有效紀錄。</span>
        </div>
        <form className="history-add-form" onSubmit={addHistory}>
          <label>項目<select name="metricKind" defaultValue="MONTHLY_INCOME"><option value="MONTHLY_INCOME">固定月收入</option><option value="SAVINGS">積蓄</option></select></label>
          <label>日期<input name="date" type="date" defaultValue={today} max={today} required /></label>
          <label>金額<span className="money-input"><b>NT$</b><input name="amount" type="number" step="1" required /></span></label>
          <button className="crayon-button" disabled={busy}>新增紀錄</button>
        </form>
        <div className="history-columns">
          <HistorySection metricKind="MONTHLY_INCOME" history={history} busy={busy} onUpdate={updateHistory} onDelete={deleteHistory} />
          <HistorySection metricKind="SAVINGS" history={history} busy={busy} onUpdate={updateHistory} onDelete={deleteHistory} />
        </div>
      </section>

      <section className="crayon-panel maintenance-panel">
        <div className="panel-heading"><div><p className="eyebrow">維護</p><h2>同步狀態</h2></div></div>
        <div className="maintenance-row">
          <div><strong>{sync.lastError ? "同步發生錯誤" : sync.syncing ? "正在同步" : `${sync.pendingCount} 筆待同步`}</strong><span>{sync.lastError ?? "離線輸入會先留在這台裝置，恢復網路後再送到 D1。"}</span></div>
          <button className="paper-button" type="button" disabled={sync.syncing} onClick={() => void sync.sync()}>立即同步</button>
        </div>
      </section>
    </div>
  );
}
