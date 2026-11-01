import { useState, useEffect, useRef } from "react";
import {useConfirmWorkspaceLeave} from "@/features/work/draft-guard";
import { useLead } from "./use-leads";
import { DetailForms } from "./lead-detail-forms";
import { useAuth } from "@/features/auth/use-auth";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { ErrorNotice, Loading } from "@/components/feedback";
import { platformLabel, statusLabel } from "@/lib/types";

export function LeadDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { user } = useAuth();
  const confirmLeave = useConfirmWorkspaceLeave();
  const state = useLead(id, user?.role === "ADMIN");
  const [open, setOpen] = useState(true);
  const restoreFocus = useRef(document.activeElement);
  // Keep the route mounted until Radix completes its exit animation.
  // The timeout also completes closing when reduced-motion disables animation events.
  useEffect(() => {
    if (open) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(onClose, reduced ? 0 : 260);
    return () => window.clearTimeout(timer);
  }, [open, onClose]);
  const lead = state.query.data;
  return (
    <Sheet open={open} onOpenChange={next => { if(next)setOpen(true);else void confirmLeave().then(ok=>{if(ok)setOpen(false);}); }}>
      <SheetContent className="detail-sheet" onCloseAutoFocus={event => {
        event.preventDefault();
        if (restoreFocus.current instanceof HTMLElement && restoreFocus.current.isConnected) restoreFocus.current.focus();
      }}>
        <SheetHeader>
          <div className="detail-kicker"><span className="eyebrow">LEAD PROFILE</span>{lead?.isDemo && <Badge variant="secondary">虚构演示</Badge>}</div>
          <SheetTitle>{lead?.identity.nickname || "线索详情"}</SheetTitle>
          <SheetDescription>{lead?.summary || "保留需求原文，记录每一步判断与跟进。"}</SheetDescription>
          {lead && <div className="detail-badges"><Badge className={`platform-${lead.identity.platform}`} variant="secondary">{platformLabel[lead.identity.platform]}</Badge><Badge variant="outline" className={`status-${lead.status}`}><span className="status-dot" />{statusLabel[lead.status]}</Badge><span>平台 ID：{lead.identity.platformUserId}</span></div>}
        </SheetHeader>
        <div className="detail-scroll">
          <ErrorNotice error={state.query.error} />
          {state.query.isPending ? <Loading /> : !state.query.isError && lead && <DetailForms key={id} lead={lead} state={state} admin={user?.role === "ADMIN"} />}
        </div>
      </SheetContent>
    </Sheet>
  );
}
