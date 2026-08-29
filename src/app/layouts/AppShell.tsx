import { NavLink, Outlet } from "react-router-dom";

import { useSyncState } from "@/app/providers/SyncProvider";

const navigation = [
  ["/", "首頁", "⌂"],
  ["/tasks", "每日任務", "✓"],
  ["/settings", "設定", "✎"],
] as const;

export function AppShell() {
  const sync = useSyncState();
  const syncLabel = sync.lastError ? "同步錯誤" : sync.syncing ? "同步中" : `${sync.pendingCount} 待同步`;
  return (
    <div className="app-shell">
      <aside className="side-rail">
        <div className="brand">
          <span className="brand-mark">LM</span>
          <div><strong>人生管理器</strong><small>每天畫一點進度</small></div>
        </div>
        <nav aria-label="主要導覽" className="main-nav">
          {navigation.map(([to, label, symbol]) => (
            <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => isActive ? "nav-item is-active" : "nav-item"}>
              <span aria-hidden="true">{symbol}</span>{label}
            </NavLink>
          ))}
        </nav>
        <div className={sync.lastError ? "sync-card has-error" : "sync-card"}>
          <span className="sync-dot" aria-hidden="true" />
          <div><strong>{syncLabel}</strong>{sync.lastError ? <small role="alert">{sync.lastError}</small> : <small>資料會在裝置間同步</small>}</div>
          <button type="button" className="sync-button" onClick={() => void sync.sync()} disabled={sync.syncing}>同步</button>
        </div>
      </aside>
      <main className="main-stage"><Outlet /></main>
      <nav className="mobile-nav" aria-label="手機主要導覽">
        {navigation.map(([to, label, symbol]) => (
          <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => isActive ? "is-active" : ""}>
            <span aria-hidden="true">{symbol}</span><small>{label}</small>
          </NavLink>
        ))}
      </nav>
      <div className={sync.lastError ? "mobile-sync has-error" : "mobile-sync"}>
        <span>{syncLabel}</span>
        <button type="button" onClick={() => void sync.sync()} disabled={sync.syncing}>同步</button>
      </div>
    </div>
  );
}
