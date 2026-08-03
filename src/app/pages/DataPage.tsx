import { useMutation, useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { v7 as uuidv7 } from "uuid";

import { apiGet, apiPost } from "@/app/api/client";
import { PageHeader } from "@/components/design-system/PageHeader";
import { EmptyState, Panel, StatusMark } from "@/components/design-system/Panel";
import { discardResolvedOperation, outboxCount } from "@/core/sync/client-db";
import { syncNow } from "@/core/sync/sync-manager";

async function downloadExport(path: string): Promise<void> {
  const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ operationId: uuidv7() }) });
  if (!response.ok) throw new Error(`匯出失敗（HTTP ${response.status}）`);
  const disposition = response.headers.get("content-disposition") ?? ""; const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? "life-manager-export";
  const url = URL.createObjectURL(await response.blob()); const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url);
}

export function DataPage() {
  const [error, setError] = useState<unknown>(null); const [busy, setBusy] = useState(false);
  const [restoreResult, setRestoreResult] = useState<Record<string, unknown> | null>(null);
  const conflicts = useQuery({ queryKey: ["sync-conflicts"], queryFn: () => apiGet<{ data: Array<Record<string, unknown>> }>("/api/v1/sync/conflicts").then((response) => response.data) });
  const pending = useQuery({ queryKey: ["outbox-count"], queryFn: outboxCount, refetchInterval: 5000 });
  const resolveConflict = useMutation({ mutationFn: async (input: { conflictId: string; resolution: "LOCAL" | "SERVER" | "MERGED"; mergedPayload?: Record<string, unknown> }) => {
    const response = await apiPost<{ data: { originalOperationId: string } }>(`/api/v1/sync/conflicts/${input.conflictId}/resolve`, { operationId: uuidv7(), data: { resolution: input.resolution, mergedPayload: input.mergedPayload } });
    await discardResolvedOperation(response.data.originalOperationId, input.conflictId);
    await syncNow();
  }, onSuccess: async () => { await Promise.all([conflicts.refetch(), pending.refetch()]); } });
  const exportFile = async (path: string) => { setBusy(true); setError(null); try { await downloadExport(path); } catch (caught) { setError(caught); } finally { setBusy(false); } };
  const restoreJson = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setBusy(true); setError(null); setRestoreResult(null); try { const form = new FormData(event.currentTarget); form.set("operationId", uuidv7()); const response = await fetch("/api/v1/imports/full", { method: "POST", body: form }); const body = await response.json() as { data?: Record<string, unknown>; error?: { message?: string } }; if (!response.ok) throw new Error(body.error?.message ?? `完整匯入失敗（HTTP ${response.status}）`); setRestoreResult(body.data ?? null); } catch (caught) { setError(caught); } finally { setBusy(false); } };
  const mergeConflict = (event: FormEvent<HTMLFormElement>, conflictId: string) => { event.preventDefault(); setError(null); try { const form = new FormData(event.currentTarget); const merged = JSON.parse(String(form.get("mergedPayload"))) as Record<string, unknown>; resolveConflict.mutate({ conflictId, resolution: "MERGED", mergedPayload: merged }); } catch (caught) { setError(caught); } };
  return <div className="page"><PageHeader eyebrow="PORTABILITY / RECOVERY" title="資料匯出、備份與同步衝突" description="完整 JSON 不含 OAuth token、電子郵件或 Push 端點明文；CSV 防止試算表公式注入。" />
    <div className="split-layout"><Panel title="完整可攜備份" index="01" tone="accent"><p className="support-copy">匯出所有正式模組、schema 版本、筆數與 SHA-256 checksum。下載後請保存到受控位置。</p><button className="button" disabled={busy} onClick={() => void exportFile("/api/v1/exports/full")}>下載完整 JSON</button>{error ? <p className="form-error">{error instanceof Error ? error.message : "資料操作失敗"}</p> : null}</Panel><Panel title="模組 CSV" index="02"><div className="button-grid">{["finance", "tasks", "social", "deadlines", "metrics", "events"].map((module) => <button className="button button--quiet" key={module} disabled={busy} onClick={() => void exportFile(`/api/v1/exports/${module}.csv`)}>{module}.csv</button>)}</div></Panel></div>
    <Panel title="完整 JSON 還原" index="02A"><p className="warning-line">只允許匯入已完成相同版本 migration、且沒有使用者正式資料的資料庫。匯入會先驗證 checksum；OAuth、Email、Push 等秘密不會還原，外部連線必須重新授權。</p><form className="inline-form" onSubmit={(event) => void restoreJson(event)}><label className="field"><span>完整匯出檔</span><input name="file" type="file" accept="application/json,.json" required /></label><label className="check-field"><input type="checkbox" required />我確認目標是空白正式資料庫</label><button className="button" disabled={busy}>驗證並還原</button></form>{restoreResult ? <pre className="code-result">{JSON.stringify(restoreResult, null, 2)}</pre> : null}</Panel>
    <Panel title="同步佇列與衝突" index="03"><div className="status-grid"><div><dt>此裝置待同步</dt><dd>{pending.data ?? 0}</dd></div><div><dt>伺服器未解衝突</dt><dd>{conflicts.data?.length ?? 0}</dd></div></div>{!conflicts.data?.length ? <EmptyState title="沒有待處理衝突" detail="同一版本跨裝置修改時，系統才會保留本機與伺服器內容供比較。" /> : <div className="conflict-list">{conflicts.data.map((item) => <article key={String(item.id)}><StatusMark tone="danger">版本衝突</StatusMark><strong>{String(item.entity_type)} · {String(item.entity_id)}</strong><pre className="code-result">{JSON.stringify(JSON.parse(String(item.field_diff_json)), null, 2)}</pre><div className="row-actions"><button className="button" type="button" disabled={resolveConflict.isPending} onClick={() => resolveConflict.mutate({ conflictId: String(item.id), resolution: "LOCAL" })}>採用本機</button><button className="button button--quiet" type="button" disabled={resolveConflict.isPending} onClick={() => resolveConflict.mutate({ conflictId: String(item.id), resolution: "SERVER" })}>採用伺服器</button></div><details className="inline-editor"><summary>手動合併 JSON</summary><form onSubmit={(event) => mergeConflict(event, String(item.id))}><textarea className="code-result" name="mergedPayload" defaultValue={JSON.stringify(JSON.parse(String(item.local_payload_json)), null, 2)} rows={10} required /><button className="button" disabled={resolveConflict.isPending}>保存合併</button></form></details></article>)}</div>} {resolveConflict.error || error ? <p className="form-error">{resolveConflict.error instanceof Error ? resolveConflict.error.message : error instanceof Error ? error.message : "衝突處理失敗"}</p> : null}</Panel>
    <Panel title="本機 D1 災難復原" index="04"><ol className="instruction-list"><li>用 <code>scripts/backup-local.ps1</code> 產生 SQL 備份與 SHA-256。</li><li>用 <code>scripts/restore-drill.ps1</code> 在隔離的暫存 D1 執行恢復演練。</li><li>演練驗證 schema 版本與所有核心資料表筆數後，才可把證據記入狀態文件。</li></ol></Panel>
  </div>;
}
