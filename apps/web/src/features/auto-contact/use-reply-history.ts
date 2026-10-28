import {useSearchParams} from 'react-router-dom';
import {useQuery} from '@tanstack/react-query';
import type {ReplyHistoryPage} from '@crm/contracts';
import {api} from '@/lib/api';
const allowed=['','CONFIRMED','FAILED','NOT_ATTEMPTED','UNKNOWN','RESERVED','ATTEMPTED','CANCELLED','SIMULATED_SUCCESS'];
export function useReplyHistory(enabled:boolean) {
    const [params,setParams]=useSearchParams();
    const requested=params.get('outcome')??'CONFIRMED',outcome=allowed.includes(requested)?requested:'CONFIRMED';
    const requestedOffset=Number(params.get('offset')??0),offset=Number.isInteger(requestedOffset)&&requestedOffset>=0&&requestedOffset<=1000000?requestedOffset:0;
    const query=useQuery({queryKey:['reply-history',offset,outcome],enabled,
        queryFn:()=>api<ReplyHistoryPage>(`/auto-contact/attempts?offset=${offset}${outcome?`&outcome=${outcome}`:''}`),refetchInterval:5000});
    const change=(value:string,nextOffset:number)=>setParams({outcome:value,offset:String(nextOffset)});
    return {query,offset,setOffset:(value:number)=>change(outcome,value),outcome,filter:(value:string)=>change(value,0)};
}
