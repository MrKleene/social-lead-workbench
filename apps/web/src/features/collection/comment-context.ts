import type {ArchivePage,ArchivedComment} from './archive-data';
export const CONTEXT_PAGE_LIMIT=10;
export type ContextTarget={commentId:string;userId?:string};
export type ContextResult={items:ArchivedComment[];complete:boolean;scanned:number};
/** Read saved, post-scoped pages only. Never reinterpret a global or stale response as context. */
export async function readCommentContext(postId:string,target:ContextTarget,read:(offset:number)=>Promise<ArchivePage>,signal:AbortSignal):Promise<ContextResult>{
 const found=new Map<string,ArchivedComment>(),seen=new Set<string>();
 for(let page=0;page<CONTEXT_PAGE_LIMIT;page++){
  signal.throwIfAborted();const data=await read(page*50);signal.throwIfAborted();
  if(data.commentScope?.postId!==postId||!Array.isArray(data.items)||data.items.length>50||typeof data.hasMore!=='boolean'||data.items.some(c=>c.snapshot.postId!==postId))throw Error('评论范围不匹配，已停止查找');
  let added=0;
  for(const c of data.items){if(!seen.has(c.id)){seen.add(c.id);added++;}if(c.snapshot.commentId===target.commentId&&(!target.userId||c.snapshot.userId===target.userId))found.set(c.id,c);}
  if(!data.hasMore)return {items:[...found.values()],complete:true,scanned:seen.size};
  if(!added)break;
 }
 return {items:[...found.values()],complete:false,scanned:seen.size};
}
