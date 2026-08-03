import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, RouterProvider } from "react-router-dom";

import { AppShell } from "@/app/layouts/AppShell";
import { AreasPage } from "@/app/pages/AreasPage";
import { DataPage } from "@/app/pages/DataPage";
import { DeadlinesPage } from "@/app/pages/DeadlinesPage";
import { FinancePage } from "@/app/pages/FinancePage";
import { HomePage } from "@/app/pages/HomePage";
import { IntegrationsPage } from "@/app/pages/IntegrationsPage";
import { MetricsPage } from "@/app/pages/MetricsPage";
import { SocialPage } from "@/app/pages/SocialPage";
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
      { path: "areas", element: <AreasPage /> },
      { path: "tasks", element: <TasksPage /> },
      { path: "finance", element: <FinancePage /> },
      { path: "social", element: <SocialPage /> },
      { path: "deadlines", element: <DeadlinesPage /> },
      { path: "metrics", element: <MetricsPage /> },
      { path: "integrations", element: <IntegrationsPage /> },
      { path: "data", element: <DataPage /> },
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
