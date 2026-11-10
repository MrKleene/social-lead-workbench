import {selectionEvidenceSchema} from '@crm/domain/auto-contact/selection-evidence';
import {restrictionResultSchema} from './xhs-restriction-transport';
import {diagnosticSchema} from '@crm/domain/auto-contact/xhs-reply-protocol';
import {open} from 'node:fs/promises';
import {constants} from 'node:fs';
import {join} from 'node:path';
import {z} from 'zod';

export const replyJournalProtocol='workbench.reply-stage-journal.v1' as const;
const receiptEvidenceSchema=z.object({
 state:z.enum(['ARMED','REQUEST_MATCHED','RESPONSE_CAPTURED','MAPPING_UNREVIEWED','MAPPING_REVIEWED','REQUEST_NOT_OBSERVED','AMBIGUOUS_REQUEST','RESPONSE_UNAVAILABLE','UNREVIEWED_READBACK']),
 endpointHost:z.enum(['edith.xiaohongshu.com','www.xiaohongshu.com']).optional(),endpointPath:z.string().regex(/^\/api(\/(sns|web|comment|reply|post|publish|add|create|send|v[0-9]{1,2})){1,8}$/).optional(),
 endpointSha256:z.string().regex(/^[a-f0-9]{64}$/).optional(),requestSha256:z.string().regex(/^[a-f0-9]{64}$/).optional(),responseSha256:z.string().regex(/^[a-f0-9]{64}$/).optional(),
 failure:z.object({category:z.literal('BUSINESS_REJECTION'),code:z.number().int().min(-1000000).max(1000000).optional(),messageClass:z.enum(['UNSPECIFIED','RATE_LIMITED','LOGIN_REQUIRED','VERIFICATION_REQUIRED','GENERIC_REJECTION'])}).strict().optional(),
 status:z.number().int().min(100).max(599).optional(),
 fields:z.array(z.object({path:z.string().max(600).regex(/^(\/(data|result|success|code|id|comment_id|commentId|note_id|noteId|target_comment_id|targetCommentId|parent_comment_id|parentCommentId|user_id|userId|content|comment|comments|user_info|userInfo|target_comment|targetComment|status|message|msg|reply_id|replyId|opaque_[a-f0-9]{12}|[0-9]+))*$/),type:z.enum(['string','number','boolean','null']),binding:z.enum(['POST','TARGET','RECIPIENT','SENDER','CONTENT']).optional(),publicId:z.string().regex(/^[a-f0-9]{24}$/).optional(),boolean:z.boolean().optional(),number:z.number().int().min(-1000000).max(1000000).optional()}).strict()).max(128).optional(),
 readback:z.enum(['NO_NEW_MATCH','ONE_NEW_MATCH','AMBIGUOUS']).optional(),
}).strict();
export const journalRecordSchema=z.object({sequence:z.number().int().min(1).max(64),attemptId:z.string().uuid(),stage:z.enum(['SELECTION_SCROLLED','SELECT_CLICK_INTENT','SELECT_EVENT_UNAVAILABLE','SELECT_EVENT_EXACT','SELECT_EVENT_NONE','SELECT_EVENT_OTHER','SELECT_EVENT_MULTIPLE','SELECTION_BEFORE','SELECTION_AFTER','SELECTION_STOPPED','SELECT_POINT_VERIFIED','INITIAL_BINDING_WAIT','INITIAL_BINDING_MATCHED','INITIAL_BINDING_EMPTY_TIMEOUT','RECEIPT_CAPTURE','NAVIGATION_INTENT','NAVIGATED','TARGET_LOCATED','SELECT_INTENT','REPLY_SELECTED','INPUT_INTENT','INPUT_FINISHED','CANCELLED','RESTRICTION_CHECK','BEFORE_CLOSE','STARTED','INSPECTED','SELECTED','RECHECKED','BEFORE_SUBMIT','ATTEMPTED','AFTER_SUBMIT','SUBMIT_FINISHED','READBACK','DRIVER_CLOSED']),at:z.string().datetime(),attempted:z.boolean().optional(),stopped:z.boolean().optional(),selection:selectionEvidenceSchema.optional(),receipt:receiptEvidenceSchema.optional(),evidence:restrictionResultSchema.shape.observation.pick({identity:true,title:true,pathname:true,warnings:true}).extend({screenshotState:z.literal('NOT_CAPTURED')}).strict().optional()}).strict();
export type ReplyJournal={state:'AVAILABLE'|'MISSING'|'INVALID'|'TRUNCATED';records:z.infer<typeof journalRecordSchema>[]};
/** Only an owned endpoint supplies the private directory, never the command.
 * Read after owned-stop. A torn final line is marked truncated, never inferred safe.
 * No evidence here authorizes a retry or changes UNKNOWN/lock/quota. */
export async function readReplyJournal(directory:string,attemptId:string):Promise<ReplyJournal>{
 if(!z.string().uuid().safeParse(attemptId).success)return {state:'INVALID',records:[]};
 let file:Awaited<ReturnType<typeof open>>|undefined;
 try{
  file=await open(join(directory,`reply-stage-${attemptId}.jsonl`),constants.O_RDONLY|constants.O_NOFOLLOW);
  const stat=await file.stat();
  if(!stat.isFile()||stat.nlink!==1||stat.mode&0o077||stat.uid!==process.getuid?.()||stat.size>131072)return {state:'INVALID',records:[]};
  const bytes=Buffer.alloc(131073),{bytesRead}=await file.read(bytes,0,bytes.length,0);if(bytesRead>131072)return {state:'INVALID',records:[]};
  const text=bytes.subarray(0,bytesRead).toString('utf8'),lines=text.split('\n'),complete=text.endsWith('\n');lines.pop();
  const records:ReplyJournal['records']=[];
  for(const line of lines){const parsed=journalRecordSchema.safeParse(JSON.parse(line));if(!parsed.success||parsed.data.attemptId!==attemptId||parsed.data.sequence!==records.length+1)return {state:'INVALID',records:[]};records.push(parsed.data);}
  return {state:complete&&records.length?'AVAILABLE':'TRUNCATED',records};
 }catch(error){return {state:(error as NodeJS.ErrnoException).code==='ENOENT'?'MISSING':'INVALID',records:[]};}
 finally{await file?.close();}
}
export const executionEventSchema=z.discriminatedUnion('stage',[
 z.object({stage:z.literal('RPC_INTENT'),protocolAttemptId:z.string().uuid()}).strict(),
 z.object({stage:z.literal('RPC_RETURNED'),protocolAttemptId:z.string().uuid(),kind:z.enum(['UNKNOWN','ACCEPTED','NOT_SENT','RISK','CONFIRMED','INVALID']),diagnostic:diagnosticSchema.pick({stage:true,code:true}).optional(),envelopeValid:z.boolean()}).strict(),
 z.object({stage:z.literal('RPC_ERROR'),protocolAttemptId:z.string().uuid(),code:z.enum(['TIMEOUT_OR_CANCELLED','RATE_LIMITED','PLATFORM_REFUSED','TRANSPORT_ERROR'])}).strict(),
 z.object({stage:z.literal('TRANSPORT_STOP'),processDiagnostics:z.object({categories:z.array(z.enum(['PANIC','TIMEOUT','BROWSER_DISCONNECTED','OTHER'])).max(4),truncated:z.boolean()}).strict().optional(),protocolAttemptId:z.string().uuid(),stopped:z.boolean(),journal:z.object({state:z.enum(['AVAILABLE','MISSING','INVALID','TRUNCATED']),records:z.array(journalRecordSchema).max(64)}).strict()}).strict(),
]);
export type ExecutionEvent=z.infer<typeof executionEventSchema>;
export type ExecutionRecorder=(event:ExecutionEvent)=>Promise<void>;
