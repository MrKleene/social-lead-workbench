import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, send } from "@/lib/api";
import { Lead, User } from "@/lib/types";
export function useLeads() {
  const [search, setSearch] = useState(""),
    [platform, setPlatform] = useState("all"),
    [status, setStatus] = useState("all");
  const query = useQuery({
    queryKey: ["leads"],
    queryFn: () => api<Lead[]>("/leads"),
  });
  const rows = (query.isError ? [] : query.data || []).filter(
    (v) =>
      (platform === "all" || v.identity.platform === platform) &&
      (status === "all" || v.status === status) &&
      `${v.identity.nickname} ${v.summary} ${v.evidence}`.includes(search),
  );
  return {
    query,
    rows,
    search,
    setSearch,
    platform,
    setPlatform,
    status,
    setStatus,
    total: query.data?.length || 0,
    pending: query.data?.filter((v) => !v.reviewedAt).length || 0,
    following: query.data?.filter((v) => v.status === "FOLLOWING").length || 0,
  };
}
export function useLead(id: string, admin: boolean) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["lead", id],
    queryFn: () => api<Lead>(`/leads/${id}`),
  });
  const users = useQuery({
    queryKey: ["users"],
    queryFn: () => api<User[]>("/users"),
    enabled: admin,
  });
  const mutation = useMutation({
    mutationFn: ({
      path,
      method,
      body,
    }: {
      path: string;
      method: string;
      body: unknown;
    }) => send(path, method, body),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["lead", id] }),
        client.invalidateQueries({ queryKey: ["leads"] }),
        client.invalidateQueries({ queryKey: ["tasks"] }),
      ]);
    },
  });
  return {
    query,
    users: users.data?.filter((v) => v.role === "SALES") || [],
    usersError: users.error,
    usersLoading: users.isPending,
    mutation,
  };
}
