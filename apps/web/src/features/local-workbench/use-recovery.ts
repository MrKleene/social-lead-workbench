import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { localApi, type RecoveryPreview } from "./local-api";

/** 恢复核对：解锁前提是未知发送清零并完成对账，删数据不会解开暂停。 */
export function useRecovery() {
  const client = useQueryClient();
  const [consent, setConsent] = useState(false);
  const [plan, setPlan] = useState<RecoveryPreview | null>(null);
  const [notice, setNotice] = useState("");

  const recovery = useQuery({
    queryKey: ["local", "recovery"],
    queryFn: () => localApi("recoveryPreview"),
  });

  const inspect = useMutation({
    mutationFn: () => localApi("recoveryPreview"),
    onSuccess: (preview) => {
      setPlan(preview);
      setConsent(false);
    },
  });

  const resume = useMutation({
    mutationFn: () =>
      localApi("resumeReviewedCopy", {
        previewHash: plan!.previewHash,
        consent: "resume-reviewed-copy-for-new-work-v1",
      }),
    onSuccess: () => {
      setPlan(null);
      setConsent(false);
      setNotice("已解除副本核对暂停。");
      void client.invalidateQueries({ queryKey: ["local"] });
    },
  });

  return {
    recovery,
    plan,
    consent,
    setConsent,
    inspect,
    resume,
    notice,
    error: recovery.error || inspect.error || resume.error,
  };
}
