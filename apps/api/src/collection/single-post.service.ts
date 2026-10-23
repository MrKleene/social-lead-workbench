import {BadRequestException,ConflictException,Inject,Injectable} from '@nestjs/common';
import {z} from 'zod';
import {safeImageDiagnostics} from '@crm/contracts';
import {Db} from '../common/db';
import {Actor,requireAdmin} from '../auth/security';
import {AccountLoginService} from '../accounts/account-login.service';
import {AccountReadService,readConsent,type ReadExecution} from './account-read.service';
import {accountReadMode} from './mcp/policy';
import {parsePostReference} from './post-reference';
import {lockSinglePost,assertNoSinglePost,singlePostAction} from './single-post-lock';
import {ReadFailure,type Post,type Comment} from './contract';
export const singlePostInput=z.object({accountId:z.string().min(1).max(100),url:z.string().max(8192),requestKey:z.string().uuid(),consent:z.literal('single-post-read-v1')}).strict();
export function singlePostSummary(post:Post,comments:Comment[]){
 const groups=(reply:boolean)=>{const selected=comments.filter(c=>!!c.parentId===reply),outcomes=new Map<string,number>();
  for(const c of selected)for(const o of safeImageDiagnostics(c.imageDiagnostics)?.authorAvatar?.outcomes||[])outcomes.set(o.reason,(outcomes.get(o.reason)||0)+o.count);
  return {count:selected.length,displayableAvatars:selected.filter(c=>!!c.authorAvatarUrl).length,outcomes:[...outcomes].map(([reason,count])=>({reason,count}))};};
 return {status:'CHECKED' as const,coverage:'WINDOW_ONLY' as const,roots:groups(false),replies:groups(true),imageDiagnostics:safeImageDiagnostics(post.imageDiagnostics)??null};
}
@Injectable()
export class SinglePostService {
 constructor(@Inject(Db) private db:Db,@Inject(AccountReadService) private reads:AccountReadService,@Inject(AccountLoginService) private login:AccountLoginService){}
 async check(actor:Actor,input:z.infer<typeof singlePostInput>){
  requireAdmin(actor);const parsed=singlePostInput.safeParse(input),ref=parsed.success?parsePostReference(parsed.data.url):undefined;
  if(!parsed.success||!ref)throw new BadRequestException('请提供含有效访问引用的小红书原文链接');
  const mode=accountReadMode();if(!mode)throw new BadRequestException('本机只读服务未启用');
  // Reserve BEFORE verification; no task, URL, ID or content is persisted. A consumed
  // request key is never replayed, even after process/network failure.
  const reservation=await this.db.$transaction(async tx=>{
   await lockSinglePost(tx);await assertNoSinglePost(tx);
   const user=await tx.user.findUnique({where:{id:actor.id}});if(!user?.active||user.role!=='ADMIN')throw new BadRequestException('管理员状态已变化');
   if(await tx.collectionRun.findFirst({where:{status:{in:['QUEUED','RUNNING']}}}))throw new ConflictException('已有采集任务，请等待结束');
   if(await tx.auditLog.findFirst({where:{entityId:input.requestKey,action:{startsWith:'SINGLE_POST_CHECK_'}}}))throw new ConflictException('此检查已提交，不会重复请求；结果不明时请先核查');
   return tx.auditLog.create({data:{actorId:actor.id,entityId:input.requestKey,action:singlePostAction,metadata:{version:1}}});
  });
  let execution:ReadExecution|undefined,owned:Awaited<ReturnType<AccountReadService['open']>>|undefined;
  let outcome='FAILED',summary:ReturnType<typeof singlePostSummary>|undefined;
  try{
   const session=await this.db.accountSessionReference.findUnique({where:{accountId:input.accountId}});
   if(!session||session.state!=='VERIFIED'||session.checkedRuntimeId!==process.env.CRM_RUNTIME_ID){
    const checked=await this.login.verifySaved(actor,input.accountId,'read-local-session-v1');
    if(checked.state!=='VERIFIED'){outcome='LOGIN_NOT_READY';return {status:'LOGIN_NOT_READY' as const};}
   }
   execution=await this.db.$transaction(tx=>this.reads.authorize(tx,actor,mode,input.accountId,readConsent));
   owned=await this.reads.open(execution);await owned.check();
   // open() already verified platform identity. Never search, retry or expand replies.
   const post=await owned.reader.postReference(ref,AbortSignal.timeout(45000));await owned.check();
   const result=singlePostSummary(post,owned.reader.receivedComments(post));outcome='CHECKED';summary=result;return result;
  }catch(error){
   const code=error instanceof ReadFailure?error.code:'CHECK_FAILED';
   if(execution)await this.reads.failure(execution,code);
   outcome=code;return {status:'FAILED' as const,reason:code};
  }finally{
   try{await owned?.close();}finally{await this.db.auditLog.update({where:{id:reservation.id},data:{action:'SINGLE_POST_CHECK_FINISHED',metadata:{version:1,outcome,...(summary?{summary:JSON.parse(JSON.stringify(summary))}:{})}}});}
  }
 }
}
