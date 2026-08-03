import { NavLink, Outlet } from "react-router-dom";

import { useSyncState } from "@/app/providers/SyncProvider";
import { StatusMark } from "@/components/design-system/Panel";

const navigation = [
  ["/", "今日", "01"],
  ["/areas", "領域／事業", "02"],
  ["/tasks", "任務", "03"],
  ["/finance", "財務", "04"],
  ["/social", "社群", "05"],
  ["/deadlines", "重要期限", "06"],
  ["/metrics", "指標／事件", "07"],
  ["/integrations", "外部連線", "08"],
  ["/data", "資料管理", "09"],
] as const;

export function AppShell() {
  const sync = useSyncState();
  return (
    <div className="app-shell">
      <aside className="side-rail">
        <div className="brand"><span>LM</span><strong>人生管理器</strong><small>FORMAL R1</small></div>
        <nav aria-label="主要導覽">
          {navigation.map(([to, label, number]) => (
            <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => isActive ? "nav-item is-active" : "nav-item"}>
              <span>{number}</span>{label}
            </NavLink>
          ))}
        </nav>
        <div className="rail-status">
          <span>SYNC</span>
          <StatusMark tone={sync.lastError ? "danger" : sync.pendingCount ? "pending" : "good"}>
            {sync.lastError ? "錯誤" : sync.syncing ? "同步中" : `${sync.pendingCount} 待同步`}
          </StatusMark>
          {sync.lastError ? <small className="sync-error" role="alert">{sync.lastError}</small> : null}
          <button className="button button--quiet" type="button" onClick={() => void sync.sync()} disabled={sync.syncing}>立即同步</button>
        </div>
      </aside>
      <main className="main-stage"><Outlet /></main>
      <aside className="mobile-sync-status" aria-label="手機同步狀態">
        <StatusMark tone={sync.lastError ? "danger" : sync.pendingCount ? "pending" : "good"}>
          {sync.lastError ? "同步錯誤" : sync.syncing ? "同步中" : `${sync.pendingCount} 待同步`}
        </StatusMark>
        {sync.lastError ? <small role="alert">{sync.lastError}</small> : null}
        <button className="button button--quiet" type="button" onClick={() => void sync.sync()} disabled={sync.syncing}>立即同步</button>
      </aside>
      <nav className="mobile-nav" aria-label="手機主要導覽">
        {navigation.slice(0, 5).map(([to, label, number]) => (
          <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => isActive ? "is-active" : ""}>
            <span>{number}</span>{label === "領域／事業" ? "總覽" : label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
