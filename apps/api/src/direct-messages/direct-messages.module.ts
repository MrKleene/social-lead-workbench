import {Controller,Get,Header,Inject,Module,Post,Query,Req,UseGuards} from '@nestjs/common';
import {z} from 'zod';
import {AuthModule,SessionGuard,type AuthedRequest} from '../auth/auth';
import {parse} from '../common/validation';
import {DmPreparationService} from './dm-preparation';
@Controller('direct-messages')
@UseGuards(SessionGuard)
export class DirectMessagesController {
 constructor(@Inject(DmPreparationService) private readonly preparation:DmPreparationService){}
 @Get('capability') @Header('Cache-Control','no-store, private')
 capability(@Req() req:AuthedRequest,@Query() query:unknown){const {platform}=parse(z.object({platform:z.enum(['XHS','DOUYIN'])}).strict(),query);return this.preparation.capability(req.actor,platform);}
 @Post('preview') @Header('Cache-Control','no-store, private')
 preview(@Req() req:AuthedRequest){return this.preparation.preview(req.actor,req.body);}
 // No send/confirm endpoint until a real, reviewed private-message provider exists.
}
@Module({imports:[AuthModule],controllers:[DirectMessagesController],providers:[DmPreparationService]})
export class DirectMessagesModule{}
