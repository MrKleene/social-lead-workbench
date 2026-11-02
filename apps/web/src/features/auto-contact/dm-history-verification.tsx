import {useRef,useState} from 'react';
import {useMutation,useQueryClient} from '@tanstack/react-query';
import type {ReplyHistoryItem} from '@crm/contracts';
import {Button} from '@/components/ui/button';import {ErrorNotice} from '@/components/feedback';import {send} from '@/lib/api';
/** Explicit passive readback only; no send/preview endpoint and no automatic retry. */
export function DmHistoryVerification({item}:{item:ReplyHistoryItem}){
 const client=useQueryClient(),flight=useRef(false),[result,setResult]=useState<string|null>(null);
 const m=useMutation<{status?:string;outcome?:string},Error,void>({mutationFn:()=>item.jobId?send<{status:string}>(`/auto-contact/jobs/${encodeURIComponent(item.jobId)}/reconcile`,'POST',{receipt:'READ_EXISTING_DM_ONLY'}):send<{outcome:string}>(`/direct-messages/attempts/${encodeURIComponent(item.id)}/verify`,'POST',{}),retry:false,onSuccess:r=>{setResult(('outcome'in r?r.outcome:r.status)==='CONFIRMED'?'已确认发送':'回执尚未确认，请勿重发');void client.invalidateQueries({queryKey:['reply-history']});void client.invalidateQueries({queryKey:['accounts']})},onSettled:()=>{flight.current=false}});
 if(!item.canVerifyDm||item.displayStatus!=='UNKNOWN')return null;
 return <div className="action-row"><Button size="sm" variant="outline" disabled={m.isPending||result==='已确认发送'} onClick={()=>{if(flight.current)return;flight.current=true;m.mutate()}}>{m.isPending?'核查中…':'核查私信回执'}</Button><span role="status">{result}</span><ErrorNotice error={m.error}/></div>;
}
