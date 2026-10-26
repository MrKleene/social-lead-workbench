import {Controller,Get,Put,Delete,Req,Res,Inject,Module,UseGuards,ForbiddenException,Catch,ExceptionFilter,ArgumentsHost,HttpException,UseFilters} from '@nestjs/common';
import type {Response} from 'express';
import {z} from 'zod';
import {AuthModule,SessionGuard,AuthedRequest} from '../auth/auth';
import {parse} from '../common/validation';
import {ModelSettingsService} from './model-settings.service';
const loopback=(x:string)=>x==='127.0.0.1'||x==='::1'||x==='::ffff:127.0.0.1'||x==='[::1]'||x==='localhost';
export function requireCredentialTransport(req:Pick<AuthedRequest,'secure'|'socket'|'headers'>){
 let origin:URL;try{origin=new URL(String(req.headers.origin));}catch{throw new ForbiddenException('凭据提交需要可信来源');}
 const forwarded=String(req.headers['x-forwarded-for']||'').split(',').map(x=>x.trim()).filter(Boolean);
 if(req.secure&&origin.protocol==='https:')return;
 if(origin.protocol==='http:'&&loopback(origin.hostname)&&loopback(req.socket.remoteAddress||'')&&forwarded.every(loopback))return;
 throw new ForbiddenException('拒绝远程HTTP凭据提交；请在本机loopback或直接HTTPS连接使用');
}
@Catch()
class CredentialErrorFilter implements ExceptionFilter {
 catch(error:unknown,host:ArgumentsHost){const ctx=host.switchToHttp(),req=ctx.getRequest<AuthedRequest>(),res=ctx.getResponse<Response>();if(req.body&&typeof req.body==='object')delete req.body.key;res.setHeader('Cache-Control','no-store');res.status(error instanceof HttpException?error.getStatus():500).json({message:error instanceof HttpException?error.message:'模型设置操作失败；未披露凭据，请刷新状态'});}
}
const input=z.object({version:z.number().int().nonnegative(),model:z.string().min(1).max(100),endpoint:z.literal('beijing-standard'),dailyLimit:z.number().int().min(1).max(100).nullable().optional(),confirmUnlimited:z.boolean().optional(),note:z.string().trim().max(200),key:z.string().min(16).max(512).optional(),priceVersion:z.string().max(60),confirmPricing:z.boolean().optional(),consent:z.boolean().optional()}).strict();
@Controller('model-settings')
@UseGuards(SessionGuard)
@UseFilters(CredentialErrorFilter)
class ModelSettingsController {
 constructor(@Inject(ModelSettingsService) private settings:ModelSettingsService){}
 @Get() status(@Req() r:AuthedRequest,@Res({passthrough:true}) res:Response){res.setHeader('Cache-Control','no-store');return this.settings.status(r.actor);}
 @Put() async save(@Req() r:AuthedRequest,@Res({passthrough:true}) res:Response){res.setHeader('Cache-Control','no-store');try{requireCredentialTransport(r);return await this.settings.save(r.actor,parse(input,r.body));}finally{if(r.body&&typeof r.body==='object')delete r.body.key;}}
 @Delete() remove(@Req() r:AuthedRequest,@Res({passthrough:true}) res:Response){res.setHeader('Cache-Control','no-store');requireCredentialTransport(r);const b=parse(z.object({version:z.number().int().nonnegative(),confirmation:z.literal('DELETE_MODEL_KEY')}).strict(),r.body);return this.settings.remove(r.actor,b.version,b.confirmation);}
}
@Module({imports:[AuthModule],controllers:[ModelSettingsController],providers:[ModelSettingsService],exports:[ModelSettingsService]})
export class ModelSettingsModule{}
