import {useJourneyPolling} from '@/lib/use-events';
import {useCallback,useEffect,useSyncExternalStore} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {runPostFeedSchema,type RunPostFeed} from '@crm/contracts';
import {api,ApiError} from '@/lib/api';
import type {Run} from '@/features/collection/types';
export const runPostFeedKey=(configId:string,runId:string)=>['collection',configId,'run-posts',runId];
/** Observe the timeline cache without creating another network request or polling timer. */
export function useRunPostSnapshot(configId:string,runId?:string){
 const client=useQueryClient();
 const subscribe=useCallback((notify:()=>void)=>client.getQueryCache().subscribe(event=>{
  const key=event.query.queryKey;
  if(key[0]==='collection'&&key[1]===configId&&key[2]==='run-posts'&&key[3]===(runId||'none'))notify();
 }),[client,configId,runId]);
 const snapshot=useCallback(()=>client.getQueryData<RunPostFeed>(runPostFeedKey(configId,runId||'none')),[client,configId,runId]);
 return useSyncExternalStore(subscribe,snapshot,snapshot);
}
export function useRunPostFeed(configId:string,run:Pick<Run,'id'|'status'>,visible:boolean){
 const poll=useJourneyPolling();
 const query=useQuery({queryKey:runPostFeedKey(configId,run.id),queryFn:async()=>{
  const data=runPostFeedSchema.parse(await api(`/collection/configs/${encodeURIComponent(configId)}/runs/${encodeURIComponent(run.id)}/posts`));
  if(data.runId!==run.id||data.configId!==configId)throw Error('任务明细不匹配，请刷新');return data;
 },enabled:visible,retry:false,refetchOnWindowFocus:false,refetchInterval:q=>visible&&['QUEUED','RUNNING'].includes(run.status)&&!(q.state.error instanceof ApiError&&q.state.error.status===404)?poll:false,refetchIntervalInBackground:false});
 const {refetch}=query;
 useEffect(()=>{if(visible)void refetch();},[visible,run.status,refetch]);
 return {...query,unsupported:query.error instanceof ApiError&&query.error.status===404};
}
