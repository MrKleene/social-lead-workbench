import {useQuery} from '@tanstack/react-query';
import {api} from '@/lib/api';
import type {Run} from '@/features/collection/types';
export type RunHistory={items:Run[];nextCursor:string|null;current:Run|null;activePhase:'collect'|'review'|'contact'|null;selected:Run|null;selectedMissing:boolean};
export function useRunHistory(configId:string|undefined,runId='',before='',enabled=true){
 const params=new URLSearchParams();if(runId)params.set('runId',runId);if(before)params.set('before',before);
 return useQuery({queryKey:['collection','run-history',configId,runId,before],queryFn:({signal})=>api<RunHistory>(`/collection/configs/${configId}/run-history?${params}`,{signal}),enabled:enabled&&!!configId,refetchInterval:enabled?5000:false,refetchIntervalInBackground:false,retry:false});
}
export function runSelection(data:RunHistory|undefined,requested:string,fresh:boolean){
 const current=data?.current??undefined;
 const run=requested?data?.selected??undefined:fresh?undefined:current;
 return {run,current,history:!!requested&&!!current&&requested!==current.id,missing:!!requested&&!!data?.selectedMissing};
}

/** Label follows the same whole-journey activity metadata as the return target. */
export function returnRunLabel(phase:RunHistory['activePhase']|undefined){return phase?'返回进行中任务':'返回最新任务';}
