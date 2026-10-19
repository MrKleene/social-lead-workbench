import { createContext, useContext, useEffect, ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, send, setCsrf } from "@/lib/api";
import type { User } from "@/lib/types";
type Session = { user: User; csrfToken: string };
const Context = createContext<ReturnType<typeof useAuthState> | null>(null);
function useAuthState() {
  const client = useQueryClient();
  useEffect(() => {
    const expire = () => {
      setCsrf("");
      client.clear();
      client.setQueryData(["session"], null);
    };
    window.addEventListener("crm-session-expired", expire);
    return () => window.removeEventListener("crm-session-expired", expire);
  }, [client]);
  const query = useQuery({
    queryKey: ["session"],
    queryFn: () => api<Session>("/auth/me"),
    retry: false,
    refetchOnWindowFocus: true,
    staleTime: 60000,
  });
  useEffect(() => {
    setCsrf(query.data?.csrfToken || "");
  }, [query.data]);
  const login = useMutation({
    mutationFn: (body: { email: string; password: string }) =>
      send<Session>("/auth/login", "POST", body),
    onSuccess: (data) => {
      setCsrf(data.csrfToken);
      client.clear();
      client.setQueryData(["session"], data);
    },
  });
  const logout = useMutation({
    mutationFn: () => send("/auth/logout", "POST", {}),
    onSuccess: () => {
      setCsrf("");
      client.clear();
      client.setQueryData(["session"], null);
    },
  });
  return { user: query.isError ? undefined : query.data?.user, loading: query.isPending, login, logout };
}
export function AuthProvider({ children }: { children: ReactNode }) {
  const state = useAuthState();
  return <Context.Provider value={state}>{children}</Context.Provider>;
}
export function useAuth() {
  const value = useContext(Context);
  if (!value) throw new Error("AuthProvider missing");
  return value;
}
