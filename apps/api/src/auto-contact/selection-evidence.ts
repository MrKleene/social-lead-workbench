import {z} from 'zod';
/** Diagnostic hints only. These cannot authorize input, submit or confirmation. */
export const selectionEvidenceSchema=z.object({
 frame:z.enum(['TOP','SUBFRAME']),target:z.enum(['MISSING','UNIQUE','AMBIGUOUS']),depth:z.enum(['ROOT','REPLY','UNKNOWN']),
 button:z.enum(['MISSING','EXACT','AMBIGUOUS']),centerHit:z.enum(['EXACT','COVERED','OFFSCREEN','UNAVAILABLE']),
 component:z.enum(['MATCH','MISMATCH','ABSENT']),handler:z.enum(['PRESENT','ABSENT']),
 bindingShape:z.enum(['PLAIN','VALUE_REF','RAW_VALUE_REF','UNSUPPORTED_REF','MISSING','INVALID']),binding:z.enum(['EMPTY','MATCH','MISMATCH','INVALID']),
 editor:z.enum(['ABSENT','AMBIGUOUS','EMPTY','DRAFT']),replyUI:z.enum(['ACTIVE','INACTIVE','AMBIGUOUS']),focused:z.boolean(),
}).strict();
