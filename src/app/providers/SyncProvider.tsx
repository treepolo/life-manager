import { useQuery, useQueryClient } from "@tanstack/react-query";
/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { v7 as uuidv7 } from "uuid";

import { apiPost } from "@/app/api/client";
import { getOrCreateSyncMeta, outboxCount } from "@/core/sync/client-db";
import { installSyncTriggers, syncNow } from "@/core/sync/sync-manager";

interface SyncContextValue {
  pendingCount: number;
  syncing: boolean;
  lastError: string | null;
  sync: () => Promise<void>;
}

const SyncContext = createContext<SyncContextValue | null>(null);

export function SyncProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const pending = useQuery({ queryKey: ["outbox-count"], queryFn: outboxCount, refetchInterval: 5000 });
  const [syncing, setSyncing] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const sync = useCallback(async () => {
    setSyncing(true);
    setLastError(null);
    try {
      await syncNow();
      // The sync indicator represents the durable outbox transfer, not every
      // active screen query that is refreshed afterwards. Heavy analyses can
      // legitimately take longer, but must not leave a completed upload shown
      // as "syncing" or keep the manual retry control disabled.
      await queryClient.invalidateQueries({ queryKey: ["outbox-count"] });
      setSyncing(false);
      void queryClient.invalidateQueries({
        predicate: (query) => query.queryKey[0] !== "outbox-count",
      });
    } catch (error) {
      setLastError(error instanceof Error ? error.message : "同步失敗");
    } finally {
      setSyncing(false);
    }
  }, [queryClient]);

  useEffect(() => {
    let disposed = false;
    void (async () => {
      const meta = await getOrCreateSyncMeta();
      if (disposed || !navigator.onLine) return;
      try {
        await apiPost("/api/v1/sync/devices", {
          operationId: uuidv7(),
          data: { id: meta.deviceId, displayName: "此裝置", userAgentSummary: navigator.userAgent.slice(0, 240) },
        });
        await syncNow();
        await queryClient.invalidateQueries();
      } catch (error) {
        if (!disposed && navigator.onLine && !(error instanceof TypeError)) setLastError(error instanceof Error ? error.message : "裝置註冊失敗");
      }
    })();
    const remove = installSyncTriggers(
      (error) => {
        if (!navigator.onLine) return;
        setLastError(error instanceof Error ? error.message : "同步失敗");
      },
      async () => {
        setLastError(null);
        await queryClient.invalidateQueries();
      },
    );
    const onWorkerMessage = (event: MessageEvent<{ type?: string }>) => { if (event.data?.type === "SYNC_OUTBOX") void sync(); };
    const onOutboxChanged = () => { void queryClient.invalidateQueries({ queryKey: ["outbox-count"] }); };
    navigator.serviceWorker?.addEventListener("message", onWorkerMessage);
    window.addEventListener("life-manager:outbox-changed", onOutboxChanged);
    return () => {
      disposed = true;
      remove();
      navigator.serviceWorker?.removeEventListener("message", onWorkerMessage);
      window.removeEventListener("life-manager:outbox-changed", onOutboxChanged);
    };
  }, [queryClient, sync]);

  const value = useMemo(() => ({ pendingCount: pending.data ?? 0, syncing, lastError, sync }), [pending.data, syncing, lastError, sync]);
  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSyncState(): SyncContextValue {
  const value = useContext(SyncContext);
  if (!value) throw new Error("SyncProvider missing");
  return value;
}
