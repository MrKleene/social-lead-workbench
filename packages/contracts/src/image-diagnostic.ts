import {z} from 'zod';
export const imageReasons=['NOT_RETURNED','EMPTY','UNSUPPORTED_FORMAT','URL_FORMAT','PROTOCOL','HOST','URL_COMPONENTS','PATH','ACCEPTED'] as const;
export type ImageReason=typeof imageReasons[number];
const count=z.number().int().min(0).max(12);
export const imageDiagnosticSchema=z.object({version:z.literal(1),truncated:z.boolean(),shape:z.enum(['NOT_RETURNED','EMPTY','UNSUPPORTED','SUPPORTED']),fieldCount:count,outcomes:z.array(z.object({reason:z.enum(imageReasons),count:count}).strict()).max(9)}).strict().refine(v=>new Set(v.outcomes.map(x=>x.reason)).size===v.outcomes.length&&v.outcomes.reduce((n,x)=>n+x.count,0)<=12);
export type ImageDiagnostic=z.infer<typeof imageDiagnosticSchema>;
export const imageDiagnosticsSchema=z.object({searchCover:imageDiagnosticSchema.optional(),detailCover:imageDiagnosticSchema.optional(),authorAvatar:imageDiagnosticSchema.optional()}).strict();
export type ImageDiagnostics=z.infer<typeof imageDiagnosticsSchema>;
export function safeImageDiagnostics(value:unknown):ImageDiagnostics|undefined {const parsed=imageDiagnosticsSchema.safeParse(value);return parsed.success?parsed.data:undefined;}
/** No URL, arbitrary field path, upstream text or error object enters the diagnostic. */
export function inspectImageUrl(value:unknown,kind:'cover'|'avatar'):{reason:ImageReason;url?:string}{
 if(value===undefined)return {reason:'NOT_RETURNED'};
 if(value===null)return {reason:'EMPTY'};
 if(typeof value!=='string')return {reason:'UNSUPPORTED_FORMAT'};
 if(value==='')return {reason:'EMPTY'};
 if(value.length>2048||/[\s\\%]/.test(value))return {reason:'URL_FORMAT'};
 let u:URL;try{u=new URL(value);}catch{return {reason:'URL_FORMAT'};}
 if(u.protocol!=='https:'||!value.startsWith('https://'))return {reason:'PROTOCOL'};
 if(u.username||u.password||u.port||u.search||u.hash)return {reason:'URL_COMPONENTS'};
 const hosts=kind==='cover'?['sns-webpic-qc.xhscdn.com','sns-webpic-qn.xhscdn.com']:['sns-avatar-qc.xhscdn.com'];
 if(!hosts.includes(u.hostname))return {reason:'HOST'};
 if(!(kind==='cover'?/^\/[A-Za-z0-9_/.!@,=+-]+$/:/^\/avatar\/[A-Za-z0-9_/.!@,=+-]+$/).test(u.pathname)||u.pathname==='/')return {reason:'PATH'};
 return {reason:'ACCEPTED',url:u.href};
}
