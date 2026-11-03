import {Controller,Get,Post,Param,Req,Inject,Module,UseGuards,Header} from '@nestjs/common';
import {AuthModule,SessionGuard,type AuthedRequest} from '../auth/auth';
import {HistoryArchiveService} from './history-archive.service';
@Controller('history-archives') @UseGuards(SessionGuard)
export class HistoryArchiveController {
 constructor(@Inject(HistoryArchiveService) private service:HistoryArchiveService){}
 @Get() @Header('Cache-Control','no-store, private') list(@Req() r:AuthedRequest){return this.service.list(r.actor);}
 @Post() archive(@Req() r:AuthedRequest){return this.service.archive(r.actor,r.body);}
 @Post(':id/restore') restore(@Req() r:AuthedRequest,@Param('id') id:string){return this.service.restore(r.actor,id,r.body);}
}
@Module({imports:[AuthModule],controllers:[HistoryArchiveController],providers:[HistoryArchiveService]})
export class HistoryArchiveModule {}
