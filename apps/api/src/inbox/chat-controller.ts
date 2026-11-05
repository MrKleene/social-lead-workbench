import {Controller,Get,Post,Param,Req,Query,Inject,UseGuards,Header} from '@nestjs/common';
import {SessionGuard,type AuthedRequest} from '../auth/auth';
import {requireAdmin} from '../auth/security';
import {ChatStore} from './chat-store';
import {ChatReply} from './chat-reply';
@Controller('inbox/chat') @UseGuards(SessionGuard)
export class ChatController {
 constructor(@Inject(ChatStore)private store:ChatStore,@Inject(ChatReply)private reply:ChatReply){}
 @Get('capability') @Header('Cache-Control','no-store, private') capability(@Req()r:AuthedRequest){requireAdmin(r.actor);return this.reply.capability()}
 @Get('conversations') @Header('Cache-Control','no-store, private') list(@Req()r:AuthedRequest,@Query()q:unknown){return this.store.list(r.actor,q)}
 @Get('messages') @Header('Cache-Control','no-store, private') thread(@Req()r:AuthedRequest,@Query()q:unknown){return this.store.thread(r.actor,q)}
 @Post('prepare') prepare(@Req()r:AuthedRequest){return this.reply.prepare(r.actor,r.body)}
 @Post('confirm') confirm(@Req()r:AuthedRequest){return this.reply.confirm(r.actor,r.body)}
 @Get('requests/:id') @Header('Cache-Control','no-store, private') status(@Req()r:AuthedRequest,@Param('id')id:string){return this.reply.status(r.actor,id)}
}
