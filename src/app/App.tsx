import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, RouterProvider } from "react-router-dom";

import { AppShell } from "@/app/layouts/AppShell";
import { HomePage } from "@/app/pages/HomePage";
import { SettingsPage } from "@/app/pages/SettingsPage";
import { TasksPage } from "@/app/pages/TasksPage";
import { PwaUpdate } from "@/app/providers/PwaUpdate";
import { SyncProvider } from "@/app/providers/SyncProvider";

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
        <RouterProvider router={router} />
        <PwaUpdate />
      </SyncProvider>
    </QueryClientProvider>
  );
}
