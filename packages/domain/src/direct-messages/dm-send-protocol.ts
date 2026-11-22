import {createHash} from 'node:crypto';
import {z} from 'zod';
export const DM_SEND_PROTOCOL='workbench.xhs.exact-dm.v1';
export const dmDigest=(s:string)=>createHash('sha256').update(s).digest('hex');
const pid=z.string().regex(/^[a-f0-9]{24}$/),opaque=z.string().regex(/^[A-Za-z0-9:_-]{1,200}$/),hash=z.string().regex(/^[a-f0-9]{64}$/);
export const dmCommandSchema=z.object({protocol:z.literal(DM_SEND_PROTOCOL),attemptId:z.string().uuid(),requestKey:opaque,accountId:opaque,senderId:pid,recipientId:pid,content:z.string().min(1).max(1000).refine(s=>s.trim()===s&&!/[\r\n\0]/.test(s)),contentSha256:hash,replyTo:z.object({messageId:z.string().min(10).max(100),contentSha256:hash}).strict().optional(),maxSubmissions:z.literal(1),expiresAt:z.string().datetime()}).strict().refine(c=>c.senderId!==c.recipientId&&dmDigest(c.content)===c.contentSha256&&(!c.replyTo||validDmMessageId(c.replyTo.messageId,c.recipientId,c.senderId)));
export type DmCommand=z.infer<typeof dmCommandSchema>;
export const validDmMessageId=(value:string,sender:string,recipient:string)=>/^[0-9]{10,30}$/.test(value)||((value.startsWith(sender+'.'+recipient+'.')||value.startsWith(recipient+'.'+sender+'.'))&&/^[a-f0-9]{12,32}$/.test(value.slice(sender.length+recipient.length+2)));
const receipt=z.object({messageId:z.string().min(10).max(100),senderId:pid,recipientId:pid,contentSha256:hash,observedAt:z.string().datetime()}).strict();
const result=z.object({protocol:z.literal(DM_SEND_PROTOCOL),attemptId:z.string().uuid(),requestKey:opaque,kind:z.enum(['NOT_SENT','UNKNOWN','CONFIRMED']),reason:z.string().regex(/^[A-Z_]{1,80}$/),inputs:z.number().int().min(0).max(1),submissions:z.number().int().min(0).max(1),stopped:z.boolean(),receipt:receipt.optional(),readback:receipt.optional()}).strict();
export type DmExecution=z.infer<typeof result>;
export function parseDmExecution(raw:unknown,c:DmCommand):DmExecution{
 const r=result.parse(raw);if(r.attemptId!==c.attemptId||r.requestKey!==c.requestKey)throw Error('DM_RESULT_SCOPE_MISMATCH');
 if(r.kind==='NOT_SENT'&&r.submissions!==0)throw Error('DM_FALSE_NOT_SENT');
 if(r.kind==='CONFIRMED'){
  if(!r.stopped||r.submissions!==1||r.inputs!==1||r.reason!=='SERVER_ID_AND_FRESH_PAGE_READBACK'||!r.receipt||!r.readback||r.receipt.messageId!==r.readback.messageId)throw Error('DM_RECEIPT_UNVERIFIED');
  for(const p of [r.receipt,r.readback])if(!validDmMessageId(p.messageId,c.senderId,c.recipientId)||p.senderId!==c.senderId||p.recipientId!==c.recipientId||p.contentSha256!==c.contentSha256)throw Error('DM_RECEIPT_BINDING_MISMATCH');
 }
 return r;
}
