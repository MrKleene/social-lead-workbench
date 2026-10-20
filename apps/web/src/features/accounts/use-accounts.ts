import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useWorkspaceMutation } from "@/features/collection/use-collection";
import type { AccountList, ContactState } from "./types";
export function useAccounts(enabled = true) {
  return useQuery({
    queryKey: ["accounts"],
    queryFn: () => api<AccountList>("/accounts"),
    enabled,
    retry: false,
  });
}
export function useAccountCenter() {
  const query = useAccounts(),
    mutation = useWorkspaceMutation(),
    [selected, setSelected] = useState<string | null>(null),
    [creating, setCreating] = useState(false);
  const account =
    query.data?.accounts.find((a) => a.id === selected) ||
    query.data?.accounts[0];
  return {
    query,
    mutation,
    account,
    creating,
    select: (id: string) => {
      setSelected(id);
      setCreating(false);
    },
    create: () => setCreating(true),
    saved: () => setCreating(false),
  };
}
export function useAccountContact(id: string) {
  const query = useQuery({
    queryKey: ["account-contact", id],
    queryFn: () => api<ContactState>(`/leads/${id}/account-contact`),
    retry: false,
  });
  const accounts = useAccounts(),
    mutation = useWorkspaceMutation();
  const [accountId, setAccountId] = useState(""),
    [note, setNote] = useState(""),
    [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const reserve = (kind: "FIRST" | "FOLLOWUP") =>
    mutation.mutate(
      {
        path: `/leads/${id}/account-contact`,
        body: { accountId, kind, requestKey },
      },
      { onSuccess: () => setRequestKey(crypto.randomUUID()) },
    );
  return {
    query,
    accounts,
    mutation,
    accountId,
    setAccountId,
    note,
    setNote,
    reserve,
  };
}
