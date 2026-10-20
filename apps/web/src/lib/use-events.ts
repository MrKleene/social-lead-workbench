import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
export function useEvents(enabled: boolean) {
  const client = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    const source = new EventSource("/api/events");
    source.addEventListener("refresh", () => {
      void client.invalidateQueries({ queryKey: ["accounts"] });
      void client.invalidateQueries({ queryKey: ["account-contact"] });
      void client.invalidateQueries({ queryKey: ["leads"] });
      void client.invalidateQueries({ queryKey: ["collection"] });
      void client.invalidateQueries({ queryKey: ["notices"] });
      void client.invalidateQueries({ queryKey: ["tasks"] });
      void client.invalidateQueries({ queryKey: ["lead"] });
    });
    return () => source.close();
  }, [client, enabled]);
}
