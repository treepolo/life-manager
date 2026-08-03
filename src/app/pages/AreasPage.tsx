import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { apiGet } from "@/app/api/client";
import { useResource } from "@/app/hooks/use-resource";
import { Field, FormError, Select, TextArea, TextInput } from "@/components/design-system/FormFields";
import { PageHeader } from "@/components/design-system/PageHeader";
import { EmptyState, Panel, StatusMark } from "@/components/design-system/Panel";

interface Area extends Record<string, unknown> { id: string; name: string; version: number; archivedAt?: string | null }
interface Business extends Record<string, unknown> { id: string; areaId: string; name: string; status: string; version: number }
interface LinkTarget extends Record<string, unknown> { id: string; name?: string; title?: string }
interface EntityLink extends Record<string, unknown> { id: string; fromId: string; toType: string; toId: string; version: number }

const linkTypeLabels: Record<string, string> = {
  INCOME_SOURCE: "收入來源", EXPENSE_CATEGORY: "支出分類", TASK: "任務", EVENT: "事件",
  METRIC: "指標", CONTENT: "社群內容", SAVED_VIEW: "保存圖表檢視",
};

export function AreasPage() {
  const areas = useResource<Area>("areas", "?includeArchived=true");
  const businesses = useResource<Business>("businesses", "?includeArchived=true");
  const entityLinks = useResource<EntityLink>("entity-links", "?fromType=BUSINESS");
  const linkTargets = useQuery({
    queryKey: ["entity-link-targets"],
    queryFn: () => apiGet<{ data: Record<string, LinkTarget[]> }>("/api/v1/entity-link-targets").then((response) => response.data),
  });
  const [selectedArea, setSelectedArea] = useState("");
  const [linkType, setLinkType] = useState("INCOME_SOURCE");

  const createArea = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    areas.create.mutate({
      name: form.get("name"), description: form.get("description"), whyText: form.get("whyText"),
      principlesText: form.get("principlesText"), strategyText: form.get("strategyText"),
      nextActionText: form.get("nextActionText"), lowClarityGuide: form.get("lowClarityGuide"),
      sortOrder: Number(form.get("sortOrder") ?? 0), sourceType: "MANUAL",
    }, { onSuccess: () => formElement.reset() });
  };

  const createBusiness = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    businesses.create.mutate({
      areaId: form.get("areaId"), name: form.get("name"), description: form.get("description"), status: "ACTIVE",
      whyText: form.get("whyText"), principlesText: form.get("principlesText"), strategyText: form.get("strategyText"),
      nextActionText: form.get("nextActionText"), lowClarityGuide: form.get("lowClarityGuide"), sortOrder: 0, sourceType: "MANUAL",
    }, { onSuccess: () => formElement.reset() });
  };

  const editArea = (event: FormEvent<HTMLFormElement>, area: Area) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    areas.update.mutate({ id: area.id, version: area.version, patch: {
      name: form.get("name"), description: form.get("description"), whyText: form.get("whyText"),
      principlesText: form.get("principlesText"), strategyText: form.get("strategyText"), nextActionText: form.get("nextActionText"),
      lowClarityGuide: form.get("lowClarityGuide"), sortOrder: Number(form.get("sortOrder") ?? 0),
    } });
  };

  const editBusiness = (event: FormEvent<HTMLFormElement>, business: Business) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    businesses.update.mutate({ id: business.id, version: business.version, patch: {
      areaId: form.get("areaId"), name: form.get("name"), description: form.get("description"), status: form.get("status"),
      whyText: form.get("whyText"), principlesText: form.get("principlesText"), strategyText: form.get("strategyText"),
      nextActionText: form.get("nextActionText"), lowClarityGuide: form.get("lowClarityGuide"),
      sortOrder: Number(form.get("sortOrder") ?? 0),
    } });
  };

  const linkTargetsByType: Record<string, LinkTarget[]> = {
    INCOME_SOURCE: linkTargets.data?.INCOME_SOURCE ?? [], EXPENSE_CATEGORY: linkTargets.data?.EXPENSE_CATEGORY ?? [],
    TASK: linkTargets.data?.TASK ?? [], EVENT: linkTargets.data?.EVENT ?? [], METRIC: linkTargets.data?.METRIC ?? [],
    CONTENT: linkTargets.data?.CONTENT ?? [], SAVED_VIEW: linkTargets.data?.SAVED_VIEW ?? [],
  };
  const allTargets = Object.entries(linkTargetsByType).flatMap(([type, targets]) => targets.map((target) => ({ ...target, type })));
  const createLink = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    entityLinks.create.mutate({
      fromType: "BUSINESS", fromId: form.get("businessId"), toType: form.get("toType"), toId: form.get("toId"),
      relationType: "RELATED", sourceType: "MANUAL",
    }, { onSuccess: () => formElement.reset() });
  };

  const activeAreas = areas.list.data?.filter((area) => !area.archivedAt) ?? [];
  return (
    <div className="page">
      <PageHeader eyebrow="WORLD / STRUCTURE" title="領域與事業" description="保存方向、原則、策略與下一個行動。領域名稱與數量由你決定，不綁死人生分類。" />
      <div className="split-layout">
        <Panel title="新增人生領域" index="01" tone="accent">
          <form className="form-grid" onSubmit={createArea}>
            <Field label="名稱"><TextInput name="name" required maxLength={120} /></Field>
            <Field label="排序"><TextInput name="sortOrder" type="number" defaultValue="0" /></Field>
            <Field label="說明"><TextArea name="description" rows={2} /></Field>
            <Field label="為什麼"><TextArea name="whyText" rows={3} /></Field>
            <Field label="不可違反的原則"><TextArea name="principlesText" rows={3} /></Field>
            <Field label="當前策略"><TextArea name="strategyText" rows={3} /></Field>
            <Field label="下一個具體行動"><TextArea name="nextActionText" rows={2} /></Field>
            <Field label="不知道做什麼時的指引"><TextArea name="lowClarityGuide" rows={3} /></Field>
            <FormError error={areas.create.error} />
            <button className="button" disabled={areas.create.isPending}>建立領域</button>
          </form>
        </Panel>
        <Panel title="新增事業" index="02">
          {activeAreas.length ? (
            <form className="form-grid" onSubmit={createBusiness}>
              <Field label="所屬領域"><Select name="areaId" required value={selectedArea} onChange={(event) => setSelectedArea(event.target.value)}><option value="">請選擇</option>{activeAreas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</Select></Field>
              <Field label="名稱"><TextInput name="name" required maxLength={160} /></Field>
              <Field label="說明"><TextArea name="description" rows={2} /></Field>
              <Field label="為什麼"><TextArea name="whyText" rows={3} /></Field>
              <Field label="不可違反的原則"><TextArea name="principlesText" rows={3} /></Field>
              <Field label="當前策略"><TextArea name="strategyText" rows={3} /></Field>
              <Field label="下一個具體行動"><TextArea name="nextActionText" rows={2} /></Field>
              <Field label="狀態差時的指引"><TextArea name="lowClarityGuide" rows={3} /></Field>
              <FormError error={businesses.create.error} />
              <button className="button" disabled={businesses.create.isPending}>建立事業</button>
            </form>
          ) : <EmptyState title="先建立一個領域" detail="事業必須位於正式領域之下。" />}
        </Panel>
      </div>
      <Panel title="領域配置" index="03">
        {areas.list.isLoading ? <p>載入領域…</p> : null}
        {!areas.list.isLoading && !areas.list.data?.length ? <EmptyState title="尚無人生領域" detail="建立後可排序、編輯、封存與恢復。正式環境不會自動加入示範領域。" /> : null}
        <div className="area-stack">
          {areas.list.data?.map((area) => (
            <article className={area.archivedAt ? "area-sheet is-archived" : "area-sheet"} key={area.id}>
              <header><div><span>AREA</span><h3>{area.name}</h3></div><StatusMark tone={area.archivedAt ? "neutral" : "good"}>{area.archivedAt ? "已封存" : "進行中"}</StatusMark></header>
              <div className="area-sheet__guides">
                <div><small>WHY</small><p>{String(area.whyText || "尚未填寫")}</p></div>
                <div><small>PRINCIPLES</small><p>{String(area.principlesText || "尚未填寫")}</p></div>
                <div><small>NEXT ACTION</small><p>{String(area.nextActionText || "尚未填寫")}</p></div>
                <div><small>LOW CLARITY GUIDE</small><p>{String(area.lowClarityGuide || "尚未填寫")}</p></div>
              </div>
              <ul className="business-lines">
                {businesses.list.data?.filter((business) => business.areaId === area.id).map((business) => (
                  <li key={business.id}><strong>{business.name}</strong><span>{String(business.nextActionText || "尚未填下一步")}</span><StatusMark tone={business.archivedAt ? "neutral" : "good"}>{business.archivedAt ? "已封存" : business.status}</StatusMark><details className="inline-editor"><summary>編輯事業</summary><form className="form-grid" onSubmit={(event) => editBusiness(event, business)}><Field label="所屬領域"><Select name="areaId" defaultValue={business.areaId} required>{activeAreas.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field><Field label="名稱"><TextInput name="name" defaultValue={business.name} required /></Field><Field label="狀態"><Select name="status" defaultValue={business.status}><option value="ACTIVE">進行中</option><option value="PAUSED">暫停</option><option value="COMPLETED">已完成</option></Select></Field><Field label="排序"><TextInput name="sortOrder" type="number" defaultValue={String(business.sortOrder ?? 0)} /></Field><Field label="說明"><TextArea name="description" defaultValue={String(business.description ?? "")} /></Field><Field label="為什麼"><TextArea name="whyText" defaultValue={String(business.whyText ?? "")} /></Field><Field label="不可違反的原則"><TextArea name="principlesText" defaultValue={String(business.principlesText ?? "")} /></Field><Field label="策略"><TextArea name="strategyText" defaultValue={String(business.strategyText ?? "")} /></Field><Field label="下一步"><TextArea name="nextActionText" defaultValue={String(business.nextActionText ?? "")} /></Field><Field label="狀態差時指引"><TextArea name="lowClarityGuide" defaultValue={String(business.lowClarityGuide ?? "")} /></Field><button className="button" disabled={businesses.update.isPending}>保存事業</button><button className="button button--quiet" type="button" onClick={() => businesses.archive.mutate({ id: business.id, version: business.version, restore: Boolean(business.archivedAt) })}>{business.archivedAt ? "恢復事業" : "封存事業"}</button></form></details></li>
                ))}
              </ul>
              <div className="row-actions">
                <details className="inline-editor"><summary>編輯、排序領域</summary><form className="form-grid" onSubmit={(event) => editArea(event, area)}><Field label="名稱"><TextInput name="name" defaultValue={area.name} required /></Field><Field label="排序"><TextInput name="sortOrder" type="number" defaultValue={String(area.sortOrder ?? 0)} /></Field><Field label="說明"><TextArea name="description" defaultValue={String(area.description ?? "")} /></Field><Field label="為什麼"><TextArea name="whyText" defaultValue={String(area.whyText ?? "")} /></Field><Field label="不可違反的原則"><TextArea name="principlesText" defaultValue={String(area.principlesText ?? "")} /></Field><Field label="策略"><TextArea name="strategyText" defaultValue={String(area.strategyText ?? "")} /></Field><Field label="下一步"><TextArea name="nextActionText" defaultValue={String(area.nextActionText ?? "")} /></Field><Field label="不知道做什麼時指引"><TextArea name="lowClarityGuide" defaultValue={String(area.lowClarityGuide ?? "")} /></Field><button className="button" disabled={areas.update.isPending}>保存領域</button></form></details>
                <button className="button button--quiet" type="button" onClick={() => areas.archive.mutate({ id: area.id, version: area.version, restore: Boolean(area.archivedAt) })}>{area.archivedAt ? "恢復" : "封存"}</button>
              </div>
            </article>
          ))}
        </div>
      </Panel>
      <Panel title="事業跨模組關聯" index="04">
        {!businesses.list.data?.filter((business) => !business.archivedAt).length ? <EmptyState title="尚無可關聯事業" detail="建立啟用中的事業後，可連到收入來源、支出分類、任務、事件、指標、社群內容與保存圖表檢視。" /> : (
          <form className="form-grid form-grid--wide" onSubmit={createLink}>
            <Field label="事業"><Select name="businessId" required><option value="">請選擇</option>{businesses.list.data.filter((business) => !business.archivedAt).map((business) => <option key={business.id} value={business.id}>{business.name}</option>)}</Select></Field>
            <Field label="目標類型"><Select name="toType" value={linkType} onChange={(event) => setLinkType(event.target.value)}><option value="INCOME_SOURCE">收入來源</option><option value="EXPENSE_CATEGORY">支出分類</option><option value="TASK">任務</option><option value="EVENT">事件</option><option value="METRIC">指標</option><option value="CONTENT">社群內容</option><option value="SAVED_VIEW">保存圖表檢視</option></Select></Field>
            <Field label="目標資料"><Select name="toId" required><option value="">請選擇</option>{linkTargetsByType[linkType].map((target) => <option key={target.id} value={target.id}>{target.name ?? target.title ?? target.id}</option>)}</Select></Field>
            <FormError error={entityLinks.create.error} />
            <button className="button" disabled={entityLinks.create.isPending || linkTargetsByType[linkType].length === 0}>建立關聯</button>
          </form>
        )}
        {!entityLinks.list.data?.length ? <EmptyState title="尚無跨模組關聯" detail="這裡只顯示你明確建立的正式關聯，不會依名稱猜測。" /> : <div className="data-table-wrap"><table className="data-table"><thead><tr><th>事業</th><th>類型</th><th>關聯目標</th><th>操作</th></tr></thead><tbody>{entityLinks.list.data.map((link) => { const target = allTargets.find((item) => item.type === link.toType && item.id === link.toId); return <tr key={link.id}><td>{businesses.list.data?.find((business) => business.id === link.fromId)?.name ?? link.fromId}</td><td>{linkTypeLabels[link.toType] ?? link.toType}</td><td>{target?.name ?? target?.title ?? link.toId}</td><td><button className="button button--quiet" type="button" onClick={() => entityLinks.archive.mutate({ id: link.id, version: link.version })}>移除關聯</button></td></tr>; })}</tbody></table></div>}
      </Panel>
    </div>
  );
}
