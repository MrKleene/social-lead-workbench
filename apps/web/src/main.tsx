import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider, Routes, Route, Navigate, useParams } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "@/features/auth/use-auth";
import { LoginPage } from "@/features/auth/login-page";
import { LeadsPage } from "@/features/leads/leads-page";
import { TasksPage } from "@/features/tasks/tasks-page";
import { PlatformsPage } from "@/features/platforms/platforms-page";
import { legacyWorkspacePath } from "@/features/work/navigation-policy";
import { WorkPage } from "@/features/work/work-page";
import { AppShell } from "@/components/app-shell";
import { Loading } from "@/components/feedback";
import "./styles.css";
import "./features/work/mist.css";
import "./features/auth/login.css";

const client = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: 10000 } },
});
function LegacySettings() { const {configId}=useParams();return <Navigate to={legacyWorkspacePath("settings",configId)} replace/>; }
function App() {
  const { user, loading } = useAuth();
  if (loading)
    return (
      <main className="boot-screen">
        <Loading />
      </main>
    );
  if (!user) return <LoginPage />;
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/work/:id?" element={<WorkPage />} />
        <Route path="/templates" element={<Navigate to={legacyWorkspacePath("templates")} replace/>} />
        <Route path="/collection/:configId?" element={<LegacySettings />} />
        <Route path="/leads/:id?" element={<LeadsPage />} />
        <Route path="/tasks" element={<TasksPage />} />
        <Route path="/platforms" element={<PlatformsPage />} />
        <Route path="*" element={<Navigate to="/work" replace />} />
      </Route>
    </Routes>
  );
}
const router=createBrowserRouter([{path:"*",element:<AuthProvider><App/></AuthProvider>}]);
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={client}>
      <RouterProvider router={router}/>
    </QueryClientProvider>
  </React.StrictMode>,
);
