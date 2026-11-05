import {useCallback,useLayoutEffect,useRef,useState} from 'react';
import {useSearchParams} from 'react-router-dom';
import {useQueryClient} from '@tanstack/react-query';
import {useConfig} from '@/features/collection/use-collection';
import type {Config,Run} from '@/features/collection/types';
import {collectionTaskSession} from './collection-task-session';
/** One visible visit to one configuration. Late start responses cannot attach
 * to another configuration or a later visit; nothing is persisted in storage. */
export function useCollectionTaskSession(config:Config|undefined,visible:boolean,external?:{id:string;run?:Run;pending:boolean;error:unknown}){
 const [params,setParams]=useSearchParams();
 const requested=params.get('run')||'';
 const client=useQueryClient(),detail=useConfig(config?.id);
 const [started,setStarted]=useState(''),[checking,setChecking]=useState(visible);
 const scope=useRef({id:config?.id,visible});
 const refresh=useCallback(async()=>{await Promise.all([client.refetchQueries({queryKey:['collection'],exact:true,type:'active'}),client.refetchQueries({queryKey:['mcp-readiness'],exact:true,type:'active'}),...(config?.id?[client.refetchQueries({queryKey:['collection',config.id],exact:true,type:'active'})]:[])]);},[client,config?.id]);
 useLayoutEffect(()=>{
  const visit={id:config?.id,visible};scope.current=visit;setStarted('');setChecking(visible);
  if(visible)void refresh().finally(()=>{if(scope.current===visit)setChecking(false);});
 },[visible,config?.id,refresh]);
 const activeId=config?.activeRunId||config?.runs.find(r=>['QUEUED','RUNNING'].includes(r.status))?.id;
 // A task observed live during this visit also keeps its eventual result.
 useLayoutEffect(()=>{if(visible&&activeId)setStarted(activeId);},[visible,config?.id,activeId]);
 const runs=detail.data?.runs||config?.runs||[];
 const selection=external?external.id:requested||activeId||(params.get('fresh')!=='1'?started||runs[0]?.id:'')||'';
 const view=collectionTaskSession(config,[...(detail.data?.runs||[]),...(external?.run?[external.run]:[])],selection,selection);
 // URL state survives refresh and Back/Forward. Reading a task never resumes it.
 useLayoutEffect(()=>{if(!external&&visible&&selection&&!requested&&config){setParams(old=>{const p=new URLSearchParams(old);p.set('config',config.id);p.set('run',selection);p.delete('fresh');return p;},{replace:true});}},[external,visible,selection,requested,config?.id,setParams]);
 const currentRun=external?external.run:view.runs.find(r=>r.id===selection);
 return {...view,pending:external?external.pending:view.pending,currentId:selection,currentRun,checking,error:external?.error||detail.error,refresh,
  token:()=>scope.current,remember:(id:string,visit:typeof scope.current)=>{if(scope.current===visit&&visit.visible&&visit.id===config?.id){setStarted(id);return true;}return false;}
 };
}
