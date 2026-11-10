import type {SemanticOutbound} from '@crm/contracts';
import {qwenModel} from '../../../../runtime/qwen-models.cjs';
export const WHOLE_POST_TIMEOUT=300000;
export const WHOLE_POST_LEASE=360000;
export const WHOLE_POST_STALE=420000;
export const WHOLE_POST_RESPONSE_BYTES=2*1024*1024;
export const wholePostCapacityMessage='整帖超出当前模型的单次输入或完整结果容量（按保守估算检查），未截断评论、未拆分或调用模型。需调整单次容量方案后重新预览；不会自动切换模型。';
/** UTF-8 byte count is a conservative token estimate, not the provider tokenizer.
 * Reserve JSON/protocol overhead, and a compact result for EVERY item: reason <=120
 * characters and one exact COMMENT quote <=120 characters. Six escaped bytes per
 * character plus 240 bytes for JSON/id/enums bounds the requested output envelope.
 * No fixed comment-count cap and no splitting. Unused max_tokens is not usage.
 */
export function wholePostCapacity(payload:SemanticOutbound,modelId:string){
 const model=qwenModel(modelId),inputTokensUpper=Buffer.byteLength(JSON.stringify(payload))+8192;
 const outputTokens=256+payload.items.reduce((sum,item)=>sum+240+6*120+Math.min(6*120,Buffer.byteLength(JSON.stringify(item.comment))),0);
 const fits=!!model&&inputTokensUpper<=model.maxInputTokens&&outputTokens<=model.maxOutputTokens&&inputTokensUpper+outputTokens<=model.contextTokens;
 return {fits,inputTokensUpper,outputTokens,timeoutMs:WHOLE_POST_TIMEOUT};
}
