import type {ReplyJournal} from './reply-stage-journal';
/** Display-only, including old journals. Never authorizes retry or clears UNKNOWN. */
export function replyPlatformDiagnostic(records:ReplyJournal['records']):string|null {
 const captures=records.filter(r=>r.stage==='RECEIPT_CAPTURE'&&r.receipt?.state==='RESPONSE_CAPTURED');
 if(captures.length!==1)return null;
 const r=captures[0].receipt!;
 if(!r.fields?.some(f=>f.path==='/success'&&f.type==='boolean'&&f.boolean===false))return null;
 const codes=r.fields.filter(f=>f.path==='/code'&&f.type==='number'&&typeof f.number==='number');
 const code=codes.length===1?codes[0].number:undefined;
 const hints={UNSPECIFIED:'具体原因未确认',RATE_LIMITED:'平台提示操作频繁',LOGIN_REQUIRED:'平台提示需要登录',VERIFICATION_REQUIRED:'平台提示需要验证',GENERIC_REJECTION:'平台提示发送未成功'};
 const hint=r.failure?hints[r.failure.messageClass]:hints.UNSPECIFIED;
 return `平台返回业务拒绝${code===undefined?'':`（${code}）`}，${hint}；发送结果仍未知，请勿重发`;
}
