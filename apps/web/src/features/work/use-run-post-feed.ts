import {useEffect} from 'react';
import {useQuery} from '@tanstack/react-query';
import {runPostFeedSchema} from '@crm/contracts';
import {api,ApiError} from '@/lib/api';
import type {Run} from '@/features/collection/types';
export function useRunPostFeed(configId:string,run:Run,visible:boolean){
 const query=useQuery({queryKey:['collection',configId,'run-posts',run.id],queryFn:async()=>{
  const data=runPostFeedSchema.parse(await api(`/collection/configs/${encodeURIComponent(configId)}/runs/${encodeURIComponent(run.id)}/posts`));
  if(data.runId!==run.id||data.configId!==configId)throw Error('任务明细不匹配，请刷新');return data;
 },enabled:visible,retry:false,refetchOnWindowFocus:false,refetchInterval:q=>visible&&['QUEUED','RUNNING'].includes(run.status)&&!(q.state.error instanceof ApiError&&q.state.error.status===404)?2000:false,refetchIntervalInBackground:false});
 const {refetch}=query;
 useEffect(()=>{if(visible)void refetch();},[visible,run.status,refetch]);
 return {...query,unsupported:query.error instanceof ApiError&&query.error.status===404};
}
