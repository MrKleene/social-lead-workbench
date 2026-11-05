import 'reflect-metadata';
import {describe,it,expect,vi} from 'vitest';
import {InboxService} from '../src/inbox/inbox-service';
const sender='a'.repeat(24),actor={id:'admin',role:'ADMIN'};
const signal=(id:string)=>JSON.stringify({v:1,t:4,m:id,b:{d:{biz:'push',b:[{d:Buffer.from(JSON.stringify({topic:'message_center',payload:JSON.stringify({you:{mentions:1}})})).toString('base64')}]}}});
const varint=(n:number)=>{let v=BigInt(n),a:number[]=[];do{let b=Number(v&127n);v>>=7n;a.push(b|(v?128:0))}while(v);return Buffer.from(a)};
const field=(k:number,v:Buffer|string)=>{const b=Buffer.from(v);return Buffer.concat([varint(k*8+2),varint(b.length),b])};
const dm=(receiver=sender,from='fictional-user')=>{const p={message_id:'message',sender:from,receiver,timestamp:Date.now(),content:JSON.stringify({content:'fictional incoming message',nickname:'fixture',content_type:1})};return JSON.stringify({v:1,t:4,m:'dm-'+receiver+from,b:{d:{biz:'im',b:[{d:field(4,Buffer.concat([field(2,p.message_id),field(5,JSON.stringify(p))])).toString('base64')}]}}})};
async function run(batches:any[],options:{stopOK?:boolean,busy?:boolean}={}){
 const abort=new AbortController(),events:any[]=[],ingested:any[]=[],calls:string[]=[],release=vi.fn(),stop=vi.fn(async()=>options.stopOK!==false);
 const store={db:{$queryRawUnsafe:vi.fn(async()=>[{busy:!!options.busy}]),$executeRaw:vi.fn()},get:vi.fn(async()=>({generation:'g',stopRequested:false})),status:vi.fn(async(_id:any,_g:any,p:any)=>{events.push(p)}),ingest:vi.fn(async(...a:any[])=>{ingested.push(a)})};
 const wire={stop,call:vi.fn(async(name:string,channel?:string)=>{calls.push(name+(channel?':'+channel:''));if(name==='inbox_start')return{identity:'MATCH',submissions:0};if(name==='inbox_snapshot')return{identity:'MATCH',submissions:0,items:[],complete:true};if(!batches.length){abort.abort();return{identity:'MATCH',submissions:0,stopped:true,frames:[]}}return{identity:'MATCH',submissions:0,socketConnected:true,frames:[],...batches.shift()}})};
 const devices={acquire:vi.fn(async()=>({root:'/fictional',token:'token',signal:abort.signal,release}))},login={inspect:vi.fn(async()=>'UNVERIFIED'),deviceId:()=> 'fixture'},runtime={open:vi.fn(async()=>wire)};
 const service=new InboxService(store as any,devices as any,login as any,runtime);await(service as any).run(actor,'account',sender,'key','g',abort);return{events,ingested,calls,release,stop,runtime};
}
describe('receive-only orchestration with fake native peer',()=>{
 it('idle drain performs no periodic platform snapshots; clean exit releases account',async()=>{const r=await run([{frames:[]},{frames:[]}]);expect(r.calls.filter(x=>x.startsWith('inbox_snapshot'))).toEqual(['inbox_snapshot:COMMENT','inbox_snapshot:DM']);expect(r.stop).toHaveBeenCalledOnce();expect(r.release).toHaveBeenCalledOnce()});
 it('distinct same-count comment signals read again, repeated transport id does not',async()=>{const a=signal('one');const r=await run([{frames:[a]},{frames:[a]},{frames:[signal('two')]}]);expect(r.calls.filter(x=>x==='inbox_snapshot:COMMENT')).toHaveLength(3);expect(r.events.some(x=>x.commentMode==='PUSH')).toBe(true)});
 it('inbound DM persists directly, foreign recipient and own outgoing are excluded',async()=>{const r=await run([{frames:[dm(),dm('other'),dm(sender,sender)]}]);const pushed=r.ingested.filter(x=>x[4]==='PUSH');expect(pushed).toHaveLength(1);expect(pushed[0][3][0]).toMatchObject({id:'message',channel:'DM',body:'fictional incoming message'});expect(r.calls.filter(x=>x==='inbox_snapshot:DM')).toHaveLength(1)});
 it('socket reconnect or overflow reconciles both channels',async()=>{const r=await run([{socketConnected:false},{frames:[]},{overflow:true}]);expect(r.calls.filter(x=>x.startsWith('inbox_snapshot'))).toHaveLength(6);expect(r.events.some(x=>x.state==='RECONNECTING')).toBe(true)});
 it('unconfirmed process exit never frees execution lease',async()=>{const r=await run([],{stopOK:false});expect(r.release).not.toHaveBeenCalled();expect(r.events.at(-1)).toMatchObject({state:'ERROR'})});
 it('busy business yields without opening a native browser',async()=>{const r=await run([],{busy:true});expect(r.runtime.open).not.toHaveBeenCalled();expect(r.events.at(-1)).toMatchObject({state:'YIELDED'})});
});
