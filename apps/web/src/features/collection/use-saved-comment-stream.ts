import {useInfiniteQuery} from '@tanstack/react-query';
import {api} from '@/lib/api';
import {mergeCommentStream,type CommentStreamPage} from './comment-stream-model';
export type {StreamComment} from './comment-stream-model';
export function useSavedCommentStream(configId:string,postId:string,q:string,kind:'all'|'roots'|'replies'){
 const queryKey=['saved-comment-stream',configId,postId,q,kind];
 const query=useInfiniteQuery({queryKey,initialPageParam:null as string|null,queryFn:async({pageParam,signal})=>{
  const params=new URLSearchParams({postId,q,kind});if(pageParam)params.set('cursor',pageParam);
  const page=await api<CommentStreamPage>(`/collection/configs/${encodeURIComponent(configId)}/comment-stream?${params}`,{signal});
  if(page.nextCursor&&page.nextCursor===pageParam||[...page.items,...page.context].some(c=>c.snapshot.postId!==postId))throw Error('评论读取位置未前进，请刷新后重试');
  return page;
 },getNextPageParam:last=>last.nextCursor||undefined,retry:false,staleTime:Infinity,refetchOnWindowFocus:false});
 return {...query,...mergeCommentStream(query.data?.pages||[]),summary:query.data?.pages[0],reset:query.refetch};
}
