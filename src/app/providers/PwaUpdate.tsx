import { useEffect, useState } from "react";

import { outboxCount } from "@/core/sync/client-db";

export function PwaUpdate() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let active = true;
    const hadController = Boolean(navigator.serviceWorker.controller);
    const onControllerChange = () => { if (hadController) window.location.reload(); };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    void navigator.serviceWorker.register("/sw.js").then((registration) => {
      if (!active) return;
      if (registration.waiting) setWaiting(registration.waiting);
      registration.addEventListener("updatefound", () => {
        const installing = registration.installing;
        installing?.addEventListener("statechange", () => {
          if (installing.state === "installed" && navigator.serviceWorker.controller) setWaiting(installing);
        });
      });
    });
    return () => { active = false; navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange); };
  }, []);
  if (!waiting) return null;
  const update = async () => {
    const pending = await outboxCount();
    if (pending > 0) { setBlocked(true); return; }
    waiting.postMessage({ type: "SKIP_WAITING_AFTER_OUTBOX_SAVED" });
  };
  return (
    <aside className="update-banner" role="status">
      <strong>有新版可用</strong>
      <span>{blocked ? "仍有待同步資料，請先同步後再更新。" : "若有待同步資料，系統會先保留，不會強制重載。"}</span>
      <button className="button" type="button" onClick={() => void update()}>安全更新</button>
      <button className="button button--quiet" type="button" onClick={() => setWaiting(null)}>稍後</button>
    </aside>
  );
}
