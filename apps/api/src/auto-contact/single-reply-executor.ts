import type { DeviceService, ExecutionPermit } from '../devices/device.service';
import type { LoginRuntime, SessionDriver } from '../accounts/login-runtime';
import type { Db } from '../common/db';
import { toolPlan } from '../../../../runtime/platform.cjs';
import { XhsExactReplyTransport } from './xhs-reply-transport';
import { singleReplyCandidateSha, type SingleReplyContext, type SingleReplyExecutor, type SingleReplyResult } from './single-reply-test';
export class LocalSingleReplyExecutor implements SingleReplyExecutor {
 constructor(private db:Db,private devices:DeviceService,private runtime:LoginRuntime){}
 capable(){return process.platform==='darwin'&&this.devices.enabled()&&this.runtime.persistent()&&this.runtime.mode()==='real'&&toolPlan(process.env.HOME??'').hash===singleReplyCandidateSha;}
 async run(c:SingleReplyContext,beforeSubmit:()=>Promise<boolean>,signal:AbortSignal):Promise<SingleReplyResult>{
  let permit:ExecutionPermit|undefined,driver:SessionDriver|undefined,transport:XhsExactReplyTransport|undefined,identityVerified=false,stopped=true,protocolCalls=0;
  let result:SingleReplyResult['result']={kind:'FAILED',reason:'单次提交前核验未通过'};
  try{
   if(!this.capable())throw Error('UNAVAILABLE');
   permit=await this.devices.acquire(c.actor,c.request.accountId);
   const combined=AbortSignal.any([signal,permit.signal,AbortSignal.timeout(70000)]);
   if(await this.runtime.inspect(c.request.accountId,c.sessionKey,this.runtime.deviceId(),'real',permit.root)!=='UNVERIFIED')throw Error('SESSION_METADATA_MISMATCH');
   driver=await this.runtime.openSavedForReply(c.request.accountId,c.sessionKey,combined,permit.root,singleReplyCandidateSha);stopped=false;
   if(!driver.replyEndpoint)throw Error('ENDPOINT_MISSING');
   transport=new XhsExactReplyTransport(driver.replyEndpoint(),{enabled:true,reviewedSha256:singleReplyCandidateSha});
   // Read-only platform login check in this owned candidate process before any write.
   const login=await driver.status(combined);if(!login.loggedIn||login.userId!==c.scope.senderId)throw Error('LIVE_ACCOUNT_MISMATCH');identityVerified=true;
   if(!await transport.connect(combined)){result=transport.connectionFailure();}
   else{
    await this.db.$transaction(tx=>this.devices.assertPermit(tx,permit!));
    if(!combined.aborted&&await beforeSubmit()){
     protocolCalls=1;result=await transport.send(c.request,c.binding,combined);
    }
   }
  }catch(error){if(protocolCalls)result={kind:'UNKNOWN',reason:'单次调用结果不确定，不重试'};if(error instanceof Error&&error.message==='RATE_LIMITED')result={kind:'RISK',reason:'RATE_LIMITED'};if(error instanceof Error&&error.message==='RESTRICTED')result={kind:'RISK',reason:'PLATFORM_REFUSED'};}
  finally{
   if(transport)stopped=await transport.stop();
   else if(driver?.replyEndpoint)stopped=await driver.replyEndpoint().stop().catch(()=>false);
   else if(driver){await driver.stop().catch(()=>{});stopped=false;}
   if(permit&&stopped)await permit.release();
  }
  if(!stopped&&result.kind!=='RISK')result={kind:'BLOCKED',reason:'STOP_UNCONFIRMED'};
  return {result,protocolCalls,identityVerified,stopped,submission:protocolCalls===0||result.kind==='FAILED'?'NOT_ATTEMPTED':'AT_MOST_ONCE_UNKNOWN'};
 }
}
