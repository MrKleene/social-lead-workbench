import type {Prisma} from '@prisma/client';
import {accountSendObservation} from './send-observation';
import {accountSystemBlock,recordedAccountBlocks} from '../accounts/account-execution-policy';
/** DM does not borrow comment permission. Saved identity is only an application precheck;
 * exact recipient/platform restrictions are checked by the native DM driver before input and submit. */
export async function channelSendObservation(tx:Prisma.TransactionClient,id:string,now:Date,channel:string){
 if(channel!=='DM')return accountSendObservation(tx,id,now);
 const a=await tx.platformAccount.findUnique({where:{id},include:{sessionReference:true}}),blocked=!!a&&(!!accountSystemBlock(a)||(await recordedAccountBlocks(tx,[id])).has(id));
 const ready=!!a&&!a.isDemo&&!a.archivedAt&&a.platform==='XHS'&&!blocked&&!!a.loginPlatformUserId&&!!a.loginSessionKey&&a.sessionReference?.sessionKey===a.loginSessionKey&&a.sessionReference.provider==='real'&&a.sessionReference.state==='VERIFIED';
 return {state:blocked?'RESTRICTED':'UNKNOWN',evidenceInvalid:false,canSend:ready,checkedAt:null,stale:false,source:null,evidence:null,automaticSendReady:ready,qualificationBasis:'EXACT_DM_PRE_SUBMIT' as const,reason:blocked?'账号存在限制，不能发送私信':ready?'执行时核对收件人与平台私信限制':'登录身份需核实'};
}
