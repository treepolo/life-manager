import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense } from "react";
import { createBrowserRouter, RouterProvider } from "react-router-dom";

import { AppShell } from "@/app/layouts/AppShell";
import "@/app/pages/FeatureEnhancements.css";
import { PwaUpdate } from "@/app/providers/PwaUpdate";
import { SyncProvider } from "@/app/providers/SyncProvider";

const HomePage = lazy(() => import("@/app/pages/HomePage").then((module) => ({ default: module.HomePage })));
const TasksPage = lazy(() => import("@/app/pages/TasksPage").then((module) => ({ default: module.TasksPage })));
const SettingsPage = lazy(() => import("@/app/pages/SettingsPage").then((module) => ({ default: module.SettingsPage })));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, networkMode: "always" },
    mutations: { retry: 0, networkMode: "always" },
  },
});

const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "tasks", element: <TasksPage /> },
      { path: "settings", element: <SettingsPage /> },
    ],
  },
]);

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SyncProvider>
        <Suspense fallback={<div className="page crayon-page"><p className="notice-strip">正在載入頁面…</p></div>}>
          <RouterProvider router={router} />
        </Suspense>
        <PwaUpdate />
      </SyncProvider>
    </QueryClientProvider>
  );
}
