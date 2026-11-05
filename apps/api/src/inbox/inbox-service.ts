import {BadRequestException,ConflictException,Inject,Injectable,OnModuleDestroy} from '@nestjs/common';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {z} from 'zod';
import {type Actor,requireAdmin} from '../auth/security';
import {DeviceService} from '../devices/device.service';
import {LoginRuntime} from '../accounts/login-runtime';
import {InboxStore,type InboxItem} from './inbox-store';
import {INBOX_RUNTIME,type InboxRuntime,type InboxWire} from './inbox-runtime';
import {decodeFrame} from './protocol';
const busySql=`SELECT EXISTS(SELECT 1 FROM "CollectionRun" WHERE status IN ('QUEUED','RUNNING')) OR EXISTS(SELECT 1 FROM "AutoReviewJob" WHERE status IN ('PENDING','PROCESSING')) OR EXISTS(SELECT 1 FROM "SemanticModelCall" WHERE status='RESERVED') OR EXISTS(SELECT 1 FROM "ContactAttempt" WHERE outcome IN ('RESERVED','ATTEMPTED')) OR EXISTS(SELECT 1 FROM "AutoContactJob" WHERE status IN ('QUEUED','MANUAL_READY','WAITING_QUOTA','WAITING_ACCOUNT','RESERVED','ATTEMPTED')) AS busy`;
@Injectable()
export class InboxService implements OnModuleDestroy{
 private sessions=new Map<string,{abort:AbortController;done:Promise<void>}>();
 constructor(@Inject(InboxStore)readonly store:InboxStore,@Inject(DeviceService)private devices:DeviceService,@Inject(LoginRuntime)private login:LoginRuntime,@Inject(INBOX_RUNTIME)private runtime:InboxRuntime){}
 async busy(){return(await this.store.db.$queryRawUnsafe<{busy:boolean}[]>(busySql))[0].busy}
 async start(actor:Actor,raw:unknown){requireAdmin(actor);const q=z.object({accountId:z.string().min(1).max(100),consent:z.literal('receive-inbox-may-mark-read-v1')}).strict().safeParse(raw);if(!q.success)throw new BadRequestException('请选择接收账号并确认读取范围');const accountId=q.data.accountId;
  if(this.sessions.size)throw new ConflictException('已有接收窗口，请先停止');if(await this.busy())throw new ConflictException('当前有执行任务，请结束后再开始接收');
  const account=await this.store.db.platformAccount.findUnique({where:{id:accountId},include:{sessionReference:true}});
  if(!account||account.platform!=='XHS'||account.isDemo||account.archivedAt||!account.loginPlatformUserId||!account.loginSessionKey||account.sessionReference?.state!=='VERIFIED'||account.sessionReference.sessionKey!==account.loginSessionKey)throw new ConflictException('账号尚无可用的内置浏览器登录会话');
  const prior=await this.store.get(accountId);if(prior&&!['STOPPED','ERROR','EXPIRED','YIELDED'].includes(prior.state)&&Date.now()-prior.updatedAt.getTime()<45000)throw new ConflictException('该账号已有接收窗口');
  const generation=randomUUID(),abort=new AbortController();await this.store.create(actor,accountId,generation);
  const done=this.run(actor,accountId,account.loginPlatformUserId,account.loginSessionKey,generation,abort).catch(()=>{}).finally(()=>this.sessions.delete(accountId));this.sessions.set(accountId,{abort,done});return{accountId,generation};
 }
 async stop(actor:Actor,accountId:string){requireAdmin(actor);await this.store.db.$executeRaw`UPDATE "InboxReceiver" SET "stopRequested"=true WHERE "accountId"=${accountId}`;this.sessions.get(accountId)?.abort.abort();this.store.changed.next();return{ok:true}}
 private async run(actor:Actor,id:string,sender:string,key:string,generation:string,abort:AbortController){
  const end=Date.now()+15*60000;let final='STOPPED',reason:string|null=null,retries=0;
  try{while(!abort.signal.aborted&&Date.now()<end){
   if(await this.busy()){final='YIELDED';break}
   const permit=await this.devices.acquire(actor,id,{purpose:'INBOX'});let wire:InboxWire|undefined,stopped=true,monitor:NodeJS.Timeout|undefined,checking=false;
   try{
    const signal=AbortSignal.any([abort.signal,permit.signal]);if(await this.login.inspect(id,key,this.login.deviceId(),'real',permit.root)!=='UNVERIFIED')throw Error('SESSION_METADATA');
    await this.store.status(id,generation,{state:'CONNECTING',leaseToken:permit.token});
    monitor=setInterval(()=>{if(checking)return;checking=true;void(async()=>{const row=await this.store.get(id);if(!row||row.generation!==generation||row.stopRequested||await this.busy()){if(row?.state==='YIELDING'||!row?.stopRequested)final='YIELDED';abort.abort()}else await this.store.db.$executeRaw`UPDATE "InboxReceiver" SET "updatedAt"=now() WHERE "accountId"=${id} AND "generation"=${generation}`})().catch(()=>abort.abort()).finally(()=>checking=false)},2000);monitor.unref();
    wire=await this.runtime.open(join(permit.root,id,key),sender,signal);stopped=false;const openedAt=Date.now();const ready=await wire.call('inbox_start');if(ready.identity!=='MATCH'||ready.submissions!==0)throw Error('IDENTITY');
    await this.store.status(id,generation,{state:'SYNCING',leaseToken:permit.token});
    const sync=async(channel:'COMMENT'|'DM')=>{try{const snapshot=await wire!.call('inbox_snapshot',channel);if(snapshot.identity!=='MATCH'||snapshot.submissions!==0||!Array.isArray(snapshot.items))throw Error('IDENTITY');await this.store.ingest(id,generation,sender,snapshot.items,'RECONCILIATION');await this.store.status(id,generation,{coverage:channel==='DM'?'PARTIAL_DM_HISTORY':snapshot.complete?'COMMENT_COMPLETE':'PARTIAL_COMMENTS',leaseToken:permit.token});}catch(error){if(signal.aborted)throw Error('STOPPED');if(error instanceof Error&&error.message==='IDENTITY')throw error;await this.store.status(id,generation,{coverage:'INCOMPLETE',reason:'部分历史尚未完整读取',leaseToken:permit.token})}};
    await sync('COMMENT');await sync('DM');await this.store.status(id,generation,{state:'LISTENING',reason:'评论与私信推送等待实际事件验证',leaseToken:permit.token});
    const rotate=openedAt+185000;let connected=true;const seen=new Set<string>();
    while(!signal.aborted&&Date.now()<rotate&&Date.now()<end){
     const batch=await wire.call('inbox_drain');if(batch.identity!=='MATCH'||batch.submissions!==0||batch.stopped)throw Error('RECEIVER_STOPPED');if(!Array.isArray(batch.frames)||batch.frames.length>200)throw Error('FRAME_BOUND');
     if(!batch.socketConnected){connected=false;await this.store.status(id,generation,{state:'RECONNECTING',reason:'平台连接中断，等待重连',leaseToken:permit.token});continue}
     let comments=false,dm=false;
     for(const raw of batch.frames){const f=decodeFrame(raw);if(f.id&&seen.has(f.id))continue;if(f.id){seen.add(f.id);if(seen.size>1000)seen.delete(seen.values().next().value!)}
      for(const e of f.events){if(e.kind==='comment-signal'){comments=true;await this.store.status(id,generation,{commentMode:'PUSH',leaseToken:permit.token})}else if(e.kind==='dm-signal')dm=true;else if(e.kind==='dm'&&!e.group&&e.receiver===sender&&e.sender!==sender){await this.store.ingest(id,generation,sender,[{id:e.id,sender:e.sender,nickname:e.nickname,body:e.body,published:e.published,channel:'DM',type:e.contentType===1?'TEXT':'UNSUPPORTED'}],'PUSH');await this.store.status(id,generation,{dmMode:'PUSH',leaseToken:permit.token})}else if(e.kind==='malformed')await this.store.status(id,generation,{reason:'有消息格式暂不支持',coverage:'INCOMPLETE',leaseToken:permit.token})}
     }
     if(!connected||batch.overflow){comments=true;dm=true}if(comments)await sync('COMMENT');if(dm)await sync('DM');connected=true;await this.store.status(id,generation,{state:'LISTENING',leaseToken:permit.token});
    }
    retries=0;
   }catch{if(!abort.signal.aborted){if(++retries>=3){final='ERROR';reason='接收中断，请检查账号或稍后重试';break}await this.store.status(id,generation,{state:'RECONNECTING',reason:'接收中断，正在重新连接',leaseToken:permit.token})}}
   finally{clearInterval(monitor);if(wire)stopped=await wire.stop().catch(()=>false);if(stopped)await permit.release();else{final='ERROR';reason='内置浏览器退出未确认，请勿重启接收';abort.abort()}}
   if(!abort.signal.aborted&&Date.now()<end)await new Promise(r=>setTimeout(r,retries?Math.min(30000,1000*2**retries):500));
  }}catch{final='ERROR';reason='无法启动内置接收，请检查设备和登录会话'}finally{if(Date.now()>=end)final='EXPIRED';await this.store.status(id,generation,{state:final,reason,leaseToken:null})}
 }
 async onModuleDestroy(){for(const s of this.sessions.values())s.abort.abort();await Promise.allSettled([...this.sessions.values()].map(s=>s.done))}
}
