import {z} from 'zod';
import {modelOutputFailureCode,type ModelOutputFailureCode} from '@crm/contracts';
export class QwenError extends Error{constructor(public code:string,public httpStatus?:number){super(code);}}
export const qwenResultSchema=z.object({items:z.array(z.object({id:z.string().min(1).max(20),score:z.number().int().min(0).max(100),decision:z.enum(['MATCH','NO_MATCH','UNCERTAIN']),reason:z.string().min(1).max(1000).refine(value=>value.trim().length>0),context:z.enum(['SUFFICIENT','INSUFFICIENT']),evidence:z.array(z.object({source:z.enum(['COMMENT','POST_TITLE','POST_BODY','PARENT_COMMENT']),quote:z.string().min(1).max(500)}).strict()).min(1).max(8)}).strict()).min(1)}).strict();
export function parseQwenResult(raw:unknown){
 const parsed=qwenResultSchema.safeParse(raw);if(parsed.success)return parsed.data;
 const issue=parsed.error.issues[0],path=issue.path,index=path[0]==='items'&&typeof path[1]==='number'?path[1]+1:undefined;
 let code:ModelOutputFailureCode='OUTPUT_STRUCTURE_INVALID';
 if(path[0]==='items'&&path.length===1&&['too_small','too_big'].includes(issue.code))code='OUTPUT_COUNT_INVALID';
 else if(path[2]==='reason')code='OUTPUT_REASON_INVALID';
 else if(path[2]==='id')code='OUTPUT_ID_INVALID';
 else if(path[2]==='evidence')code=path[4]==='source'?'OUTPUT_EVIDENCE_SOURCE_INVALID':path[4]==='quote'?'OUTPUT_EVIDENCE_QUOTE_INVALID':'OUTPUT_EVIDENCE_INVALID';
 throw new QwenError(modelOutputFailureCode(code,index));
}
