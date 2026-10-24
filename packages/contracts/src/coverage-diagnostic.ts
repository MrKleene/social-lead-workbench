import {z} from 'zod';
// An explicit whitelist. Arbitrary source keys/values must never enter diagnostics.
const state=z.enum(['MISSING','NULL','INVALID','EXACT']);
const count=z.object({state,value:z.number().int().min(0).max(10000000).nullable()}).strict().refine(v=>(v.state==='EXACT')===(v.value!==null));
const bool=z.object({state,value:z.boolean().nullable()}).strict().refine(v=>(v.state==='EXACT')===(v.value!==null));
const n=z.number().int().min(0).max(200);
const loaded=z.object({roots:n,replies:n,uniqueKnown:n,duplicateIds:n,missingIds:n,invalidNodes:n}).strict().refine(v=>v.roots+v.replies<=200&&v.uniqueKnown+v.duplicateIds+v.missingIds===v.roots+v.replies&&v.invalidNodes<=v.missingIds);
const group=z.object({ordinal:z.number().int().min(1).max(200),parent:z.number().int().min(1).max(199).nullable(),depth:z.number().int().min(0).max(8),declared:count,loaded:count}).strict();
const relationRoot='(?:targetComment|target_comment|targetCommentId|target_comment_id|targetUser|target_user|targetUserId|target_user_id|replyTo|reply_to|replyToComment|reply_to_comment|replyToCommentId|reply_to_comment_id|replyToUser|reply_to_user|replyToUserId|reply_to_user_id|parentCommentId|parent_comment_id|rootCommentId|root_comment_id)';
const relationPath=new RegExp('^'+relationRoot+'(?:\\.(?:id|commentId|comment_id|userId|user_id)|\\.(?:userInfo|user_info)\\.(?:userId|user_id|id))?$');
const relations=z.object({version:z.literal(1),scanned:n,limited:z.boolean(),fields:z.array(z.object({ordinal:z.number().int().min(1).max(200),path:z.string().max(80).regex(relationPath),shape:z.enum(['INVALID','NULL','STRING','EMPTY','OBJECT','ARRAY','NUMBER','BOOLEAN']),commentOrdinals:z.array(z.number().int().min(1).max(200)).max(200),userMatches:n}).strict()).max(256)}).strict();
export const coverageSampleSchema=z.object({
 relations:relations.optional(),
 status:z.enum(['OK','UNAVAILABLE','LIMIT','INVALID_JSON','FEED_MISSING']),
 ready:z.object({rootEndVisible:z.boolean().optional(),replyControls:z.number().int().min(0).max(200).optional(),rootScopeExact:z.boolean().optional(),document:z.enum(['UNKNOWN','loading','interactive','complete']),container:z.boolean(),emptyVisible:z.boolean().optional()}).strict(),
 total:count,hasMore:bool,cursor:z.enum(['MISSING','NULL','EMPTY','NONEMPTY','INVALID']),list:state,
 loaded:loaded.nullable(),groups:z.array(group).max(200),
 findings:z.array(z.enum(['INVALID_NODES','MISSING_IDS','DUPLICATE_IDS','DECLARED_GT_LOADED','DECLARED_LT_LOADED','TOTAL_LT_LOADED'])).max(6),
}).strict().superRefine((v,ctx)=>{
 const fail=()=>ctx.addIssue({code:z.ZodIssueCode.custom,message:'Invalid coverage counters'});
 if(v.relations&&(v.relations.scanned!==v.groups.length||v.relations.fields.some(f=>f.ordinal>v.groups.length||f.commentOrdinals.some(x=>x>v.groups.length)||f.userMatches>v.groups.length)))fail();
 if(v.loaded===null){if(v.groups.length)fail();return;}
 if(v.list!=='EXACT'||v.groups.length!==v.loaded.roots+v.loaded.replies)fail();
 if(v.groups.filter(g=>g.depth===0).length!==v.loaded.roots)fail();
 for(const [i,g] of v.groups.entries()){
  if(g.ordinal!==i+1||(g.depth===0)!==(g.parent===null))fail();
  if(g.parent!==null&&(g.parent>=g.ordinal||v.groups[g.parent-1]?.depth!==g.depth-1))fail();
 }
});
export const coverageDiagnosticSchema=z.object({
 version:z.literal(1),totalScope:z.literal('UNCONFIRMED'),returnedSample:z.literal(0),samples:z.array(coverageSampleSchema).min(1).max(3),
 observation:z.enum(['UNAVAILABLE','COUNTS_UNCHANGED','CHANGED']),elapsedMs:z.number().int().min(0).max(60000),rangeExpanded:z.literal(false),
}).strict().superRefine((v,ctx)=>{
 if(v.observation==='UNAVAILABLE')return;
 const valid=v.samples.length===3&&v.samples.every(s=>s.status==='OK'&&s.list==='EXACT'&&s.ready.document==='complete'&&s.ready.container);
 const unchanged=v.samples.every(s=>JSON.stringify(s)===JSON.stringify(v.samples[0]));
 if(!valid||(v.observation==='COUNTS_UNCHANGED')!==unchanged)ctx.addIssue({code:z.ZodIssueCode.custom,message:'Invalid observation'});
});
export type CoverageDiagnostic=z.infer<typeof coverageDiagnosticSchema>;
export function safeCoverageDiagnostic(value:unknown):CoverageDiagnostic|undefined{const parsed=coverageDiagnosticSchema.safeParse(value);return parsed.success?parsed.data:undefined;}
