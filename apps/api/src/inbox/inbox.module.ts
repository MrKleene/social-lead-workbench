import {ChatController} from './chat-controller';
import {ChatStore} from './chat-store';
import {ChatReply} from './chat-reply';
import {DirectMessagesModule} from '../direct-messages/direct-messages.module';
import {Controller,Get,Header,Inject,Module,Param,Post,Query,Req,Sse,UseGuards,MessageEvent,OnModuleDestroy} from '@nestjs/common';
import {Observable} from 'rxjs';
import {AuthModule,SessionGuard,type AuthedRequest} from '../auth/auth';
import {requireAdmin} from '../auth/security';
import {eventSessionValid} from '../common/events';
import {DevicesModule} from '../devices/devices';
import {LoginRuntime} from '../accounts/login-runtime';
import {InboxStore} from './inbox-store';
import {InboxService} from './inbox-service';
import {INBOX_RUNTIME,LocalInboxRuntime} from './inbox-runtime';
@Controller('inbox') @UseGuards(SessionGuard)
export class InboxController implements OnModuleDestroy{
 private connections=new Set<()=>void>();
 onModuleDestroy(){for(const close of this.connections)close();this.connections.clear()}
 constructor(@Inject(InboxStore)private store:InboxStore,@Inject(InboxService)private receiver:InboxService){}
 @Get('accounts') @Header('Cache-Control','no-store, private') accounts(@Req()r:AuthedRequest){return this.store.accounts(r.actor)}
 @Get('receivers') @Header('Cache-Control','no-store, private') receivers(@Req()r:AuthedRequest){return this.store.receivers(r.actor)}
 @Get('messages') @Header('Cache-Control','no-store, private') messages(@Req()r:AuthedRequest,@Query()q:unknown){return this.store.list(r.actor,q)}
 @Get('unread') @Header('Cache-Control','no-store, private') unread(@Req()r:AuthedRequest){return this.store.unread(r.actor)}
 @Post('start') start(@Req()r:AuthedRequest){return this.receiver.start(r.actor,r.body)}
 @Post(':accountId/stop') stop(@Req()r:AuthedRequest,@Param('accountId')id:string){return this.receiver.stop(r.actor,id)}
 @Post('messages/:id/read') read(@Req()r:AuthedRequest,@Param('id')id:string){return this.store.markRead(r.actor,id)}
 @Sse('events') events(@Req()r:AuthedRequest):Observable<MessageEvent>{requireAdmin(r.actor);return new Observable(sub=>{
  const close=()=>sub.complete();this.connections.add(close);
  let busy=false,again=false,closed=false;const emit=async()=>{if(closed)return;if(busy){again=true;return}busy=true;try{const s=await this.store.db.session.findUnique({where:{id:r.sessionId},include:{user:{select:{active:true,role:true}},refreshGrant:true}});if(!eventSessionValid(s)||s?.user.role!=='ADMIN'){sub.complete();return}if(!closed)sub.next({type:'inbox',data:{at:new Date().toISOString()}})}catch{sub.error(new Error('INBOX_STREAM_UNAVAILABLE'))}finally{busy=false;if(again){again=false;void emit()}}};
  const change=this.store.changed.subscribe(()=>void emit());const timer=setInterval(()=>void emit(),15000);void emit();return()=>{this.connections.delete(close);closed=true;clearInterval(timer);change.unsubscribe()};
 })}
}
@Module({imports:[AuthModule,DevicesModule,DirectMessagesModule],controllers:[InboxController,ChatController],providers:[ChatStore,ChatReply,InboxStore,InboxService,LoginRuntime,{provide:INBOX_RUNTIME,useClass:LocalInboxRuntime}],exports:[InboxStore]})
export class InboxModule{}
