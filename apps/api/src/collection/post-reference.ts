import {z} from 'zod';
// A public note access reference is not an account session. Never include it in logs,
// model input, content hashes, or general archive responses.
export const postReferenceSchema=z.object({postId:z.string().regex(/^[a-f0-9]{24}$/),token:z.string().min(1).max(4096).regex(/^[A-Za-z0-9_+\/=-]+$/),source:z.enum(['pc_search','pc_feed'])}).strict();
export type PostReference=z.infer<typeof postReferenceSchema>;
export function savedPostReference(value:unknown,postId:unknown):PostReference|undefined{
 const p=postReferenceSchema.safeParse(value);return p.success&&p.data.postId===postId?p.data:undefined;
}
export function parsePostReference(value:unknown):PostReference|undefined{
 if(typeof value!=='string'||value.length>8192||/[\s\\]/.test(value)||!value.startsWith('https://www.xiaohongshu.com/explore/'))return;
 try{
  const u=new URL(value),m=/^\/explore\/([a-f0-9]{24})$/.exec(u.pathname);
  if(u.origin!=='https://www.xiaohongshu.com'||u.username||u.password||u.port||u.hash||!m||value.split('?')[0]!==`https://www.xiaohongshu.com/explore/${m[1]}`)return;
  const keys=[...u.searchParams.keys()];if(keys.length!==2||new Set(keys).size!==2||!keys.includes('xsec_token')||!keys.includes('xsec_source'))return;
  return savedPostReference({postId:m[1],token:u.searchParams.get('xsec_token'),source:u.searchParams.get('xsec_source')},m[1]);
 }catch{return;}
}
export function postReferenceUrl(ref:PostReference):string{
 const p=postReferenceSchema.parse(ref),u=new URL(`https://www.xiaohongshu.com/explore/${p.postId}`);
 u.searchParams.set('xsec_token',p.token);u.searchParams.set('xsec_source',p.source);return u.href;
}
export function publicPostSnapshot(value:unknown):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value))return {};
 const {sourceReference,...snapshot}=value as Record<string,unknown>;return snapshot;
}
