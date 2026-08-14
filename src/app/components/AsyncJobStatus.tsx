/* eslint-disable react-refresh/only-export-components */
import { useQuery } from "@tanstack/react-query";

import { apiGet } from "@/app/api/client";
import { EmptyState, StatusMark } from "@/components/design-system/Panel";
import type { AsyncJobOutput } from "@/modules/async-jobs/schema";

export type AsyncJobKind = "PROVIDER_SYNC" | "CSV_IMPORT";

export interface AsyncJobPage {
  data: AsyncJobOutput[];
  meta: { requestId: string; contractVersion: "async-job.v1"; nextCursor: string | null };
}

export function useAsyncJobs(kind: AsyncJobKind, enabled = true) {
  return useQuery({
    queryKey: ["async-jobs", kind],
    queryFn: ({ signal }) => apiGet<AsyncJobPage>(`/api/v1/async-jobs?kind=${kind}&limit=50`, signal),
    enabled,
    staleTime: 0,
    retry: false,
    refetchInterval: kind === "PROVIDER_SYNC" ? 4_000 : false,
  });
}

interface AsyncJobStatusProps {
  job: AsyncJobOutput | null;
  isLoading?: boolean;
  error?: unknown;
  waitingForJob?: boolean;
  onReload: () => void;
  title?: string;
}

function statusLabel(status: AsyncJobOutput["status"]): string {
  const labels: Record<AsyncJobOutput["status"], string> = {
    QUEUED: "QUEUED／排隊中",
    CLAIMED: "CLAIMED／已接手",
    RUNNING: "RUNNING／執行中",
    RETRY_WAIT: "RETRY_WAIT／等待重試",
    SUCCEEDED: "SUCCEEDED／成功",
    PARTIAL: "PARTIAL／部分完成",
    FAILED: "FAILED／失敗",
    CANCELLED: "CANCELLED／已取消",
    PAUSED: "PAUSED／已暫停",
    DEAD_LETTER: "DEAD_LETTER／待人工處理",
  };
  return labels[status];
}

function phaseLabel(phase: AsyncJobOutput["phase"]): string {
  return phase === "VALIDATING" ? "VALIDATING／驗證中" : statusLabel(phase);
}

function statusTone(status: AsyncJobOutput["status"]): "neutral" | "good" | "warn" | "danger" | "pending" {
  if (status === "SUCCEEDED") return "good";
  if (status === "PARTIAL" || status === "RETRY_WAIT" || status === "PAUSED" || status === "QUEUED" || status === "CLAIMED") return "pending";
  if (status === "RUNNING") return "warn";
  if (status === "FAILED" || status === "DEAD_LETTER") return "danger";
  return "neutral";
}

function formatTimestamp(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString("zh-TW");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "非同步工作狀態讀取失敗。";
}

function sourceCounterText(job: AsyncJobOutput): string {
  const entries = Object.entries(job.sourceCounters).filter(([, value]) => value !== null && value !== undefined);
  return entries.length ? entries.map(([key, value]) => `${key}=${String(value)}`).join(" · ") : "來源未回報 counters";
}

function counterValue(value: number | null | undefined): string {
  return value === null || value === undefined ? "未回報" : String(value);
}

export function AsyncJobStatus({ job, isLoading = false, error, waitingForJob = false, onReload, title = "非同步工作狀態" }: AsyncJobStatusProps) {
  if (isLoading && !job) return <p className="loading-line" role="status" data-async-job-status="loading">讀取伺服器工作狀態中…</p>;
  if (error && !job) return <div className="async-job-status" data-async-job-status="error"><p className="form-error" role="alert">{errorMessage(error)}</p><button className="button button--quiet" type="button" onClick={onReload}>重新載入工作狀態</button></div>;
  if (!job) {
    return waitingForJob
      ? <p className="loading-line" role="status" data-async-job-status="waiting">同步請求已送出，等待伺服器建立 persisted 工作紀錄…</p>
      : <div data-async-job-status="empty"><EmptyState title="尚無同步工作紀錄" detail="伺服器尚未回報此連線的非同步工作；不顯示估算進度或 ETA。" /></div>;
  }

  const { counters, capabilities } = job;
  return <section className="async-job-status" data-async-job-status="ready" aria-label={title}>
    <header className="async-job-status__header">
      <div><strong>{title}</strong><small>async-job.v1 · {job.kind} · {job.id}</small></div>
      <StatusMark tone={statusTone(job.status)}>{statusLabel(job.status)}</StatusMark>
    </header>
    <dl className="definition-grid async-job-status__summary">
      <div><dt>目前 phase</dt><dd>{phaseLabel(job.phase)}</dd></div>
      <div><dt>最後更新</dt><dd><time dateTime={job.lastUpdatedAt}>{formatTimestamp(job.lastUpdatedAt)}</time></dd></div>
      <div><dt>嘗試次數</dt><dd>{job.attempt} / {job.maxAttempts}</dd></div>
      <div><dt>下次執行</dt><dd>{job.nextRunAt ? formatTimestamp(job.nextRunAt) : "未回報"}</dd></div>
    </dl>
    <div className="async-job-status__section">
      <h4>處理 counters</h4>
      {job.progress ? <p className="support-copy">同一資料單位：{job.progress.processed} / {job.progress.total}</p> : <p className="support-copy">未提供同一單位 total；不顯示百分比或 ETA。</p>}
      <dl className="status-grid">
        <div><dt>processed</dt><dd>{counterValue(counters.processed)}</dd></div>
        <div><dt>total</dt><dd>{counterValue(counters.total)}</dd></div>
        <div><dt>succeeded</dt><dd>{counterValue(counters.succeeded)}</dd></div>
        <div><dt>skipped</dt><dd>{counterValue(counters.skipped)}</dd></div>
        <div><dt>failed</dt><dd>{counterValue(counters.failed)}</dd></div>
      </dl>
    </div>
    <div className="async-job-status__section">
      <h4>來源 counters</h4>
      <p className="support-copy">{sourceCounterText(job)}</p>
      <p className="support-copy">counter invariant：{job.counterInvariant}</p>
    </div>
    {job.error ? <p className="form-error" role="alert">{job.error.code} · {job.error.message}</p> : null}
    {job.warnings.length ? <div className="warning-line" role="status">{job.warnings.join(" ")}</div> : null}
    <dl className="definition-grid async-job-status__capabilities">
      <div><dt>重試</dt><dd>{capabilities.retrySupported ? "伺服器回報支援；此頁未猜測額外 endpoint。" : "伺服器明示不支援"}</dd></div>
      <div><dt>取消</dt><dd>{capabilities.cancelSupported ? "伺服器回報支援；此頁未猜測額外 endpoint。" : "伺服器明示不支援"}</dd></div>
      <div><dt>reload recovery</dt><dd>{capabilities.reloadRecovery ? "可重新載入讀取 persisted state" : "伺服器未提供"}</dd></div>
      <div><dt>背景續作</dt><dd>{capabilities.backgroundContinuation ? "可繼續" : "不保證"}</dd></div>
    </dl>
    <details className="async-job-status__details" open>
      <summary>歷史與 provenance</summary>
      <p><strong>來源：</strong>{job.provenance.sourceTable}／{job.provenance.sourceId} · 更新 {formatTimestamp(job.provenance.sourceUpdatedAt)}</p>
      <p><strong>counter 定義：</strong>{job.provenance.counterSemantics}</p>
      {job.history.length ? <ol>{job.history.map((entry) => <li key={entry.id}><strong>{statusLabel(entry.status)}</strong> · {phaseLabel(entry.phase)} · {formatTimestamp(entry.startedAt)}{entry.completedAt ? `–${formatTimestamp(entry.completedAt)}` : ""} · {sourceCounterText({ ...job, sourceCounters: entry.sourceCounters })}</li>)}</ol> : <p className="support-copy">尚無 persisted history。</p>}
    </details>
    <button className="button button--quiet" type="button" onClick={onReload}>重新載入工作狀態</button>
  </section>;
}
