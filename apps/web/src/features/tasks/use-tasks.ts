import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, send } from "@/lib/api";
import type { Task } from "@/lib/types";
export function useTasks() {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["tasks"],
    queryFn: () => api<Task[]>("/tasks"),
  });
  const update = useMutation({
    mutationFn: ({ id, status }: { id: string; status: Task["status"] }) =>
      send(`/tasks/${id}`, "PATCH", { status }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["tasks"] }),
  });
  return { query, update };
}
