import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { v7 as uuidv7 } from "uuid";

import { apiGet, apiPost, apiPostLongRunning } from "@/app/api/client";
import { integrationConnectionAction } from "@/app/pages/integration-connection-state";
import { FormError } from "@/components/design-system/FormFields";
import { PageHeader } from "@/components/design-system/PageHeader";
import { EmptyState, Panel, StatusMark } from "@/components/design-system/Panel";

interface Connection extends Record<string, unknown> {
  id: string; provider_key: string; display_name: string; status: string;
  last_attempt_at: string | null; last_success_at: string | null; last_error_code: string | null; last_error_message_redacted: string | null;
  token_expires_at: string | null; provider_definition_version: string; next_run_at: string | null; sync_job_status: string | null; sync_attempt: number | null;
  latest_sync_status: string | null; latest_sync_error_code: string | null; latest_sync_error_message_redacted: string | null;
}

interface CostResourceStatus {
  resourceKey: string;
  unit: string;
  owner: string;
  admissionMode: "GATE" | "OBSERVE_ONLY" | "ACCOUNT_CONTROL";
  quality: string;
  decision: "READY" | "ESTIMATED" | "DEGRADED" | "HARD_STOP" | "UNKNOWN" | "ACCOUNT_CONTROL_REQUIRED";
  window: { localConsumedAmount: number; localReservedAmount: number; internalLimit: number } | null;
}

export function IntegrationsPage() {
  const queryClient = useQueryClient(); const [actionError, setActionError] = useState<unknown>(null);
  const connections = useQuery({ queryKey: ["integrations"], queryFn: () => apiGet<{ data: Connection[] }>("/api/v1/integrations").then((response) => response.data) });
  const costGuardrail = useQuery({ queryKey: ["cost-guardrail-status"], queryFn: () => apiGet<{ data: { providerInvoiceTruth: boolean; resources: CostResourceStatus[] } }>("/api/v1/cost-guardrail/status").then((response) => response.data) });
  const byProvider = useMemo(() => new Map(connections.data?.map((item) => [item.provider_key, item]) ?? []), [connections.data]);
  const authorize = useMutation({ mutationFn: (provider: string) => apiPost<{ data: { authorizeUrl: string } }>(`/api/v1/integrations/${provider}/authorize`, { operationId: uuidv7() }).then((response) => response.data), onSuccess: (data) => { window.location.assign(data.authorizeUrl); }, onError: setActionError });
  const sync = useMutation({ mutationFn: (connection: Connection) => apiPostLongRunning(`/api/v1/integrations/${connection.id}/sync`, { operationId: uuidv7(), from: `${new Date().getUTCFullYear()}-01-01`, to: new Date().toISOString().slice(0, 10) }), onMutate: () => setActionError(null), onSettled: () => queryClient.invalidateQueries({ queryKey: ["integrations"] }), onError: setActionError });
  const disconnect = useMutation({ mutationFn: (connection: Connection) => apiPost(`/api/v1/integrations/${connection.id}/disconnect`, { operationId: uuidv7() }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["integrations"] }), onError: setActionError });
  const oauthError = new URLSearchParams(window.location.search).get("error");
  return <div className="page"><PageHeader eyebrow="ADAPTER / AUTHORIZATION" title="外部連線與同步證據" description="OAuth token 只存伺服器密文。未授權時不會用假資料冒充同步成功。" />
    <FormError error={actionError || (oauthError ? new Error(`授權未完成：${oauthError}`) : null)} />
    <div className="split-layout">{(["youtube", "instagram"] as const).map((provider, index) => { const connection = byProvider.get(provider); const action = integrationConnectionAction(connection?.status); const syncing = sync.isPending && sync.variables?.id === connection?.id; return <Panel key={provider} title={provider === "youtube" ? "YouTube" : "Instagram"} index={`0${index + 1}`} tone={connection?.status === "CONNECTED" ? "accent" : "default"}><div className="integration-card"><div><StatusMark tone={connection?.status === "CONNECTED" ? "good" : connection ? "danger" : "pending"}>{connection?.status ?? "等待設定"}</StatusMark><h3>{connection?.display_name ?? (provider === "youtube" ? "尚未授權頻道" : "尚未授權專業帳號")}</h3><p>{provider === "youtube" ? "唯讀 YouTube Data API 與 Analytics；不要求金額權限。" : "Instagram Login 專業帳號基本資料與 insights 唯讀同步。"}</p>{connection ? <dl className="definition-grid"><div><dt>最近嘗試</dt><dd>{connection.last_attempt_at ? new Date(connection.last_attempt_at).toLocaleString("zh-TW") : "尚無"}</dd></div><div><dt>最近成功</dt><dd>{connection.last_success_at ? new Date(connection.last_success_at).toLocaleString("zh-TW") : "尚無"}</dd></div><div><dt>下次排程</dt><dd>{connection.next_run_at ? `${new Date(connection.next_run_at).toLocaleString("zh-TW")} · ${connection.sync_job_status} · 第 ${connection.sync_attempt ?? 0} 次` : "尚未建立"}</dd></div><div><dt>最近同步狀態</dt><dd>{connection.latest_sync_status ?? "尚無"}{connection.latest_sync_error_code ? ` · ${connection.latest_sync_error_code}` : ""}{connection.latest_sync_error_message_redacted ? ` · ${connection.latest_sync_error_message_redacted}` : ""}</dd></div><div><dt>Token 到期</dt><dd>{connection.token_expires_at ? new Date(connection.token_expires_at).toLocaleString("zh-TW") : "來源未回報"}</dd></div><div><dt>來源定義版本</dt><dd>{connection.provider_definition_version}</dd></div><div><dt>最近錯誤</dt><dd>{connection.last_error_code ? `${connection.last_error_code} · ${connection.last_error_message_redacted ?? "無去敏訊息"}` : "無"}</dd></div></dl> : null}</div><div className="row-actions">{action === "AUTHORIZE" ? <button className="button" type="button" onClick={() => authorize.mutate(provider)}>開始正式授權</button> : <><button className="button" type="button" disabled={syncing} onClick={() => sync.mutate(connection!)}>{syncing ? "同步中" : "立即同步"}</button><button className="button button--quiet" type="button" disabled={syncing} onClick={() => disconnect.mutate(connection!)}>撤銷連線</button></>}</div></div></Panel>; })}</div>
    <Panel title="授權與資料邊界" index="03"><dl className="definition-grid"><div><dt>秘密保存</dt><dd>AES-GCM-256；金鑰只放 Cloudflare Worker secret。</dd></div><div><dt>原始證據</dt><dd>每次同步保存 provider 原始 JSON 雜湊、API 版本與觀測時間。</dd></div><div><dt>同步失敗</dt><dd>指數退避、最多五次，之後進入 dead letter；錯誤訊息去敏。</dd></div><div><dt>現況</dt><dd>{connections.data?.length ? `${connections.data.length} 個連線紀錄` : <EmptyState title="尚無外部連線" detail="本機 adapter 可測；真實驗收等待你完成各平台設定。" />}</dd></div></dl></Panel>
    <Panel title="成本防線狀態" index="04"><p>這是本機保守 ledger 與 contract evidence；不是 provider invoice truth。ESTIMATED 只代表官方 included baseline 的保守本地帳，不代表 provider invoice truth；UNKNOWN／帳戶控制項目不會被假設安全。</p>{costGuardrail.isPending ? <p>讀取成本狀態中…</p> : costGuardrail.isError ? <FormError error={costGuardrail.error} /> : <div className="definition-grid">{(costGuardrail.data?.resources ?? []).map((resource) => <div key={resource.resourceKey}><dt>{resource.resourceKey}</dt><dd><StatusMark tone={resource.decision === "READY" ? "good" : resource.decision === "ESTIMATED" || resource.decision === "UNKNOWN" ? "pending" : "danger"}>{resource.decision}</StatusMark> · {resource.quality} · {resource.admissionMode === "GATE" && resource.window ? `${resource.window.localConsumedAmount + resource.window.localReservedAmount}/${resource.window.internalLimit} ${resource.unit}` : resource.admissionMode === "ACCOUNT_CONTROL" ? "ACCOUNT_CONTROL_REQUIRED" : "OBSERVE_ONLY"}</dd></div>)}</div>}</Panel>
  </div>;
}
