import {z} from 'zod';
// Internal transport/storage contract. Never include checkpoints in public evidence,
// semantic input, logs, or the post/comment content hash.
// Keep in sync with Go chunkLedgerLimit/chunkWindowLimit. Hitting a resource
// boundary remains an explicit incomplete result, not a successful full read.
export const commentCollectionLimits=Object.freeze({commentsPerPost:10000,windowsPerPost:1024});
const id=z.string().regex(/^[A-Za-z0-9_-]{1,150}$/),hash=z.string().regex(/^[a-f0-9]{64}$/);
export const commentMarkSchema=z.object({id,parent:z.union([z.literal(''),id]),digest:hash}).strict();
export const commentCheckpointSchema=z.object({version:z.literal(1),sequence:z.number().int().min(0).max(100000),marks:z.array(commentMarkSchema).max(commentCollectionLimits.commentsPerPost)}).strict().superRefine((v,c)=>{const seen=new Set<string>();for(const m of v.marks){if(seen.has(m.id)||m.parent&&!seen.has(m.parent))c.addIssue({code:'custom',message:'Invalid checkpoint topology'});seen.add(m.id);}});
export type CommentCheckpoint=z.infer<typeof commentCheckpointSchema>;
export const commentChunkRequestSchema=z.discriminatedUnion('mode',[z.object({mode:z.literal('START'),checkpoint:commentCheckpointSchema.optional()}).strict(),z.object({mode:z.literal('RESUME'),token:hash,ack:hash}).strict(),z.object({mode:z.literal('FINISH'),token:hash,ack:hash}).strict()]);
export const commentChunkSchema=z.object({version:z.literal(1),rows:z.array(z.object({comment:z.unknown(),parent:z.union([z.literal(''),id])}).strict()).max(100),checkpoint:commentCheckpointSchema,hash,replaying:z.boolean(),remainingAnchors:z.number().int().min(0).max(commentCollectionLimits.commentsPerPost),canContinue:z.boolean(),token:hash}).strict();
export type CommentChunkReceipt={checkpoint:CommentCheckpoint;hash:string;replaying:boolean;remainingAnchors:number};
