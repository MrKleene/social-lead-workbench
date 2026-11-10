/** Global admission spacing, not a retry policy. A failed/unknown batch is never replayed here. */
type CallTiming={status:string;createdAt:Date;finishedAt?:Date|null;errorCode?:string|null};
export function modelCallWaitMs(last:CallTiming|null,now=Date.now()){
 if(!last)return 0;
 const success=last.status==='COMPLETED'&&!last.errorCode;
 // Successful requests stay serial and at most one start/second. Longer calls need no idle gap.
 // Provider throttling applies across credentials/workspaces; keep the cooldown global and durable.
 const delay=success?1000:last.errorCode==='RATE_LIMIT'?60000:30000;
 const anchor=(success?last.createdAt:last.finishedAt??last.createdAt).getTime();
 if(!Number.isFinite(anchor))return delay;
 return Math.max(0,anchor+delay-now);
}
