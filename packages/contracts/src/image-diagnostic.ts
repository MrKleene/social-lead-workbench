import {z} from 'zod';
export const imageReasons=['NOT_RETURNED','EMPTY','UNSUPPORTED_FORMAT','URL_FORMAT','PROTOCOL','HOST','URL_COMPONENTS','PATH','ACCEPTED'] as const;
export type ImageReason=typeof imageReasons[number];
const count=z.number().int().min(0).max(12);
const urlClassSchema=z.object({protocol:z.enum(['HTTP','HTTPS','OTHER','INVALID']),host:z.enum(['ALLOWED','OTHER','UNAVAILABLE']),count}).strict();
export type ImageUrlClass=Omit<z.infer<typeof urlClassSchema>,'count'>;
const allowedHosts=(kind:'cover'|'avatar')=>kind==='cover'?['sns-webpic-qc.xhscdn.com','sns-webpic-qn.xhscdn.com']:['sns-avatar-qc.xhscdn.com'];
/** Classification before rejection: only enums, never arbitrary scheme/host/URL text. */
export function imageUrlClass(value:unknown,kind:'cover'|'avatar'):ImageUrlClass|undefined {
 if(typeof value!=='string'||!value)return;
 if(value.length>2048)return {protocol:'INVALID',host:'UNAVAILABLE'};
 try{const u=new URL(value);return {protocol:u.protocol==='http:'?'HTTP':u.protocol==='https:'?'HTTPS':'OTHER',host:allowedHosts(kind).includes(u.hostname)?'ALLOWED':u.hostname?'OTHER':'UNAVAILABLE'};}catch{return {protocol:'INVALID',host:'UNAVAILABLE'};}
}

export const imageDiagnosticSchema=z.object({version:z.literal(1),truncated:z.boolean(),shape:z.enum(['NOT_RETURNED','EMPTY','UNSUPPORTED','SUPPORTED']),fieldCount:count,urlClasses:z.array(urlClassSchema).max(12).optional(),httpsUpgrades:count.optional(),outcomes:z.array(z.object({reason:z.enum(imageReasons),count:count}).strict()).max(9)}).strict().refine(v=>new Set(v.outcomes.map(x=>x.reason)).size===v.outcomes.length&&v.outcomes.reduce((n,x)=>n+x.count,0)<=12&&(v.urlClasses||[]).reduce((n,x)=>n+x.count,0)<=12);
export type ImageDiagnostic=z.infer<typeof imageDiagnosticSchema>;
import {avatarSourceDiagnosticSchema} from './avatar-source-diagnostic';
export {avatarSourceDiagnosticSchema,safeAvatarSourceDiagnostic,type AvatarSourceDiagnostic} from './avatar-source-diagnostic';
export const imageDiagnosticsSchema=z.object({avatarSource:avatarSourceDiagnosticSchema.optional(),searchCover:imageDiagnosticSchema.optional(),detailCover:imageDiagnosticSchema.optional(),authorAvatar:imageDiagnosticSchema.optional()}).strict();
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
 const hosts=allowedHosts(kind);
 if(!hosts.includes(u.hostname))return {reason:'HOST'};
 if(!(kind==='cover'?/^\/[A-Za-z0-9_/.!@,=+-]+$/:/^\/avatar\/[A-Za-z0-9_/.!@,=+-]+$/).test(u.pathname)||u.pathname==='/')return {reason:'PATH'};
 return {reason:'ACCEPTED',url:u.href};
}
