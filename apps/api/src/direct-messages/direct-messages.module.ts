import {Controller,Get,Header,Inject,Module,Post,Query,Req,UseGuards,Param,ServiceUnavailableException} from '@nestjs/common';
import {z} from 'zod';
import {AuthModule,SessionGuard,type AuthedRequest} from '../auth/auth';
import {parse} from '../common/validation';
import {DmPreparationService} from './dm-preparation';
import {requireAdmin} from '../auth/security';
import {DevicesModule} from '../devices/devices';
import {LoginRuntime} from '../accounts/login-runtime';
import {DmSendService} from './dm-send.service';
import {DM_EXECUTOR,LocalDmExecutor,DM_PRODUCTION_ACCEPTED} from './dm-executor';
@Controller('direct-messages')
@UseGuards(SessionGuard)
export class DirectMessagesController {
 constructor(@Inject(DmPreparationService) private readonly preparation:DmPreparationService,@Inject(DmSendService) private readonly sender:DmSendService){}
 @Get('capability') @Header('Cache-Control','no-store, private')
 capability(@Req() req:AuthedRequest,@Query() query:unknown){const {platform}=parse(z.object({platform:z.enum(['XHS','DOUYIN'])}).strict(),query);return this.preparation.capability(req.actor,platform);}
 @Post('preview') @Header('Cache-Control','no-store, private')
 preview(@Req() req:AuthedRequest){return this.preparation.preview(req.actor,req.body);}
 @Post('prepare-send') @Header('Cache-Control','no-store, private')
 prepareSend(@Req() req:AuthedRequest){requireAdmin(req.actor);if(!DM_PRODUCTION_ACCEPTED)throw new ServiceUnavailableException('私信发送正在验收，尚未开放');return this.sender.prepare(req.actor,req.body);}
 @Post('confirm-send') @Header('Cache-Control','no-store, private')
 confirmSend(@Req() req:AuthedRequest){requireAdmin(req.actor);if(!DM_PRODUCTION_ACCEPTED)throw new ServiceUnavailableException('私信发送正在验收，尚未开放');return this.sender.confirm(req.actor,req.body);}
 @Post('attempts/:id/verify') @Header('Cache-Control','no-store, private')
 verifyAttempt(@Req() req:AuthedRequest,@Param('id') id:string){return this.sender.verifyAttempt(req.actor,id);}
 @Post('requests/:id/verify') @Header('Cache-Control','no-store, private')
 verify(@Req() req:AuthedRequest,@Param('id') id:string){return this.sender.verify(req.actor,id);}
 @Get('requests/:id') @Header('Cache-Control','no-store, private')
 status(@Req() req:AuthedRequest,@Param('id') id:string){return this.sender.status(req.actor,id);}
}
@Module({imports:[AuthModule,DevicesModule],controllers:[DirectMessagesController],providers:[DmPreparationService,DmSendService,LoginRuntime,{provide:DM_EXECUTOR,useClass:LocalDmExecutor}],exports:[DM_EXECUTOR]})
export class DirectMessagesModule{}
