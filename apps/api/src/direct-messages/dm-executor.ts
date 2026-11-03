import {contactReporter} from '../common/journey-live';
import {Inject,Injectable} from '@nestjs/common';
import {DeviceService,type ExecutionPermit} from '../devices/device.service';
import {LoginRuntime,type SessionDriver} from '../accounts/login-runtime';
import {Db} from '../common/db';
import type {Actor} from '../auth/security';
import {toolPlan} from '../../../../runtime/platform.cjs';
import {DM_SEND_PROTOCOL,type DmCommand,type DmExecution} from './dm-send-protocol';
import {sendExactDm} from './dm-transport';
import {inspectExistingDm} from './dm-readback';
export type DmReadbackProof={observations:Awaited<ReturnType<typeof inspectExistingDm>>[];stopped:true};
// The first release remains unavailable to ordinary UI until the constrained real acceptance completes.
export const DM_REVIEWED_BUILD='4da06fa2ecbeef644674a26474a4d6a2cec558d2d275a061d0f0e43a160f1b56';
export const DM_PRODUCTION_ACCEPTED=true;
export interface DmExecutor {verify?(actor:Actor,c:DmCommand,sessionKey:string,signal:AbortSignal):Promise<DmReadbackProof>;available():boolean;run(actor:Actor,c:DmCommand,sessionKey:string,beforeDispatch:()=>Promise<boolean>,signal:AbortSignal):Promise<DmExecution>}
export const DM_EXECUTOR=Symbol('DM_EXECUTOR');
@Injectable()
export class LocalDmExecutor implements DmExecutor {
 constructor(@Inject(Db) private db:Db,@Inject(DeviceService) private devices:DeviceService,@Inject(LoginRuntime) private runtime:LoginRuntime){}
 available(){return process.platform==='darwin'&&this.devices.enabled()&&this.runtime.mode()==='real'&&this.runtime.persistent()&&toolPlan(process.env.HOME??'').hash===DM_REVIEWED_BUILD;}
 async verify(actor:Actor,c:DmCommand,sessionKey:string,signal:AbortSignal):Promise<DmReadbackProof>{
  if(!this.available())throw Error('DM_VERIFY_UNAVAILABLE');const permit=await this.devices.acquire(actor,c.accountId),observations: DmReadbackProof['observations']=[];let stopped=true;
  try{const combined=AbortSignal.any([signal,permit.signal,AbortSignal.timeout(90000)]);
   if(await this.runtime.inspect(c.accountId,sessionKey,this.runtime.deviceId(),'real',permit.root)!=='UNVERIFIED')throw Error('DM_SESSION_METADATA_MISMATCH');
   for(let i=0;i<2;i++){await this.db.$transaction(tx=>this.devices.assertPermit(tx,permit));const driver=await this.runtime.openSavedForDMConversationInspection(c.accountId,sessionKey,combined,permit.root,DM_REVIEWED_BUILD);stopped=false;
    try{if(!driver.replyEndpoint)throw Error('DM_VERIFY_ENDPOINT');observations.push(await inspectExistingDm(driver.replyEndpoint(),DM_REVIEWED_BUILD,c,combined));}
    finally{stopped=driver.replyEndpoint?await driver.replyEndpoint().stop().catch(()=>false):false;if(!stopped)throw Error('DM_VERIFY_STOP_UNCONFIRMED')}
   }
   if(observations.length!==2||observations[0].messageId!==observations[1].messageId||observations[0].inspectionId===observations[1].inspectionId)throw Error('DM_VERIFY_INCONSISTENT');
   return {observations,stopped:true};
  }finally{if(stopped)await permit.release()}
 }
 async run(actor:Actor,c:DmCommand,sessionKey:string,beforeDispatch:()=>Promise<boolean>,signal:AbortSignal):Promise<DmExecution>{
  let permit:ExecutionPermit|undefined,driver:SessionDriver|undefined,stopped=true,dispatched=false;
  const live=await contactReporter(this.db,c.requestKey);await live.set('PREPARING_SEND');
  let result:DmExecution={protocol:DM_SEND_PROTOCOL,attemptId:c.attemptId,requestKey:c.requestKey,kind:'NOT_SENT',reason:'RUNTIME_UNAVAILABLE',inputs:0,submissions:0,stopped:true};
  try{
   if(!this.available())return result;permit=await this.devices.acquire(actor,c.accountId);const combined=AbortSignal.any([signal,permit.signal,AbortSignal.timeout(70000)]);
   if(await this.runtime.inspect(c.accountId,sessionKey,this.runtime.deviceId(),'real',permit.root)!=='UNVERIFIED')throw Error('DM_SESSION_METADATA_MISMATCH');
   await this.db.$transaction(tx=>this.devices.assertPermit(tx,permit!));
   driver=await this.runtime.openSavedForDM(c.accountId,sessionKey,combined,permit.root,DM_REVIEWED_BUILD);stopped=false;if(!driver.replyEndpoint)throw Error('DM_ENDPOINT_MISSING');
   await live.set('PREPARING_SEND');result=await sendExactDm(driver.replyEndpoint(),DM_REVIEWED_BUILD,c,async()=>{await this.db.$transaction(tx=>this.devices.assertPermit(tx,permit!));if(dispatched||!await beforeDispatch())return false;dispatched=true;return true},combined,live);
  }catch{
   result={...result,kind:dispatched?'UNKNOWN':'NOT_SENT',reason:dispatched?'TRANSPORT_OUTCOME_UNKNOWN':'PRE_DISPATCH_STOPPED',submissions:dispatched?1:0};
  }finally{
   await live.close();
   if(driver?.replyEndpoint)stopped=await driver.replyEndpoint().stop().catch(()=>false);else if(driver){await driver.stop().catch(()=>{});stopped=false}
   if(permit&&stopped)await permit.release();result.stopped=stopped;if(!stopped){result.kind='UNKNOWN';result.reason='STOP_UNCONFIRMED'}
  }
  return result;
 }
}
