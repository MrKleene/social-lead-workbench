import {heartbeatJobs} from './journey-event-sync';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {QueryClient,QueryObserver} from '@tanstack/react-query';
import type {JourneySummary} from '@crm/contracts';
import {connectJourneyEvents,heartbeatSnapshot,journeyConnectionKey,journeyQuery} from './journey-event-sync';
class Source {
 callbacks=new Map<string,Array<(e:any)=>void>>();closed=false;
 addEventListener(name:string,fn:(e:any)=>void){this.callbacks.set(name,[...(this.callbacks.get(name)||[]),fn]);}
 close(){this.closed=true;}
 emit(name:string,data:unknown){this.callbacks.get(name)?.forEach(fn=>fn({data:JSON.stringify(data)}));}
}
const event=(id:string,runId='one',kind='change')=>({v:1,id,kind,runId,configId:'config'});
describe('journey event synchronization',()=>{
 let client:QueryClient,sources:Source[],stop:()=>void,unsub:Array<()=>void>;
 beforeEach(()=>{vi.useFakeTimers();client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}});sources=[];unsub=[];stop=connectJourneyEvents(client,()=>{const source=new Source();sources.push(source);return source;});});
 afterEach(()=>{stop();unsub.forEach(fn=>fn());client.clear();vi.unstubAllGlobals();vi.useRealTimers();});
 async function observe(key:unknown[],fn=vi.fn(async()=>({value:'database'}))){const q=new QueryObserver(client,{queryKey:key,queryFn:fn});unsub.push(q.subscribe(()=>{}));await vi.advanceTimersByTimeAsync(0);fn.mockClear();return fn;}
 it('initial ready refetches authoritative snapshots; healthy heartbeats do not poll',async()=>{
  const read=await observe(['journey-summary','one']);sources[0].emit('ready',{available:true});await vi.advanceTimersByTimeAsync(130);expect(read).toHaveBeenCalledTimes(1);read.mockClear();
  for(let i=0;i<4;i++){await vi.advanceTimersByTimeAsync(15000);sources[0].emit('heartbeat',{available:true});}expect(read).not.toHaveBeenCalled();expect(client.getQueryData(journeyConnectionKey)).toBe('connected');
  sources[0].emit('sync',{});await vi.advanceTimersByTimeAsync(130);expect(read).toHaveBeenCalledTimes(1);
 });
 it('coalesces fast changes, deduplicates replay, and keeps other runs isolated',async()=>{
  const one=await observe(['journey-summary','one']),two=await observe(['journey-summary','two']),runPosts=await observe(['collection','config','run-posts','one',0]);
  sources[0].emit('journey',event('tx1'));sources[0].emit('journey',event('tx2'));await vi.advanceTimersByTimeAsync(130);
  expect(one).toHaveBeenCalledTimes(1);expect(two).not.toHaveBeenCalled();expect(runPosts).toHaveBeenCalledTimes(1);
  sources[0].emit('journey',event('tx2'));await vi.advanceTimersByTimeAsync(130);expect(one).toHaveBeenCalledTimes(1);
 });
 it('out-of-order signals only reread current database data; never regress status',async()=>{
  const read=vi.fn(async()=>({value:'CONFIRMED'}));await observe(['journey-summary','one'],read);
  sources[0].emit('journey',event('new'));await vi.advanceTimersByTimeAsync(130);sources[0].emit('journey',event('older'));await vi.advanceTimersByTimeAsync(130);
  expect(client.getQueryData(['journey-summary','one'])).toEqual({value:'CONFIRMED'});
 });
 it('lost phase event is repaired by a new-phase heartbeat',async()=>{
  const read=await observe(['journey-summary','one']);sources[0].emit('journey',{...event('hb','one','heartbeat'),at:new Date().toISOString(),executionId:'exec',session:'session',phase:'REVIEWING'});await vi.advanceTimersByTimeAsync(130);expect(read).toHaveBeenCalledTimes(1);
 });
 it('row heartbeats recover stale or missing phases by reading the database, but healthy rows do not poll',async()=>{
  const key=['auto-contact-jobs',0,'','one'],live={executionId:'j',stage:'contact',session:'s',phase:'SUBMITTING',at:new Date().toISOString(),state:'stale'};
  const read=vi.fn(async()=>({items:[{id:'j',status:'ATTEMPTED',live:{...live,state:'running'}}],total:1}));
  await observe(key,read as any);client.setQueryData(key,{items:[{id:'j',status:'ATTEMPTED',live}],total:1});
  const hb={...event('row-hb','one','heartbeat'),executionId:'j',session:'s',phase:'SUBMITTING',at:new Date().toISOString()};
  sources[0].emit('journey',hb);await vi.advanceTimersByTimeAsync(130);expect(read).toHaveBeenCalledTimes(1);read.mockClear();
  sources[0].emit('journey',{...hb,id:'healthy',at:new Date().toISOString()});await vi.advanceTimersByTimeAsync(130);expect(read).not.toHaveBeenCalled();
  sources[0].emit('journey',{...hb,id:'lost-change',phase:'CONFIRMING',at:new Date().toISOString()});await vi.advanceTimersByTimeAsync(130);expect(read).toHaveBeenCalledTimes(1);
 });
 it('reconnect, unavailable listener, reset and refresh each reconcile snapshots',async()=>{
  const read=await observe(['journey-summary','one']);sources[0].emit('error',{});expect(client.getQueryData(journeyConnectionKey)).toBe('reconnecting');await vi.advanceTimersByTimeAsync(130);
  sources[0].emit('ready',{available:false});expect(client.getQueryData(journeyConnectionKey)).toBe('degraded');await vi.advanceTimersByTimeAsync(130);
  sources[0].emit('ready',{available:true});await vi.advanceTimersByTimeAsync(130);sources[0].emit('journey',{...event('archive',null as any,'reset'),configId:null});await vi.advanceTimersByTimeAsync(130);
  expect(read).toHaveBeenCalledTimes(4);
 });
 it('detects a silently lost stream and rejects events from closed sources',async()=>{
  const read=await observe(['journey-summary','one']);await vi.advanceTimersByTimeAsync(60001);expect(sources[0].closed).toBe(true);expect(sources).toHaveLength(2);await vi.advanceTimersByTimeAsync(130);read.mockClear();sources[0].emit('journey',event('old-source'));await vi.advanceTimersByTimeAsync(130);expect(read).not.toHaveBeenCalled();
 });
 it('cleans up timers and transport on unmount, ignores malformed events',async()=>{
  const read=await observe(['journey-summary','one']);sources[0].emit('journey',{v:1,kind:'SEND',id:'bad'});await vi.advanceTimersByTimeAsync(130);expect(read).not.toHaveBeenCalled();stop();await vi.advanceTimersByTimeAsync(120000);expect(sources).toHaveLength(1);expect(sources[0].closed).toBe(true);
 });
 it('two tabs use independent connections and reconnect does not mutate the other',async()=>{
  const second=new QueryClient(),other=new Source();const close=connectJourneyEvents(second,()=>other);sources[0].emit('ready',{available:true});other.emit('ready',{available:true});sources[0].emit('error',{});expect(second.getQueryData(journeyConnectionKey)).toBe('connected');close();second.clear();
 });
 it('browser offline/online events close stale streams and reconnect immediately',async()=>{
  stop();const target=new EventTarget();vi.stubGlobal('window',target);vi.stubGlobal('navigator',{onLine:true});stop=connectJourneyEvents(client,()=>{const s=new Source();sources.push(s);return s;});const before=sources.length;target.dispatchEvent(new Event('offline'));expect(sources.at(-1)?.closed).toBe(true);expect(client.getQueryData(journeyConnectionKey)).toBe('reconnecting');target.dispatchEvent(new Event('online'));expect(sources.length).toBe(before+1);stop();target.dispatchEvent(new Event('online'));expect(sources.length).toBe(before+1);
 });
 it('missing EventSource gracefully degrades instead of crashing the app',async()=>{
  stop();let calls=0;stop=connectJourneyEvents(client,()=>{calls++;throw Error('unavailable');});expect(client.getQueryData(journeyConnectionKey)).toBe('reconnecting');await vi.advanceTimersByTimeAsync(60001);expect(calls).toBe(2);
 });
});
it('heartbeat only extends a matching live execution and phase, never resurrects terminal/old sessions',()=>{
 const now=Date.now(),old={live:{current:[{state:'running',executionId:'job',session:'session',phase:'SUBMITTING',at:new Date(now-5000).toISOString()}],logs:[]}} as unknown as JourneySummary;
 const e={...event('h','one','heartbeat'),at:new Date(now).toISOString(),executionId:'job',session:'session',phase:'SUBMITTING'} as any;
 expect(heartbeatSnapshot(old,e,now)?.live?.current[0].at).toBe(e.at);expect(heartbeatSnapshot(old,{...e,session:'other'},now)).toBeUndefined();expect(heartbeatSnapshot(old,{...e,phase:'CONFIRMING'},now)).toBeUndefined();expect(heartbeatSnapshot(old,{...e,at:new Date(now-30000).toISOString()},now)).toBeUndefined();
 const ended={...old,live:{...old.live!,current:[{...old.live!.current[0],state:'stale' as const}]}};expect(heartbeatSnapshot(ended,e,now)).toBeUndefined();
});
it('query scope covers histories and pagination without crossing runs/configs',()=>{
 expect(journeyQuery(['run-review','two','posts',0],'one','c')).toBe(false);expect(journeyQuery(['auto-contact-jobs',0,'','two'],'one','c')).toBe(false);expect(journeyQuery(['collection','run-history','other',''], 'one','c')).toBe(false);expect(journeyQuery(['collection','c','run-posts','one',30],'one','c')).toBe(true);expect(journeyQuery(['journey-connection'])).toBe(false);
});


it('row heartbeats renew only matching live identity and never resurrect terminal outcomes',()=>{
 const now=Date.now(),at=new Date(now-1000).toISOString(),live={executionId:'j',stage:'contact' as const,session:'s',phase:'SUBMITTING',label:'正在发送',at,state:'running' as const,concurrent:1};
 const old:any={items:[{id:'j',status:'ATTEMPTED',live},{id:'done',status:'CONFIRMED',live:{...live,executionId:'done'}}],total:2};
 const e:any={...event('beat','one','heartbeat'),executionId:'j',session:'s',phase:'SUBMITTING',at:new Date(now).toISOString()};
 const next=heartbeatJobs(old,e,now)!;expect(next.items[0].live?.at).toBe(e.at);expect(next.items[0].status).toBe('ATTEMPTED');expect(next.items[1]).toBe(old.items[1]);
 for(const patch of [{session:'wrong'},{phase:'CONFIRMING'},{at:new Date(now-2000).toISOString()},{at:new Date(now+6000).toISOString()}])expect(heartbeatJobs(old,{...e,...patch},now)).toBe(old);
 expect(heartbeatJobs({...old,items:[{...old.items[0],status:'UNKNOWN'}]},e,now)?.items[0].live?.at).toBe(at);
});
