import type { ReactNode } from "react";

export function Panel({ title, index, tone = "default", children, actions, id }: {
  title: string;
  index?: string;
  tone?: "default" | "critical" | "accent";
  children: ReactNode;
  actions?: ReactNode;
  id?: string;
}) {
  return (
    <section className={`panel panel--${tone}`} id={id}>
      <header className="panel__header">
        <h2>{index ? <span className="panel__index">{index}</span> : null}{title}</h2>
        {actions ? <div>{actions}</div> : null}
      </header>
      <div className="panel__body">{children}</div>
    </section>
  );
}

export function EmptyState({ title, detail, action }: { title: string; detail: string; action?: ReactNode }) {
  return (
    <div className="empty-state" role="status">
      <span aria-hidden="true">—</span>
      <div><strong>{title}</strong><p>{detail}</p></div>
      {action}
    </div>
  );
}

export function StatusMark({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "good" | "warn" | "danger" | "pending" }) {
  return <span className={`status-mark status-mark--${tone}`}>{children}</span>;
}
