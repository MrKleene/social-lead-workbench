import { createHash } from 'node:crypto';
import { modelOutputFailureCode, semanticInputPolicy, type SemanticOutbound, type SemanticOutput } from '@crm/contracts';
import type { SemanticInput } from './semantic-evaluator';
import { parseQwenResult, QwenError } from './qwen-result';
export const REDACTION_VERSION='contact-redaction-v1';
const marker='[已脱敏]';
export function redactText(text:string,identifiers:string[]=[]){
 let result=text.normalize('NFKC').replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g,'');
 for(const id of identifiers.filter(x=>x.length>=3).sort((a,b)=>b.length-a.length))result=result.split(id).join(marker);
 result=result.replace(/(?:https?:\/\/|www\.)[^\s，。！？；）】]+/gi,marker)
 .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,marker)
 .replace(/(?:[a-z0-9-]+\.)+(?:com|cn|net|org|io|me|app|co|xyz|top|edu|gov)(?:[^\s，。！？；]*)/gi,marker)
 .replace(/[@＠][^\s，。！？；:：]+/g,marker)
 .replace(/(?:微信|微\s*信|薇信|威信|联系方式|手机号|电话|QQ|扣扣|邮箱|昵称|用户名|姓名|地址|住址|我是|我叫|加我|联系我|[vV][xX信])[：:\s]*[^\n。！？；]*/g,marker)
 .replace(/(?:[+＋]?\d[\s()（）.·_\-]*){5,}/g,marker)
 .replace(/[零〇一二三四五六七八九十幺壹贰叁肆伍陆柒捌玖]{5,}/g,marker)
 .replace(/[A-Za-z0-9][A-Za-z0-9_./:+@#%?=&~\-]*/g,marker);
 return result;
}
export function prepareOutbound(inputs:SemanticInput[],wholePost=false):SemanticOutbound{
 if(!inputs.length)return {inputPolicyVersion:semanticInputPolicy,redactionVersion:REDACTION_VERSION,target:'',items:[]};
 const ids=inputs.flatMap(x=>[x.snapshot.userId,x.snapshot.postId,x.snapshot.commentId,x.snapshot.parentId||'']);
 const target=redactText(inputs[0].rules.target,ids).slice(0,1500);
 if(target.replaceAll(marker,'').trim().length<10)throw new QwenError('DATA_BLOCKED');
 const items=inputs.map(({snapshot:s},i)=>{
  const raw=[s.title,s.body,s.parent||''].map(t=>redactText(t,ids));const caps=[300,1200,800];
  const truncated=raw.some((t,k)=>t.length>caps[k]);const [title,body,parent]=raw.map((t,k)=>t.slice(0,caps[k]));
  // Fail closed on residual contact cues rather than claim a regex guarantees anonymity.
  if([target,...raw].some(t=>/(?:二维码|扫.{0,2}码|私.{0,2}聊|[a-z0-9@＠]|联系.{0,2}方式|微信|微.{0,2}信|扣扣)/i.test(t)))throw new QwenError('DATA_BLOCKED');
  // Comment body is deliberately byte-preserving; only surrounding context is redacted.
  const comment=s.comment;if(!comment.trim())throw new QwenError('DATA_BLOCKED');
  return {id:'item'+(i+1),title,body,comment,parent:s.parent===null?null:parent,missingParent:!!s.parentId&&s.parent===null,partial:s.coverage==='PARTIAL',truncated};
 });const payload={inputPolicyVersion:semanticInputPolicy,redactionVersion:REDACTION_VERSION,target,items};
 // Never truncate an original comment to fit a request. Oversized single items fail before confirmation.
 if(!wholePost&&items.some(item=>Buffer.byteLength(JSON.stringify({...payload,items:[item]}))>48000))throw new QwenError('PAYLOAD_LIMIT');
 return payload;
}
export function previewHash(payload:SemanticOutbound,rows:{id:string;version:number}[],revision:number,modelSelection?:string){return createHash('sha256').update(JSON.stringify({payload,rows,revision,modelSelection})).digest('hex');}
export function validateQwenEvidence(raw:unknown,payload:SemanticOutbound,inputs:SemanticInput[],contextOptional=false):SemanticOutput[]{
 const {items}=parseQwenResult(raw);
 if(items.length!==inputs.length||payload.items.length!==inputs.length)throw new QwenError('OUTPUT_COUNT_INVALID');
 const seen=new Set<string>();
 items.forEach((row,i)=>{
  if(seen.has(row.id))throw new QwenError(modelOutputFailureCode('OUTPUT_ID_DUPLICATE',i+1));
  seen.add(row.id);
  if(!payload.items.some(s=>s.id===row.id))throw new QwenError(modelOutputFailureCode('OUTPUT_ID_UNKNOWN',i+1));
 });
 return inputs.map((input,i)=>{
  const s=payload.items[i],position=items.findIndex(x=>x.id===s.id),row=items[position];
  if(!row)throw new QwenError('OUTPUT_ID_MISSING');
  const fail=(code:Parameters<typeof modelOutputFailureCode>[0])=>{throw new QwenError(modelOutputFailureCode(code,position+1));};
  const texts={COMMENT:s.comment,POST_TITLE:s.title,POST_BODY:s.body,PARENT_COMMENT:s.parent||''};
  if(!row.evidence.some(e=>e.source==='COMMENT'))fail('OUTPUT_COMMENT_EVIDENCE_MISSING');
  for(const evidence of row.evidence){
   if(evidence.quote.includes(marker)&&!(payload.inputPolicyVersion===semanticInputPolicy&&evidence.source==='COMMENT'))fail('OUTPUT_CONTEXT_REDACTION_MARKER');
   if(!texts[evidence.source].includes(evidence.quote))fail('OUTPUT_EVIDENCE_NOT_EXACT');
  }
  // Reasons are bounded plain text, not a second redaction input. Never execute model text.
  const context=!contextOptional&&(s.missingParent||s.truncated||!s.title&&!s.body)?'INSUFFICIENT':row.context;
  return {...row,id:input.id,context,decision:context==='INSUFFICIENT'?'UNCERTAIN':row.decision};
 });
}

export function outboundBatches(payload:SemanticOutbound){
 const batches:SemanticOutbound['items'][]=[];let batch:SemanticOutbound['items']=[];
 for(const item of payload.items){const next=[...batch,item];if(batch.length&&(next.length>5||Buffer.byteLength(JSON.stringify({...payload,items:next}))>48000)){batches.push(batch);batch=[];}batch.push(item);}
 if(batch.length)batches.push(batch);return batches;
}
