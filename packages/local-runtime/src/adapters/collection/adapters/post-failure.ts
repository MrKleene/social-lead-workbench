import type {CollectionDiagnostic} from '@crm/contracts';
import {ReadFailure} from '@crm/domain/collection/contract';
/** Match only wrappers/error constants present in the reviewed MCP source.
 * Inspect the payload in memory; never preserve its text or a URL fragment. */
export function postFailure(text:string):ReadFailure|undefined{
 // Preserve the existing login/rate-limit/restriction stop behavior even inside a page-error wrapper.
 if(text.startsWith('获取Feed详情失败: 笔记不可访问: ')&&/未登录|登录失效|login|频繁|限流|rate.?limit|限制|封禁|验证码|restricted/i.test(text))return undefined;
 const body=text.startsWith('获取Feed详情失败: ')?text.slice('获取Feed详情失败: '.length):text;
 let postReason:NonNullable<CollectionDiagnostic['postReason']>|undefined;
 let code:ReadFailure['code']='INVALID_DATA';
 if(text.startsWith('获取Feed详情失败: 笔记不可访问: ')&&body.length>'笔记不可访问: '.length){postReason='PAGE_UNAVAILABLE';code='SOURCE_UNAVAILABLE';}
 else if(text.startsWith('获取Feed详情成功，但序列化失败: '))postReason='RESPONSE_SERIALIZATION_FAILED';
 else switch(body){
  case 'INVALID_CHECKPOINT':postReason='CHECKPOINT_REJECTED';break;
  case 'INVALID_READ_WINDOW':case 'INVALID_CONTINUATION':postReason='REQUEST_REJECTED';break;
  case 'CONTINUATION_BUSY':postReason='READ_SESSION_BUSY';code='DEVICE_UNAVAILABLE';break;
  case 'CONTINUATION_EXPIRED':case 'CONTINUATION_LIMIT':postReason='READ_SESSION_EXPIRED';code='MCP_SESSION_EXPIRED';break;
  case 'CONTINUATION_MISMATCH':postReason='READ_SESSION_MISMATCH';code='MCP_SESSION_EXPIRED';break;
  case 'CONTINUATION_UNAVAILABLE':postReason='READ_SESSION_UNAVAILABLE';code='MCP_PROTOCOL';break;
  case 'context deadline exceeded':postReason='TIMEOUT';code='TIMEOUT';break;
  case 'context canceled':case 'CANCELLED':postReason='CANCELLED';code='PAUSED';break;
 }
 return postReason?new ReadFailure(code,undefined,{version:1,stage:'post',kind:'UPSTREAM_ERROR',postReason}):undefined;
}
