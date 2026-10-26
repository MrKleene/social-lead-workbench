import {BadRequestException,ConflictException} from '@nestjs/common';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {Db} from '../common/db';

export const commentStreamInput=z.object({postId:z.string().min(1).max(200),q:z.string().trim().max(200).default(''),kind:z.enum(['all','roots','replies']).default('all'),cursor:z.string().max(2048).optional()}).strict();
type Input=z.infer<typeof commentStreamInput>;
export type CommentIndex={id:string;commentId:string;parent:string|null;createdAt:Date;versions:number;matches:boolean};
const cursorSchema=z.object({at:z.string().datetime(),after:z.string().min(1).max(200),scope:z.string().regex(/^[a-f0-9]{64}$/)}).strict();

/** Parents precede descendants, including across batches. Missing parents/cycles are retained, never fabricated. */
export function orderCommentIndex(rows:CommentIndex[]){
 const byId=new Map(rows.map(r=>[r.commentId,r])),children=new Map<string,CommentIndex[]>(),seen=new Set<string>(),ordered:CommentIndex[]=[];
 const sorted=[...rows].sort((a,b)=>a.createdAt.getTime()-b.createdAt.getTime()||a.id.localeCompare(b.id));
 for(const row of sorted)if(row.parent&&byId.has(row.parent)&&row.parent!==row.commentId){const list=children.get(row.parent)||[];list.push(row);children.set(row.parent,list);}
 const visit=(root:CommentIndex)=>{const pending=[root];while(pending.length){const row=pending.pop()!;if(seen.has(row.commentId))continue;seen.add(row.commentId);ordered.push(row);const next=children.get(row.commentId)||[];for(let i=next.length-1;i>=0;i--)pending.push(next[i]);}};
 for(const row of sorted)if(!row.parent||!byId.has(row.parent)||row.parent===row.commentId)visit(row);
 for(const row of sorted)visit(row);
 return ordered;
}
export function commentStreamWindow(rows:CommentIndex[],after?:string,size=30){
 const ordered=orderCommentIndex(rows),matches=ordered.filter(r=>r.matches),index=after?matches.findIndex(r=>r.commentId===after):-1;
 if(after&&index<0)throw new ConflictException('已保存记录发生变化，请刷新评论');
 const items=matches.slice(index+1,index+1+size),byId=new Map(rows.map(r=>[r.commentId,r])),contexts=new Map<string,CommentIndex>();
 for(const item of items){let row=item;const seen=new Set([row.commentId]);while(row.parent&&!seen.has(row.parent)){seen.add(row.parent);const parent=byId.get(row.parent);if(!parent)break;contexts.set(parent.commentId,parent);if(seen.size>32)throw new ConflictException('评论层级过深，无法可靠展示上下文');row=parent;}}
 const selected=new Set(items.map(r=>r.commentId));
 return {items,context:ordered.filter(r=>contexts.has(r.commentId)&&!selected.has(r.commentId)),matched:matches.length,hasMore:index+1+items.length<matches.length};
}
export async function readSavedCommentStream(db:Db,configId:string,raw:Input){
 const input=commentStreamInput.parse(raw),scope=createHash('sha256').update(JSON.stringify([configId,input.postId,input.q,input.kind])).digest('hex');
 let at=new Date(),after:string|undefined;
 if(input.cursor){try{const c=cursorSchema.parse(JSON.parse(Buffer.from(input.cursor,'base64url').toString('utf8')));if(c.scope!==scope||Date.parse(c.at)>Date.now()+1000)throw Error();at=new Date(c.at);after=c.after;}catch{throw new BadRequestException('评论读取位置无效，请刷新');}}
 // Only identity/topology and a boolean search result are indexed. Bodies are fetched for this batch and its real ancestors only.
 const rows=await db.$queryRaw<CommentIndex[]>`
 WITH versions AS (
  SELECT c.id,c."platformCommentId" AS "commentId",NULLIF(c.snapshot->>'parentId','') AS parent,c."createdAt",
   ROW_NUMBER() OVER (PARTITION BY c."platformCommentId" ORDER BY c."createdAt" DESC,c.id DESC) AS newest,
   COUNT(*) OVER (PARTITION BY c."platformCommentId")::int AS versions,
   (strpos(lower(coalesce(c.snapshot->>'comment','') || ' ' || coalesce(c.snapshot->>'authorNickname','')),lower(${input.q}))>0) AS text_match
  FROM "CapturedComment" c JOIN "CapturedPost" p ON p.id=c."postId"
  WHERE c."configId"=${configId} AND p."configId"=${configId} AND p."platformPostId"=${input.postId} AND c."createdAt"<=${at}
 )
 SELECT id,"commentId",parent,"createdAt",versions,(text_match AND (${input.kind}='all' OR (${input.kind}='roots' AND parent IS NULL) OR (${input.kind}='replies' AND parent IS NOT NULL))) AS matches
 FROM versions WHERE newest=1 LIMIT 100001`;
 if(rows.length>100000)throw new ConflictException('已保存评论数量超过本次浏览范围，请缩小帖子范围');
 const window=commentStreamWindow(rows,after),selected=[...window.items,...window.context],ids=selected.map(r=>r.id);
 const stored=ids.length?await db.capturedComment.findMany({where:{configId,id:{in:ids},post:{platformPostId:input.postId}},include:{post:{select:{coverage:true,stopReason:true}},reviews:{orderBy:{createdAt:'desc'},take:20,select:{id:true,state:true,score:true,reason:true,selectedModel:true,revision:true,result:true}}}}):[];
 const byId=new Map(stored.map(c=>[c.id,c]));
 if(stored.length!==ids.length)throw new ConflictException('已保存记录发生变化，请刷新评论');
 const result=(r:CommentIndex)=>({...byId.get(r.id)!,savedVersions:r.versions});
 return {items:window.items.map(result),context:window.context.map(result),snapshotAt:at.toISOString(),total:rows.length,matched:window.matched,roots:rows.filter(r=>!r.parent).length,replies:rows.filter(r=>!!r.parent).length,nextCursor:window.hasMore?Buffer.from(JSON.stringify({at:at.toISOString(),after:window.items.at(-1)!.commentId,scope})).toString('base64url'):null};
}
