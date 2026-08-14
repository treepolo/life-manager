import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";

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

const mobilePrimaryNavigation = [
  ["/", "今日", "01"],
  ["/areas", "總覽", "02"],
  ["/tasks", "任務", "03"],
  ["/finance", "財務", "04"],
] as const;

const mobileSecondaryNavigation = [
  ["/social", "社群", "05"],
  ["/deadlines", "重要期限", "06"],
  ["/metrics", "指標／事件", "07"],
  ["/integrations", "外部連線", "08"],
  ["/data", "資料管理", "09"],
] as const;

function isRouteActive(pathname: string, to: string) {
  return to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(`${to}/`);
}

export function AppShell() {
  const sync = useSyncState();
  const location = useLocation();
  const [moreOpenPath, setMoreOpenPath] = useState<string | null>(null);
  const [pwaUpdateStatus, setPwaUpdateStatus] = useState<"checking" | "visible" | "not-visible">("checking");
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const moreMenuRef = useRef<HTMLElement>(null);
  const moreOpen = moreOpenPath === location.pathname;
  const secondaryRouteActive = mobileSecondaryNavigation.some(([to]) => isRouteActive(location.pathname, to));

  useEffect(() => {
    if (!moreOpen) return;

    const firstItem = moreMenuRef.current?.querySelector<HTMLElement>("[data-mobile-more-item]");
    firstItem?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setMoreOpenPath(null);
      moreButtonRef.current?.focus();
    };

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (moreButtonRef.current?.contains(target) || moreMenuRef.current?.contains(target)) return;
      setMoreOpenPath(null);
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [moreOpen]);

  useEffect(() => {
    const readUpdateStatus = () => {
      setPwaUpdateStatus(document.querySelector(".update-banner") ? "visible" : "not-visible");
    };

    readUpdateStatus();
    if (typeof MutationObserver === "undefined") return;

    const observer = new MutationObserver(readUpdateStatus);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  const pwaUpdateStatusText =
    pwaUpdateStatus === "visible"
      ? "有新版可用，請使用畫面固定提示。"
      : pwaUpdateStatus === "checking"
        ? "檢查既有更新提示中…"
        : "目前未顯示更新提示。";

  const syncTone = sync.lastError ? "danger" : sync.pendingCount ? "pending" : "good";
  const syncLabel = sync.lastError ? "同步錯誤" : sync.syncing ? "同步中" : `${sync.pendingCount} 待同步`;

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
        <StatusMark tone={syncTone}>{syncLabel}</StatusMark>
        {sync.lastError ? <small role="alert">{sync.lastError}</small> : null}
        <button className="button button--quiet" type="button" onClick={() => void sync.sync()} disabled={sync.syncing}>立即同步</button>
      </aside>

      {moreOpen ? (
        <aside ref={moreMenuRef} className="mobile-more-menu" id="mobile-secondary-nav" aria-label="更多導覽">
          <div className="mobile-more-menu__header">
            <h2>更多</h2>
            <button className="button button--quiet mobile-more-menu__close" type="button" onClick={() => {
              setMoreOpenPath(null);
              moreButtonRef.current?.focus();
            }}>
              關閉
            </button>
          </div>
          <nav aria-label="次要導覽">
            {mobileSecondaryNavigation.map(([to, label, number]) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                data-mobile-more-item
                className={({ isActive }) => isActive ? "mobile-more-menu__link is-active" : "mobile-more-menu__link"}
                onClick={() => setMoreOpenPath(null)}
              >
                <span aria-hidden="true">{number}</span>
                <strong>{label}</strong>
              </NavLink>
            ))}
          </nav>
          <section className="mobile-more-menu__system" aria-labelledby="mobile-system-navigation-heading">
            <h2 id="mobile-system-navigation-heading">系統</h2>
            <div className="mobile-system-status" role="status" aria-label="同步狀態">
              <div>
                <StatusMark tone={syncTone}>{syncLabel}</StatusMark>
                {sync.lastError ? <small role="alert">{sync.lastError}</small> : null}
              </div>
              <button className="button button--quiet" type="button" onClick={() => void sync.sync()} disabled={sync.syncing}>
                {sync.syncing ? "同步中" : "立即同步"}
              </button>
            </div>
            <div className="mobile-system-status" role="status" aria-label="PWA 更新提示狀態" data-pwa-update-status>
              <div>
                <strong>PWA 更新提示</strong>
                <span>{pwaUpdateStatusText}</span>
              </div>
            </div>
          </section>
        </aside>
      ) : null}

      <nav className="mobile-nav" aria-label="手機主要導覽">
        {mobilePrimaryNavigation.map(([to, label, number]) => (
          <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => isActive ? "is-active" : ""}>
            <span aria-hidden="true">{number}</span>{label}
          </NavLink>
        ))}
        <button
          ref={moreButtonRef}
          className={`mobile-nav__more${secondaryRouteActive ? " is-active" : ""}${moreOpen ? " is-open" : ""}`}
          type="button"
          aria-haspopup="true"
          aria-expanded={moreOpen}
          aria-controls="mobile-secondary-nav"
          onClick={() => setMoreOpenPath((openPath) => openPath === location.pathname ? null : location.pathname)}
        >
          <span aria-hidden="true">＋</span>更多
        </button>
      </nav>
    </div>
  );
}
