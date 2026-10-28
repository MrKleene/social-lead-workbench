import { createContext, useContext, useEffect, useRef, useCallback, useState, ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, send, setCsrf, ApiError } from "@/lib/api";
import type { User } from "@/lib/types";
type Session = { user: User; csrfToken: string };
const Context = createContext<ReturnType<typeof useAuthState> | null>(null);
function useAuthState() {
  const client = useQueryClient();
  const channel = useRef<BroadcastChannel | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const replaceSession = useCallback(async (session: Session | null) => {
    await client.cancelQueries();
    // Keep the active session QueryObserver attached; clear only business data.
    client.removeQueries({ predicate: query => query.queryKey[0] !== "session" });
    setCsrf(session?.csrfToken || "");
    client.setQueryData(["session"], session);
  }, [client]);
  useEffect(() => {
    const expire = () => { setSessionExpired(true); void replaceSession(null); };
    const recheck = () => void client.invalidateQueries({ queryKey: ["session"] });
    const restore = (event: PageTransitionEvent) => { if (event.persisted) recheck(); };
    const sync = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("crm-auth-state");
    channel.current = sync;
    if (sync) sync.onmessage = async event => {
      if (event.data === "signed-out") { setSessionExpired(false); await replaceSession(null); }
      if (event.data === "signed-in") { setSessionExpired(false); await replaceSession(null); recheck(); }
    };
    window.addEventListener("pageshow", restore);
    window.addEventListener("crm-session-expired", expire);
    return () => {
      window.removeEventListener("pageshow", restore);
      window.removeEventListener("crm-session-expired", expire);
      sync?.close(); channel.current = null;
    };
  }, [client, replaceSession]);
  const query = useQuery({
    queryKey: ["session"],
    queryFn: () => api<Session>("/auth/me"),
    retry: false,
    refetchOnWindowFocus: "always",
    staleTime: 60000,
  });
  useEffect(() => {
    setCsrf(query.data?.csrfToken || "");
    if (query.error instanceof ApiError && query.error.status === 401 && query.data?.user) setSessionExpired(true);
  }, [query.data, query.error]);
  const login = useMutation({
    mutationFn: (body: { email: string; password: string; remember: boolean }) =>
      send<Session>("/auth/login", "POST", body),
    onSuccess: async (data) => {
      setSessionExpired(false);
      await replaceSession(data);
      channel.current?.postMessage("signed-in");
    },
  });
  const logout = useMutation({
    mutationFn: () => send("/auth/logout", "POST", {}),
    onSuccess: async () => {
      setSessionExpired(false);
      await replaceSession(null);
      channel.current?.postMessage("signed-out");
    },
  });
  return { user: query.error instanceof ApiError && query.error.status === 401 ? undefined : query.data?.user, loading: query.isPending, sessionError: sessionExpired ? new Error("登录已过期，请重新登录") : query.error instanceof ApiError && query.error.status === 401 ? null : query.error, login, logout };
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
