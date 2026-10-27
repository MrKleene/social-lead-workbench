import {z} from 'zod';
export const postStates = ['UNKNOWN','NORMAL','UNAVAILABLE','CONFIRMED_DELETED'] as const;
export const postStateLabels:Record<string,string> = {UNKNOWN:'待检查',NORMAL:'正常',UNAVAILABLE:'不可访问',CONFIRMED_DELETED:'确认已删除'};
export const postReasonLabels:Record<string,string> = {NOT_CHECKED:'从未检查',EXACT_VISIBLE:'精确原帖可见',HTTP_404:'页面返回 404（不代表删除）',REDIRECT:'跳转到其他页面',LOGIN_REQUIRED:'登录失效或需要登录',RATE_LIMITED:'平台限流',RESTRICTED:'访问受限',NETWORK_ERROR:'网络异常',NO_RESULT:'未取得可靠结果',MANUAL_DELETED:'管理员明确标记已删除',PLATFORM_DELETED:'平台明确确认删除'};
export const availabilityInput = z.object({version:z.number().int().nonnegative(),reason:z.enum(['EXACT_VISIBLE','HTTP_404','REDIRECT','LOGIN_REQUIRED','RATE_LIMITED','RESTRICTED','NETWORK_ERROR','NO_RESULT','MANUAL_DELETED']),evidence:z.string().trim().min(8).max(1000).refine(s=>!/(xsec_token|cookie|authorization|password|access_token)\s*[:=]/i.test(s),'请勿保存令牌或凭据'),confirmDeleted:z.boolean().default(false)}).strict().refine(s=>s.reason!=='MANUAL_DELETED'||s.confirmDeleted,'需要明确确认删除及来源证据');
export type PostAvailabilityView={state:string;reason:string;version:number;checkedAt:string|null;source:string|null;evidence?:unknown;invalidatedAt?:string|null};
export const unknownPostAvailability:PostAvailabilityView={state:'UNKNOWN',reason:'NOT_CHECKED',version:0,checkedAt:null,source:null};
