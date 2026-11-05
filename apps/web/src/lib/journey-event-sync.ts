import {journeyPushSchema,type JourneyPush,type JourneySummary,type AutoContactJobView} from '@crm/contracts';
import type {QueryClient,QueryKey} from '@tanstack/react-query';
export type JourneyConnection='connecting'|'connected'|'reconnecting'|'degraded';
export const journeyConnectionKey=['journey-connection'] as const;
export function journeyQuery(key:QueryKey,runId?:string|null,configId?:string|null){
 const [name]=key;
 if(name==='journey-summary'||name==='run-review')return !runId||key[1]===runId;
 if(name==='auto-contact-jobs')return !runId||!key[3]||key[3]===runId;
 if(name==='collection'){
  if(key.length===1)return true;
  if(key[1]==='run-history')return !configId||key[2]===configId;
  if(key[2]==='run-posts')return !runId||key[3]===runId;
  if(key[2]==='captures'&&runId&&key[5])return key[5]===runId;
  return !configId||key[1]===configId||key[1]==='dashboard';
 }
 return ['comment-review','auto-contact','pending-replies','reply-history','project-overview'].includes(String(name));
}
/** A heartbeat can renew only an already proven, identical execution/phase. Never a result. */
export function heartbeatSnapshot(old:JourneySummary|undefined,e:JourneyPush,now=Date.now()):JourneySummary|undefined{
 if(!old?.live||!e.at||!e.executionId||!e.session||!e.phase)return;
 const at=new Date(e.at).getTime();if(!Number.isFinite(at)||at>now+5000||now-at>15000)return;
 const live=old.live.current.find(x=>x.executionId===e.executionId&&x.session===e.session&&x.phase===e.phase);
 if(!live||live.state!=='running')return;
 if(at<=new Date(live.at).getTime())return old;
 return {...old,live:{...old.live,current:old.live.current.map(x=>x===live?{...x,at:new Date(at).toISOString()}:x)}};
}
export function heartbeatJobs(old:{items:AutoContactJobView[];total:number}|undefined,e:JourneyPush,now=Date.now()){
 if(!old)return;
 let changed=false;
 const items=old.items.map(job=>{
  if(!job.live||!['WAITING_ACCOUNT','MANUAL_READY','RESERVED','ATTEMPTED'].includes(job.status))return job;
  const snapshot:JourneySummary={reviews:{},reviewJobs:{},contacts:{},matches:0,live:{observedAt:e.at??'',recent:[],current:[job.live]}};
  const next=heartbeatSnapshot(snapshot,e,now);if(!next||next===snapshot)return job;
  changed=true;return {...job,live:next.live!.current[0]};
 });return changed?{...old,items}:old;
}
type Source={addEventListener:(name:string,fn:(e:any)=>void)=>void;close:()=>void};
/** One source per app/tab. Events invalidate permission-checked snapshots, never patch outcomes. */
export function connectJourneyEvents(client:QueryClient,makeSource:()=>Source=()=>new EventSource('/api/events'),now=Date.now){
 let stopped=false,source:Source|undefined,last=now(),state:JourneyConnection='connecting',timer:ReturnType<typeof setTimeout>|undefined;
 const seen=new Set<string>(),pending=new Map<string,{runId?:string|null;configId?:string|null}>();
 const connection=(next:JourneyConnection)=>{if(state===next)return false;state=next;client.setQueryData(journeyConnectionKey,next);return true;};
 client.setQueryDefaults(journeyConnectionKey,{gcTime:Infinity});
 client.setQueryData(journeyConnectionKey,state);
 const schedule=(runId?:string|null,configId?:string|null)=>{pending.set(runId??'*',{runId,configId});if(timer)return;timer=setTimeout(()=>{timer=undefined;if(stopped)return;const scopes=[...pending.values()];pending.clear();void client.invalidateQueries({predicate:q=>scopes.some(x=>journeyQuery(q.queryKey,x.runId,x.configId))});},120);};
 const start=()=>{
  if(stopped)return;last=now();if(typeof navigator!=='undefined'&&navigator.onLine===false){connection('reconnecting');return;}let current:Source;try{current=makeSource();}catch{connection('reconnecting');schedule();return;}source=current;
  const listen=(name:string,fn:(data:any)=>void)=>current.addEventListener(name,e=>{if(stopped||source!==current)return;last=now();try{fn(JSON.parse(e.data));}catch{/* malformed transport payload cannot change display state */}});
  listen('ready',d=>{connection(d.available===true?'connected':'degraded');schedule();});
  listen('heartbeat',d=>{if(connection(d.available===true?'connected':'degraded'))schedule();});
  listen('sync',()=>schedule());
  listen('journey',raw=>{
   const parsed=journeyPushSchema.safeParse(raw);if(!parsed.success)return;const e=parsed.data;if(seen.has(e.id))return;seen.add(e.id);if(seen.size>512)seen.delete(seen.values().next().value!);
   if(e.kind==='heartbeat'){
    for(const q of client.getQueryCache().findAll({queryKey:['auto-contact-jobs']})){
     if(!journeyQuery(q.queryKey,e.runId,e.configId))continue;
     const old=client.getQueryData<{items:AutoContactJobView[];total:number}>(q.queryKey),job=old?.items.find(j=>j.id===e.executionId);
     if(job&&['WAITING_ACCOUNT','MANUAL_READY','RESERVED','ATTEMPTED'].includes(job.status)&&(!job.live||job.live.state!=='running'||job.live.session!==e.session||job.live.phase!==e.phase)&&q.isActive())schedule(e.runId,e.configId);
     client.setQueryData(q.queryKey,heartbeatJobs(old,e,now()));
    }
    const key=['journey-summary',e.runId],old=client.getQueryData<JourneySummary>(key),next=heartbeatSnapshot(old,e,now());
    if(next){if(next!==old)client.setQueryData(key,next);}else if(client.getQueryCache().find({queryKey:key,exact:true})?.isActive())schedule(e.runId,e.configId);
   }else schedule(e.kind==='reset'?null:e.runId,e.configId);
  });
  // Existing unrelated lists keep their low-frequency refresh. Journey data has its own scope.
  listen('refresh',()=>{for(const key of ['accounts','account-contact','leads','notices','tasks','lead'])void client.invalidateQueries({queryKey:[key]});});
  current.addEventListener('error',()=>{if(!stopped&&source===current&&connection('reconnecting'))schedule();});
 };
 const offline=()=>{connection('reconnecting');source?.close();source=undefined;schedule();};
 const online=()=>{source?.close();start();schedule();};
 if(typeof window!=='undefined'){window.addEventListener('offline',offline);window.addEventListener('online',online);}
 start();const watchdog=setInterval(()=>{if(now()-last>45000){connection('reconnecting');source?.close();start();schedule();}},15000);
 return()=>{stopped=true;if(typeof window!=='undefined'){window.removeEventListener('offline',offline);window.removeEventListener('online',online);}clearInterval(watchdog);if(timer)clearTimeout(timer);source?.close();client.setQueryData(journeyConnectionKey,'connecting');};
}
