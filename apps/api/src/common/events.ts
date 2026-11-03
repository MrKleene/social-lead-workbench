import {Controller,Inject,Module,Req,Sse,UseGuards,MessageEvent,OnModuleDestroy} from '@nestjs/common';
import {Observable,ReplaySubject} from 'rxjs';
import {AuthModule,AuthedRequest,SessionGuard} from '../auth/auth';
import {Db} from './db';
import {JourneyPushHub} from './journey-push';
export function eventSessionValid(s:any,now=Date.now()){return !!s&&new Date(s.expiresAt).getTime()>now&&s.user.active&&(!s.refreshGrantId||s.refreshGrant&&!s.refreshGrant.revokedAt&&new Date(s.refreshGrant.expiresAt).getTime()>now);}
@Controller('events')
@UseGuards(SessionGuard)
export class EventsController implements OnModuleDestroy {
 private readonly stopping=new ReplaySubject<void>(1);
 onModuleDestroy(){this.stopping.next();this.stopping.complete();}
 constructor(@Inject(Db) private db:Db,@Inject(JourneyPushHub) private hub:JourneyPushHub){}
 @Sse() stream(@Req() req:AuthedRequest):Observable<MessageEvent>{
  return new Observable(sub=>{
   let closed=false,ticks=0;let serial=Promise.resolve();let queued=0;
   const emit=(type:string,data:object,id?:string,adminOnly=false)=>{
    if(closed)return;if(queued>100){type='sync';data={available:this.hub.available};id=undefined;adminOnly=true;if(queued>101)return;}queued++;
    serial=serial.then(async()=>{queued--;if(closed)return;try{
     const s=await this.db.session.findUnique({where:{id:req.sessionId},include:{user:{select:{active:true,role:true}},refreshGrant:true}});
     if(!eventSessionValid(s)){sub.complete();return;}if(adminOnly&&s!.user.role!=='ADMIN')return;
     if((type==='ready'||type==='heartbeat')&&typeof data==='object'&&data)data={available:this.hub.available&&s!.user.role==='ADMIN'};
     if(!closed)sub.next({type,data,id});
    }catch{sub.error(new Error('EVENT_STREAM_UNAVAILABLE'));}});
   };
   // Subscribe before snapshot invalidation: a commit during initial load cannot be lost.
   const changes=this.hub.signals.subscribe(signal=>{if(signal.type==='connection')emit('ready',{available:signal.available},undefined,true);else emit('journey',signal.data,signal.data.id,true);});
   emit('ready',{available:this.hub.available});
   const timer=setInterval(()=>{ticks++;emit('heartbeat',{available:this.hub.available});if(ticks%4===0)emit('sync',{available:this.hub.available},undefined,true);if(ticks%2===0)emit('refresh',{});},15000);
   const stop=this.stopping.subscribe(()=>sub.complete());
   return()=>{closed=true;clearInterval(timer);changes.unsubscribe();stop.unsubscribe();};
  });
 }
}
@Module({imports:[AuthModule],controllers:[EventsController],providers:[JourneyPushHub]})
export class EventsModule{}
