import {useCallback,useLayoutEffect,useRef,useState} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {useConfig} from '@/features/collection/use-collection';
import type {Config} from '@/features/collection/types';
import {collectionTaskSession} from './collection-task-session';
/** One visible visit to one configuration. Late start responses cannot attach
 * to another configuration or a later visit; nothing is persisted in storage. */
export function useCollectionTaskSession(config:Config|undefined,visible:boolean){
 const client=useQueryClient(),detail=useConfig(config?.id),refetchDetail=detail.refetch;
 const [started,setStarted]=useState(''),[checking,setChecking]=useState(visible);
 const scope=useRef({id:config?.id,visible});
 const refresh=useCallback(async()=>{await Promise.all([client.refetchQueries({queryKey:['collection'],exact:true,type:'active'}),client.refetchQueries({queryKey:['mcp-readiness'],exact:true,type:'active'}),...(config?.id?[refetchDetail()]:[])]);},[client,config?.id,refetchDetail]);
 useLayoutEffect(()=>{
  const visit={id:config?.id,visible};scope.current=visit;setStarted('');setChecking(visible);
  if(visible)void refresh().finally(()=>{if(scope.current===visit)setChecking(false);});
 },[visible,config?.id,refresh]);
 const activeId=config?.activeRunId||config?.runs.find(r=>['QUEUED','RUNNING'].includes(r.status))?.id;
 // A task observed live during this visit also keeps its eventual result.
 useLayoutEffect(()=>{if(visible&&activeId)setStarted(activeId);},[visible,config?.id,activeId]);
 const view=collectionTaskSession(config,detail.data?.runs,started);
 return {...view,checking,error:detail.error,refresh,
  token:()=>scope.current,remember:(id:string,visit:typeof scope.current)=>{if(scope.current===visit&&visit.visible&&visit.id===config?.id){setStarted(id);}}
 };
}
