import {useEffect,useRef,useState,type ReactNode} from 'react';
import {useInfiniteQuery} from '@tanstack/react-query';
import {ImageOff,LoaderCircle} from 'lucide-react';
import {Disclosure} from '@/components/disclosure';
import {Badge} from '@/components/ui/badge';
import {Button} from '@/components/ui/button';
import {Avatar,AvatarFallback,AvatarImage} from '@/components/ui/avatar';
import {Dialog,DialogContent,DialogTitle} from '@/components/ui/dialog';
import {ErrorNotice} from '@/components/feedback';
import {BoundedReadEvidence,BoundedReadWindows} from '@/features/collection/bounded-read-evidence';
import {ImageDiagnostics} from '@/features/collection/image-diagnostics';
import {cn} from '@/lib/utils';
import {localApi,type PostComment} from './local-api';

function initial(value:string|null):string{return value?[...value.trim()][0]||'?':'?';}
function formatDate(value:string|null,fallback:string):string{if(!value)return fallback;if(!/^\d{4}-\d{2}-\d{2}/.test(value))return value;const date=new Date(value);return Number.isNaN(date.getTime())?value:date.toLocaleString();}

function commentDate(value:string|null):string{
 if(!value)return '评论发布时间未记录';
 if(!/^\d{4}-\d{2}-\d{2}/.test(value))return value;
 const date=new Date(value);
 return Number.isNaN(date.getTime())?value:date.toLocaleDateString();
}

function CommentBody({body}:{body:string}){
 const ref=useRef<HTMLParagraphElement>(null),[expanded,setExpanded]=useState(false),[canExpand,setCanExpand]=useState(false);
 useEffect(()=>{
  if(expanded)return;
  const node=ref.current;if(!node)return;
  const measure=()=>setCanExpand(node.scrollHeight>node.clientHeight+1);
  measure();
  const observer=new ResizeObserver(measure);observer.observe(node);
  return()=>observer.disconnect();
 },[body,expanded]);
 return <>
  <p ref={ref} className={cn('mt-1 text-body leading-relaxed break-words',!expanded&&'line-clamp-4')}>{body}</p>
  {canExpand?<Button type="button" variant="ghost" size="sm" className="mt-1 h-auto justify-start px-0 text-caption text-muted-foreground hover:bg-transparent hover:text-foreground" aria-expanded={expanded} onClick={()=>setExpanded(value=>!value)}>{expanded?'收起':'展开'}</Button>:null}
 </>;
}

function CommentRow({comment,reply=false}:{comment:PostComment;reply?:boolean}){
 return <div className="flex gap-3">
  <Avatar className={reply?'size-8 shrink-0':'size-10 shrink-0'}><AvatarImage src={comment.author_avatar_url||undefined} alt=""/><AvatarFallback className="text-caption font-medium">{initial(comment.nickname)}</AvatarFallback></Avatar>
  <div className="min-w-0 flex-1">
   <div className="flex flex-wrap items-center gap-2">
    <span className="text-body font-medium break-words">{comment.nickname||'未命名用户'}</span>
    {comment.reply_to_nickname?<span className="text-caption text-muted-foreground">回复 @{comment.reply_to_nickname}</span>:null}
   </div>
   <CommentBody body={comment.body}/>
   <p className="mt-2 text-caption text-muted-foreground">{commentDate(comment.published_at)}</p>
  </div>
 </div>;
}

export function LocalPostHistory({postId,onClose,footer}:{postId:string;onClose:()=>void;footer?:ReactNode}){
 const [expanded,setExpanded]=useState<Record<string,boolean>>({}),[failedCover,setFailedCover]=useState<string|null>(null);
 const scrollRef=useRef<HTMLDivElement>(null),loadRef=useRef<HTMLDivElement>(null);
 useEffect(()=>{setExpanded({});setFailedCover(null);},[postId]);
 const history=useInfiniteQuery({
  queryKey:['local','post-history',postId],
  queryFn:({pageParam})=>localApi('postHistory',{postId,page:pageParam}),
  initialPageParam:1,
  getNextPageParam:last=>last.comments.page*last.comments.pageSize<last.comments.roots?last.comments.page+1:undefined,
 });
 const data=history.data?.pages[0],roots=history.data?.pages.flatMap(page=>page.comments.items)??[];
 useEffect(()=>{
  const root=scrollRef.current,target=loadRef.current;
  if(!root||!target||!history.hasNextPage||history.isFetchNextPageError)return;
  const observer=new IntersectionObserver(entries=>{
   if(entries.some(entry=>entry.isIntersecting)&&!history.isFetchingNextPage)void history.fetchNextPage();
  },{root,rootMargin:'0px 0px 240px 0px'});
  observer.observe(target);
  return()=>observer.disconnect();
 },[history.fetchNextPage,history.hasNextPage,history.isFetchingNextPage,history.isFetchNextPageError,postId,roots.length]);
 const loadMore=()=>{void history.fetchNextPage();};
 const coverUrl=data?.post.coverUrl||null,showCover=!!coverUrl&&failedCover!==coverUrl;
 const title=data?.post.title||'笔记原文与评论';
 return <Dialog open onOpenChange={open=>{if(!open)onClose();}}>
  <DialogContent className="h-[100dvh] max-h-none w-screen max-w-none gap-0 overflow-hidden rounded-none p-0 sm:h-[min(780px,85vh)] sm:max-h-[85vh] sm:w-[calc(100%-2rem)] sm:max-w-6xl sm:rounded-lg">
   <DialogTitle className="sr-only">{title}</DialogTitle>
   {history.error?<div className="p-6"><ErrorNotice error={history.error}/></div>:!data?<div className="p-6"><p className="text-body text-muted-foreground">正在读取…</p></div>:<div className="grid h-full min-h-0 grid-rows-[minmax(0,32vh)_minmax(0,1fr)] sm:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] sm:grid-rows-1">
    <div className="relative flex min-h-0 items-center justify-center overflow-hidden border-b bg-muted sm:border-r sm:border-b-0">
     {showCover?<img src={coverUrl} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" onError={()=>setFailedCover(coverUrl)}/>:<div className="flex flex-col items-center gap-2 text-muted-foreground"><ImageOff className="size-6"/><span className="text-caption">无封面</span></div>}
    </div>
    <div className="flex min-h-0 flex-col">
     <div className="flex items-center gap-3 border-b px-6 py-4 pr-14">
      <Avatar className="size-9"><AvatarImage src={data.post.authorAvatarUrl||undefined} alt=""/><AvatarFallback className="text-caption font-medium">{initial(data.post.authorNickname)}</AvatarFallback></Avatar>
      <div className="min-w-0 flex-1">
       <p className="truncate text-body font-medium">{data.post.authorNickname||'未命名作者'}</p>
       <p className="text-caption text-muted-foreground">{formatDate(data.post.publishedAt,'发布时间未记录')}</p>
      </div>
     </div>
     <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-4">
      <div className="flex flex-wrap items-start gap-2">
       <h2 className="min-w-0 flex-1 text-title font-semibold break-words">{data.post.title||'历史笔记原文'}</h2>
       <Badge variant={data.post.coverage==='COMPLETE'?'success':data.post.coverage==='PARTIAL'?'warning':'outline'}>{data.post.coverage==='COMPLETE'?'完整':data.post.coverage==='PARTIAL'?'待补读':'完整性未确认'}</Badge>
      </div>
      <p className="text-caption text-muted-foreground">保存于 {data.post.observedAt?new Date(data.post.observedAt).toLocaleString():'时间未记录'}</p>
      <p className="text-body leading-relaxed whitespace-pre-wrap break-words">{data.post.body}</p>
      <Disclosure title="查看保存的读取与图片诊断">
       <div className="flex flex-col gap-3">
        <ImageDiagnostics value={data.post.imageDiagnostics}/>
        <BoundedReadEvidence value={data.post.boundedRead}/>
        <BoundedReadWindows values={data.post.boundedReadWindows}/>
       </div>
      </Disclosure>
      <div className="flex items-center justify-between pt-2">
       <h3 className="text-section font-semibold">评论</h3><span className="text-caption text-muted-foreground">{data.comments.total} 条</span>
      </div>
      {roots.length?<ol className="flex flex-col gap-6">
       {roots.map(root=>{
        const open=!!expanded[root.id],shown=open?root.replies:root.replies.slice(0,1),hidden=root.replies.length-shown.length;
        return <li key={root.id}>
         <CommentRow comment={root}/>
         {root.replies.length?<div className="mt-4 ml-12 flex flex-col gap-5">
          {shown.map(reply=><CommentRow key={reply.id} comment={reply} reply/>)}
          {hidden>0||open?<Button type="button" variant="ghost" size="sm" className="h-auto justify-start px-0 text-caption text-muted-foreground hover:bg-transparent hover:text-foreground" onClick={()=>setExpanded(value=>({...value,[root.id]:!value[root.id]}))}>{open?'收起回复':`展开其余 ${hidden} 条回复`}</Button>:null}
         </div>:null}
        </li>;
       })}
      </ol>:<p className="text-body text-muted-foreground">还没有保存的评论。</p>}
      <div ref={loadRef} className="flex min-h-9 flex-col items-center justify-center gap-2 py-2">
       {history.isFetchingNextPage?<p role="status" aria-live="polite" className="flex items-center gap-2 text-caption text-muted-foreground"><LoaderCircle className="size-4 animate-spin"/>加载中…</p>
        :history.isFetchNextPageError?<><p className="text-caption text-destructive">加载失败</p><Button type="button" variant="outline" size="sm" onClick={loadMore}>重试</Button></>
        :history.hasNextPage?<Button type="button" variant="outline" size="sm" onClick={loadMore}>加载更多主评论</Button>
        :roots.length>data.comments.pageSize?<p className="text-caption text-muted-foreground">已加载全部 {data.comments.roots} 条主评论</p>:null}
      </div>
     </div>
     {footer?<div className="flex flex-wrap items-center justify-end gap-2 border-t px-6 py-4">{footer}</div>:null}
    </div>
   </div>}
  </DialogContent>
 </Dialog>;
}