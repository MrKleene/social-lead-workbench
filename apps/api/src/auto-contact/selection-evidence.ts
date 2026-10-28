import {z} from 'zod';
/** Diagnostic hints only. These cannot authorize input, submit or confirmation. */
export const selectionEvidenceSchema=z.object({
 viewport:z.object({width:z.number().int().min(1).max(32768),height:z.number().int().min(1).max(32768),scrollX:z.number().int().min(0).max(100000000),scrollY:z.number().int().min(0).max(100000000)}).strict().optional(),
 frame:z.enum(['TOP','SUBFRAME']),target:z.enum(['MISSING','UNIQUE','AMBIGUOUS']),depth:z.enum(['ROOT','REPLY','UNKNOWN']),
 button:z.enum(['MISSING','EXACT','AMBIGUOUS']),centerHit:z.enum(['EXACT','COVERED','OFFSCREEN','UNAVAILABLE']),
 component:z.enum(['MATCH','MISMATCH','ABSENT']),handler:z.enum(['PRESENT','ABSENT']),
 bindingShape:z.enum(['PLAIN','VALUE_REF','RAW_VALUE_REF','UNSUPPORTED_REF','MISSING','INVALID']),binding:z.enum(['EMPTY','MATCH','MISMATCH','INVALID']),
 editor:z.enum(['ABSENT','AMBIGUOUS','EMPTY','DRAFT']),replyUI:z.enum(['ACTIVE','INACTIVE','AMBIGUOUS']),focused:z.boolean(),
}).strict();
