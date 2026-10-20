import { Controller, Get, Post, Patch, Req, Param, Inject, Module, UseGuards, Header } from '@nestjs/common';
import { z } from 'zod';
import { AuthModule, AuthedRequest, SessionGuard } from '../auth/auth';
import { parse } from '../common/validation';
import { requireAdmin } from '../auth/security';
import { LocalDeviceRuntime } from './device-runtime';
import { DeviceService } from './device.service';
@Controller('devices') @UseGuards(SessionGuard)
class DevicesController {
  constructor(@Inject(DeviceService)private devices:DeviceService){}
  @Get() @Header('Cache-Control','no-store, private') status(@Req() r:AuthedRequest){return this.devices.status(r.actor);}
  @Post('bind') bind(@Req() r:AuthedRequest){requireAdmin(r.actor);const b=parse(z.object({candidateId:z.string().uuid(),consent:z.literal('bind-local-device-v1')}).strict(),r.body);return this.devices.bind(r.actor,b);}
  @Post('approve') approve(@Req() r:AuthedRequest){const b=parse(z.object({candidateId:z.string().uuid(),name:z.string().trim().min(1).max(80),credentialRoot:z.string().min(1).max(1000),consent:z.literal('approve-local-device-v1')}).strict(),r.body);return this.devices.approve(r.actor,b);}
  @Patch(':id/directory') directory(@Req() r:AuthedRequest,@Param('id') id:string){const b=parse(z.object({version:z.number().int().nonnegative(),path:z.string().min(1).max(1000)}).strict(),r.body);return this.devices.changeDirectory(r.actor,id,b.version,b.path);}
  @Post(':id/revoke') revoke(@Req() r:AuthedRequest,@Param('id') id:string){const b=parse(z.object({version:z.number().int().nonnegative(),consent:z.literal('revoke-local-device-v1')}).strict(),r.body);return this.devices.revoke(r.actor,id,b.version);}
}
@Module({imports:[AuthModule],controllers:[DevicesController],providers:[LocalDeviceRuntime,DeviceService],exports:[DeviceService,LocalDeviceRuntime]})
export class DevicesModule {}
