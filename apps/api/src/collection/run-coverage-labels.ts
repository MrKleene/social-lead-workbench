import {safeRunCoverage} from '@crm/contracts';
import type {Db} from '../common/db';

/** Read-only labels, not historical content evidence. Never infer links from counts/order. */
export async function withCoveragePostLabels<T extends {id:string;runs:{metrics:unknown}[]}>(db:Db,configs:T[]){
 const targets=configs.flatMap(c=>{
  const refs=[...new Set(c.runs.flatMap(r=>safeRunCoverage((r.metrics as Record<string,unknown>|null)?.coverage)?.posts.flatMap(p=>p.postRef?[p.postRef]:[])||[]))];
  return refs.length?[{configId:c.id,platformPostId:{in:refs}}]:[];
 });
 if(!targets.length)return configs;
 // One bounded query for the whole response, including superseded runs. No per-post requests.
 const posts=await db.capturedPost.findMany({where:{OR:targets},select:{configId:true,platformPostId:true,snapshot:true},orderBy:[{lastSeenAt:'desc'},{id:'desc'}],take:2000});
 const labels=new Map<string,string>();
 for(const p of posts){const key=p.configId+'\0'+p.platformPostId,title=(p.snapshot as Record<string,unknown>)?.title;if(!labels.has(key)&&typeof title==='string'&&title.length<=500)labels.set(key,title);}
 return configs.map(c=>({...c,runs:c.runs.map(r=>({...r,coveragePostLabels:(safeRunCoverage((r.metrics as Record<string,unknown>|null)?.coverage)?.posts||[]).flatMap(p=>{
  const title=p.postRef?labels.get(c.id+'\0'+p.postRef):undefined;return p.postRef&&title!==undefined?[{postRef:p.postRef,title}]:[];
 })}))}));
}
