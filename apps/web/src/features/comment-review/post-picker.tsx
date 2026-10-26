import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import type {ReviewPosts} from '@crm/contracts';
import {api} from '@/lib/api';
import {Sheet,SheetContent,SheetHeader,SheetTitle,SheetDescription} from '@/components/ui/sheet';
import {Button} from '@/components/ui/button';
import {ErrorNotice,Loading} from '@/components/feedback';
export type SavedReviewPost=ReviewPosts['items'][number];
export function PostPicker({open,onClose,onSelect,onReturnFocus,busy=false,error}:{open:boolean;onClose:()=>void;onSelect:(p:SavedReviewPost)=>void;onReturnFocus:()=>void;busy?:boolean;error?:unknown}){
 const [search,setSearch]=useState(''),[offset,setOffset]=useState(0);
 const q=useQuery({queryKey:['comment-review','posts',search,offset],queryFn:()=>api<ReviewPosts>(`/comment-review/posts?offset=${offset}&search=${encodeURIComponent(search)}`),enabled:open,retry:false});
 return <Sheet open={open} onOpenChange={v=>{if(!v&&!busy)onClose();}}><SheetContent className="task-settings-sheet review-post-picker" onCloseAutoFocus={e=>{e.preventDefault();onReturnFocus();}}><SheetHeader><SheetTitle>选择已采集帖子</SheetTitle><SheetDescription>选择一篇帖子，使用已保存评论（包括回复）。</SheetDescription></SheetHeader><div className="task-settings-body"><ErrorNotice error={error}/><label>搜索帖子标题<input autoFocus type="search" maxLength={100} value={search} onChange={e=>{setSearch(e.target.value);setOffset(0);}}/></label>{q.isPending?<Loading/>:q.isError?<ErrorNotice error={q.error}/>:<div className="review-post-options">{q.data?.items.map(p=><button type="button" className="review-post-option" key={p.id} disabled={busy||!p.comments} onClick={()=>onSelect(p)}>{p.coverUrl&&<img src={p.coverUrl} alt="" loading="lazy" referrerPolicy="no-referrer" onError={e=>{e.currentTarget.hidden=true;}}/>}<span><strong>{p.title||'未提供标题'}</strong><small>已保存 {p.comments} 个评论版本{p.coverage==='PARTIAL'?' · 覆盖不足':''}</small></span></button>)}{!q.data?.items.length&&<p>没有符合条件的已保存帖子。</p>}</div>}<div className="action-row"><Button variant="ghost" disabled={!offset||busy} onClick={()=>setOffset(offset-20)}>上一页帖子</Button><span>第 {offset/20+1} 页</span><Button variant="ghost" disabled={!q.data?.hasMore||busy} onClick={()=>setOffset(offset+20)}>下一页帖子</Button></div></div></SheetContent></Sheet>;
}
