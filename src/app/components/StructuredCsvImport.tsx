import { useRef, useState, type FormEvent } from "react";
import { v7 as uuidv7 } from "uuid";

import { Field, Select, TextInput } from "@/components/design-system/FormFields";

export function StructuredCsvImport(props: {
  moduleKey: "metrics" | "social";
  definitions: Array<{ id: string; label: string }>;
  onImported: () => void | Promise<void>;
}) {
  const formReference = useRef<HTMLFormElement>(null);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const request = async (path: string, form: HTMLFormElement) => {
    const data = new FormData(form);
    data.set("moduleKey", props.moduleKey);
    data.set("operationId", uuidv7());
    data.set("mapping", JSON.stringify({ observedAt: data.get("observedAtColumn"), value: data.get("valueColumn"), ...(props.moduleKey === "social" ? { targetId: data.get("targetIdColumn") } : {}) }));
    const response = await fetch(path, { method: "POST", body: data });
    const body = await response.json() as { data?: Record<string, unknown>; error?: { message?: string } };
    if (!response.ok) throw new Error(body.error?.message ?? `CSV處理失敗（HTTP ${response.status}）`);
    setResult(body.data ?? null);
  };

  const preview = async () => {
    if (!formReference.current) return; setBusy(true); setError(null);
    try { await request("/api/v1/imports/structured/preview", formReference.current); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "CSV預覽失敗"); }
    finally { setBusy(false); }
  };
  const commit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError(null);
    try { await request("/api/v1/imports/structured", event.currentTarget); await props.onImported(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "CSV匯入失敗"); }
    finally { setBusy(false); }
  };

  return <form ref={formReference} className="form-grid" onSubmit={(event) => void commit(event)}>
    <Field label="CSV檔案"><input name="file" type="file" accept=".csv,text/csv" required /></Field>
    <Field label="映射設定名稱"><TextInput name="profileName" placeholder="例如：後台匯出-v1" required /></Field>
    <Field label="寫入指標"><Select name="definitionId" required><option value="">請選擇</option>{props.definitions.map((definition) => <option key={definition.id} value={definition.id}>{definition.label}</option>)}</Select></Field>
    <Field label="觀測時間欄名"><TextInput name="observedAtColumn" defaultValue="observed_at" required /></Field>
    <Field label="數值欄名"><TextInput name="valueColumn" defaultValue="value" required /></Field>
    {props.moduleKey === "social" ? <><Field label="目標ID欄名"><TextInput name="targetIdColumn" defaultValue="target_id" required /></Field><Field label="目標類型"><Select name="targetKind"><option value="POST">貼文ID</option><option value="ACCOUNT">帳號ID</option></Select></Field></> : null}
    <div className="row-actions"><button className="button button--quiet" type="button" disabled={busy} onClick={() => void preview()}>後端預覽</button><button className="button" disabled={busy}>驗證並匯入</button></div>
    {error ? <p className="form-error">{error}</p> : null}
    {result ? <pre className="code-result">{JSON.stringify(result, null, 2)}</pre> : null}
  </form>;
}
