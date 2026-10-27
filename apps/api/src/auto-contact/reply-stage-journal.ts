import {restrictionResultSchema} from './xhs-restriction-transport';
import {diagnosticSchema} from './xhs-reply-protocol';
import {open} from 'node:fs/promises';
import {constants} from 'node:fs';
import {join} from 'node:path';
import {z} from 'zod';

export const replyJournalProtocol='workbench.reply-stage-journal.v1' as const;
export const journalRecordSchema=z.object({sequence:z.number().int().min(1).max(64),attemptId:z.string().uuid(),stage:z.enum(['NAVIGATION_INTENT','NAVIGATED','TARGET_LOCATED','SELECT_INTENT','REPLY_SELECTED','INPUT_INTENT','INPUT_FINISHED','CANCELLED','RESTRICTION_CHECK','BEFORE_CLOSE','STARTED','INSPECTED','SELECTED','RECHECKED','BEFORE_SUBMIT','ATTEMPTED','AFTER_SUBMIT','SUBMIT_FINISHED','READBACK','DRIVER_CLOSED']),at:z.string().datetime(),attempted:z.boolean().optional(),stopped:z.boolean().optional(),evidence:restrictionResultSchema.shape.observation.pick({identity:true,title:true,pathname:true,warnings:true}).extend({screenshotState:z.literal('NOT_CAPTURED')}).strict().optional()}).strict();
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
