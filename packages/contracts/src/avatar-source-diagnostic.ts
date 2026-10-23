import {z} from 'zod';
// Inspection vocabulary only; these names are not mapped as avatar aliases.
export const avatarCandidateNames=["avatar", "Avatar", "avatarUrl", "avatarURL", "avatar_url", "userAvatar", "user_avatar", "userAvatarUrl", "user_avatar_url", "image", "Image", "imageUrl", "imageURL", "image_url", "images", "imageb", "imageB", "imageSmall", "imageBig", "headImage", "headImageUrl", "head_image", "head_image_url", "headImg", "headImgUrl", "head_img", "head_img_url", "profileImage", "profileImageUrl", "profile_image", "profile_image_url", "avatarSmall", "avatarLarge"] as const;
const role=z.enum(['ROOT','REPLY']), n=z.number().int().min(0).max(1000), positive=z.number().int().min(1).max(1000);
const shape=z.enum(['MISSING','NULL','EMPTY_STRING','WHITESPACE_STRING','NONEMPTY_STRING','OBJECT','ARRAY','BOOLEAN','NUMBER','INVALID']);
const state=z.enum(['COMMENT_SHAPE_INVALID','USER_UNAVAILABLE','USER_DECODE_FAILED','WIRE_FAILED','WIRE_CHANGED','EMPTY_AFTER_DECODE','NONEMPTY_PRESERVED']);
const common={status:z.enum(['OK','BYTE_LIMIT','INVALID_JSON','FEED_MISSING','INVALID_SHAPE']),truncated:z.boolean(),roots:n,replies:n,
 fields:z.array(z.object({group:z.enum(['USER_INFO','FIXED_AVATAR','AVATAR_CASE_VARIANT','IMAGE_NAMED_MEMBER','OTHER_MEMBER']),shape,count:z.number().int().min(1).max(64000)}).strict()).max(50),
 conversion:z.array(z.object({state,count:positive}).strict()).max(7)};
const candidate=z.object({name:z.enum(avatarCandidateNames),role,shape,protocol:z.enum(['NONE','INVALID','HTTP','HTTPS','RELATIVE','OTHER']),host:z.enum(['ALLOWED','OTHER','UNAVAILABLE']),components:z.enum(['NA','CLEAN','RESTRICTED']),path:z.enum(['AVATAR_PATH','OTHER','UNAVAILABLE']),count:positive}).strict();
const v1=z.object({version:z.literal(1),...common}).strict();
const v2=z.object({version:z.literal(2),...common,candidates:z.array(candidate).max(256),filtered:z.array(z.object({role,reason:z.enum(['INVALID_KEY','SENSITIVE_KEY','UNLISTED_IMAGE_KEY']),count:z.number().int().min(1).max(64000)}).strict()).max(6),transitions:z.array(z.object({role,state,count:positive}).strict()).max(14)}).strict();
const unique=(keys:string[])=>new Set(keys).size===keys.length;
export const avatarSourceDiagnosticSchema=z.discriminatedUnion('version',[v1,v2]).superRefine((v,ctx)=>{
 const reject=()=>ctx.addIssue({code:'custom',message:'Invalid avatar diagnostic counters'});
 if(v.roots+v.replies>1000||!unique(v.fields.map(x=>x.group+':'+x.shape))||!unique(v.conversion.map(x=>x.state))||v.fields.reduce((n,x)=>n+x.count,0)>66000||v.conversion.reduce((n,x)=>n+x.count,0)!==v.roots+v.replies)reject();
 if(v.status!=='OK'&&(v.roots+v.replies>0||v.fields.length||v.conversion.length))reject();
 if(v.version!==2)return;
 if(!unique(v.transitions.map(x=>x.role+':'+x.state))||!unique(v.filtered.map(x=>x.role+':'+x.reason))||!unique(v.candidates.map(({count,...x})=>JSON.stringify(x))))reject();
 for(const r of ['ROOT','REPLY'] as const){const total=r==='ROOT'?v.roots:v.replies;
  if(v.transitions.filter(x=>x.role===r).reduce((n,x)=>n+x.count,0)!==total||v.filtered.filter(x=>x.role===r).reduce((n,x)=>n+x.count,0)>total*64)reject();
  for(const name of avatarCandidateNames)if(v.candidates.filter(x=>x.role===r&&x.name===name).reduce((n,x)=>n+x.count,0)>total)reject();
 }
 for(const c of v.conversion)if(v.transitions.filter(x=>x.state===c.state).reduce((n,x)=>n+x.count,0)!==c.count)reject();
 if(v.transitions.some(t=>!v.conversion.some(c=>c.state===t.state)))reject();
 for(const c of v.candidates){
  if(c.shape!=='NONEMPTY_STRING'&&(c.protocol!=='NONE'||c.host!=='UNAVAILABLE'||c.components!=='NA'||c.path!=='UNAVAILABLE'))reject();
  if(c.shape==='NONEMPTY_STRING'&&c.protocol==='NONE')reject();
  if(c.protocol==='INVALID'&&(c.host!=='UNAVAILABLE'||c.components!=='NA'||c.path!=='UNAVAILABLE'))reject();
 }
});
export type AvatarSourceDiagnostic=z.infer<typeof avatarSourceDiagnosticSchema>;
export function safeAvatarSourceDiagnostic(value:unknown):AvatarSourceDiagnostic|undefined{const p=avatarSourceDiagnosticSchema.safeParse(value);return p.success?p.data:undefined;}
