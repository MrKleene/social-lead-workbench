import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "@/features/auth/use-auth";
import { LoginPage } from "@/features/auth/login-page";
import { LeadsPage } from "@/features/leads/leads-page";
import { TasksPage } from "@/features/tasks/tasks-page";
import { PlatformsPage } from "@/features/platforms/platforms-page";
import { CollectionPage } from "@/features/collection/collection-page";
import { WorkPage } from "@/features/work/work-page";
import { AppShell } from "@/components/app-shell";
import { Loading } from "@/components/feedback";
import "./styles.css";
const client = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: 10000 } },
});
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
        <Route path="/collection/:configId?" element={<CollectionPage />} />
        <Route path="/leads/:id?" element={<LeadsPage />} />
        <Route path="/tasks" element={<TasksPage />} />
        <Route path="/platforms" element={<PlatformsPage />} />
        <Route path="*" element={<Navigate to="/work" replace />} />
      </Route>
    </Routes>
  );
}
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={client}>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
