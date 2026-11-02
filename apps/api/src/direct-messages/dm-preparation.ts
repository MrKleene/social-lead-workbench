import {BadRequestException, ConflictException, Injectable, Inject, NotFoundException} from '@nestjs/common';
import {Prisma} from '@prisma/client';
import {captureDisplay, previewReply, replyDraft} from '@crm/contracts';
import {z} from 'zod';
import {Db} from '../common/db';
import {parse} from '../common/validation';
import {requireAdmin, type Actor} from '../auth/security';
import {accountReadBlock, accountSystemBlock, recordedAccountBlocks} from '../accounts/account-execution-policy';
import {contactTarget, eligibilityHash, quotaBucket} from '../auto-contact/contact-policy';
import {semanticHash} from '../collection/capture-archive';

const id=z.string().min(1).max(200);
export const dmPreviewInput=z.object({accountId:id,accountVersion:z.number().int().nonnegative(),reviewId:id,reviewVersion:z.number().int().nonnegative(),templateId:id,templateVersion:z.number().int().nonnegative()}).strict();
/** Deployment facts only. No request/env switch or comment permission enables DM. */
export function dmCapability(platform:'XHS'|'DOUYIN'){
 return {platform,channel:'DM' as const,previewAvailable:true,sendingAvailable:false as const,conversationLookup:false,inbox:false,readReceipts:false,reason:platform==='XHS'?'私信发送通道尚未接通':'抖音私信尚未接通'};
}
const object=(value:Prisma.JsonValue|null)=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,Prisma.JsonValue>:{};
const text=(value:Prisma.JsonValue|undefined)=>typeof value==='string'?value:undefined;

@Injectable()
export class DmPreparationService {
 constructor(@Inject(Db) private readonly db:Db){}
 capability(actor:Actor,platform:'XHS'|'DOUYIN'){requireAdmin(actor);return dmCapability(platform);}
 /** Read-only local preparation. Does not reserve quota, create a job/grant, call a
  * platform, or use the comment sender. A fingerprint is NOT a send credential. */
 async preview(actor:Actor,raw:unknown){
  requireAdmin(actor);const input=parse(dmPreviewInput,raw);
  return this.db.$transaction(async tx=>{
   const [user,account,review,template]=await Promise.all([
    tx.user.findUnique({where:{id:actor.id},select:{active:true,role:true}}),
    tx.platformAccount.findUnique({where:{id:input.accountId},include:{sessionReference:true}}),
    tx.semanticReview.findUnique({where:{id:input.reviewId},include:{capture:{include:{post:true,config:{select:{platform:true}}}}}}),
    tx.replyTemplate.findUnique({where:{id:input.templateId}}),
   ]);
   if(!user?.active||user.role!=='ADMIN')throw new ConflictException('管理员权限已变化');
   if(!account||account.archivedAt||!review||!template)throw new NotFoundException('账号、原评论或模板不存在');
   if(account.version!==input.accountVersion||review.version!==input.reviewVersion||template.version!==input.templateVersion)throw new ConflictException('账号、评论或模板已变化，请重新预览');
   if(template.channel!=='DM')throw new BadRequestException('请选择私信模板');
   if(!replyDraft.safeParse({name:template.name,channel:template.channel,body:template.body}).success)throw new BadRequestException('模板格式无效');
   if(account.isDemo||review.isDemo||account.platform!==review.platform||review.capture?.config.platform!==review.platform)throw new BadRequestException('预览账号与来源平台或数据范围不一致');
   const target=contactTarget(review,review.capture,review.capture?.post??null);
   if(!target)throw new ConflictException('原评论作者或来源关联不完整，不能准备私信');
   const snapshot=object(review.snapshot),display=captureDisplay(snapshot),now=new Date(),day=quotaBucket('REAL',now);
   // Fields are sourced from this exact saved comment, not the user's most recent
   // other comment. No inferred profession or edited client recipient is accepted.
   const rendered=previewReply(template.body,{昵称:display.authorNickname||undefined,帖子标题:text(snapshot.title),平台:review.platform==='XHS'?'小红书':'抖音'});
   const [identity,usage,control,riskAccounts]=await Promise.all([
    tx.platformIdentity.findUnique({where:{platform_platformUserId:{platform:review.platform,platformUserId:target.recipientId}},include:{lead:true}}),
    tx.accountDay.findUnique({where:{accountId_day:{accountId:account.id,day}}}),
    tx.autoContactControl.findUnique({where:{platform_mode:{platform:account.platform,mode:'REAL'}}}),
    recordedAccountBlocks(tx,[account.id]),
   ]);
   const ledger=identity?await tx.contactLedger.findUnique({where:{identityId_mode:{identityId:identity.id,mode:'REAL'}},include:{attempts:{select:{outcome:true}}}}):null;
   const capability=dmCapability(review.platform),issues:{code:string;message:string}[]=[];
   const add=(code:string,message:string)=>issues.push({code,message});
   if(identity?.lead?.doNotContact)add('DO_NOT_CONTACT','该用户已标记勿联系');
   if(identity?.lead&&(identity.lead.contactedAt||['CONTACTED','INTERESTED'].includes(identity.lead.contactStage)))add('ALREADY_CONTACTED','该用户已有联系记录');
   const attempts=ledger?.attempts.filter(a=>a.outcome!=='CANCELLED')??[];
   if(attempts.some(a=>a.outcome==='UNKNOWN'))add('UNKNOWN_LOCK','该用户存在未知发送结果，不可再次发送或换渠道补发');
   else if(attempts.length)add('RECIPIENT_LOCK','该用户已有发送尝试或占用，不可重复联系');
   if(review.reviewStatus==='REJECTED')add('EXCLUDED','该评论已人工排除');
   const block=accountReadBlock(account);
   if(block)add('ACCOUNT_RESTRICTION',block);
   else if(accountSystemBlock(account)||riskAccounts.has(account.id))add('RESTRICTION_SCOPE_UNVERIFIED','存在历史回复限制记录，尚未确认其私信适用范围');
   if(control?.pauseReason)add('PLATFORM_PAUSED','平台发送处于风险暂停状态');
   const session=account.sessionReference;
   if(!account.loginPlatformUserId||!account.loginSessionKey||session?.sessionKey!==account.loginSessionKey||session?.provider!=='real'||session?.state!=='VERIFIED')add('LOGIN_UNVERIFIED','账号登录或身份尚未核实');
   if(account.loginPlatformUserId===target.recipientId)add('SELF_RECIPIENT','不能向当前发送账号自己发送');
   const remaining=Math.max(0,account.dailyLimit-(usage?.occupied??0));
   if(!remaining)add('QUOTA_EXHAUSTED','账号今日共享额度已用尽');
   if(rendered.missing.length||rendered.unknown.length)add('TEMPLATE_FIELDS_MISSING','模板存在未获取或未知字段');
   add('DM_UNAVAILABLE',capability.reason);
   add('CONVERSATION_UNVERIFIED','尚未通过私信通道确认收件人会话和发送资格');
   return {channel:'DM' as const,mode:'PREVIEW_ONLY' as const,sent:false as const,canSend:false as const,authorizationCreated:false as const,
    capability,account:{id:account.id,version:account.version,label:account.loginNickname||account.label},
    source:{reviewId:review.id,reviewVersion:review.version,reviewState:review.state,reviewStatus:review.reviewStatus,score:review.score,runId:review.runId,platform:review.platform,...target,authorNickname:display.authorNickname,postTitle:text(snapshot.title)||null,comment:text(snapshot.comment)||null},
    template:{id:template.id,version:template.version,name:template.name},content:rendered.text,missingFields:rendered.missing,unknownFields:rendered.unknown,
    quota:{day,timezone:'Asia/Shanghai',accountDailyLimit:account.dailyLimit,occupied:usage?.occupied??0,remaining,reservedByPreview:0},
    conversation:null,issues,checkedAt:now.toISOString(),
    fingerprint:semanticHash({channel:'DM',accountId:account.id,accountVersion:account.version,reviewHash:eligibilityHash(review),templateId:template.id,templateVersion:template.version,recipient:target,content:rendered.text,day}),
   };
  },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});
 }
}
