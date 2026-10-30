import type {Prisma} from '@prisma/client';
/** Legacy status is retained for history/simulation, never a real participation toggle.
 * Initial login holds meant "no automatic send authorization", not a bad session. */
const loginOnlyReasons = new Set(['登录已验证；真实采集与发送仍禁用','登录已验证；只读采集须逐次确认，发送禁用','等待本人授权']);
type AccountSafety = {status:string;pauseReason?:string|null;platform?:string;loginPlatformUserId?:string|null};
export function accountSystemBlock(a:AccountSafety):string|null {
 // Compatibility hold from the user's historical restriction report. This is NOT
 // a fresh platform observation, and login/metadata changes cannot clear it.
 if(a.platform==='XHS'&&a.loginPlatformUserId==='6334380e000000001802cc73')return '历史平台限制报告，待复核';
 if(a.status==='RESTRICTED')return a.pauseReason||'账号存在限制，待核查';
 if(a.status==='PAUSED'&&!loginOnlyReasons.has(a.pauseReason||''))return a.pauseReason||'历史暂停原因不明，待核查';
 return null;
}
export function accountModeBlocked(a:AccountSafety,mode:string){return mode==='SIMULATION'?a.status!=='UNCONNECTED':!!accountSystemBlock(a);}

/** Old transport versions could leave the initial login reason on a risk pause.
 * Retain their append-only restriction evidence independently of that legacy field. */
export async function recordedAccountBlocks(tx:Pick<Prisma.TransactionClient,'auditLog'>,ids:string[]){
 if(!ids.length)return new Set<string>();
 const rows=await tx.auditLog.findMany({where:{entityId:{in:ids},action:'ACCOUNT_SEND_OBSERVATION',metadata:{path:['state'],not:'UNKNOWN'}},select:{entityId:true}});
 return new Set(rows.map(r=>r.entityId));
}
