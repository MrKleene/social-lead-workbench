import {ListEmpty} from '@/components/list-empty';
import {Pager} from '@/components/pager';
import { FormField } from '@/components/form-field';
import { Input } from '@/components/ui/input';
import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import type {ReviewPosts} from '@crm/contracts';
import {api} from '@/lib/api';
import {Button} from '@/components/ui/button';
import {ErrorNotice,Loading} from '@/components/feedback';
export type SavedReviewPost=ReviewPosts['items'][number];
export function useSavedPosts(enabled:boolean){
 const [search,setSearch]=useState(''),[offset,setOffset]=useState(0);
 const query=useQuery({queryKey:['comment-review','posts',search,offset],queryFn:()=>api<ReviewPosts>(`/comment-review/posts?offset=${offset}&search=${encodeURIComponent(search)}`),enabled,retry:false});
 return {search,offset,query,setSearch:(value:string)=>{setSearch(value);setOffset(0);},setOffset};
}
export function SavedPostList({state:s,onSelect,busy=false,error,forTest=false}:{state:ReturnType<typeof useSavedPosts>;onSelect:(p:SavedReviewPost)=>void;busy?:boolean;error?:unknown;forTest?:boolean}){
 return <div className="review-post-picker"><ErrorNotice error={error}/><FormField>搜索帖子标题<Input type="search" maxLength={100} value={s.search} onChange={e=>s.setSearch(e.target.value)}/></FormField>{s.query.isPending?<Loading/>:s.query.isError?<><ErrorNotice error={s.query.error}/><Button variant="outline" disabled={s.query.isFetching} onClick={()=>void s.query.refetch()}>重新加载帖子</Button></>:<div className="review-post-options">{s.query.data?.items.map(p=><Button variant="ghost" size="content" type="button" className="review-post-option" key={p.id} disabled={busy||!p.comments} onClick={()=>onSelect(p)}>{p.coverUrl&&<img src={p.coverUrl} alt="" loading="lazy" referrerPolicy="no-referrer" onError={e=>{e.currentTarget.hidden=true;}}/>}<span><strong>{p.title||'未提供标题'}</strong><small>已保存 {p.comments} 条评论{forTest?'，本次测试这些评论':''}</small></span></Button>)}{!s.query.data?.items.length&&<ListEmpty title="没有符合条件的已保存帖子" description="试试其他标题关键词，或清除搜索。"/>}</div>}<Pager className="action-row review-pagination"><Button variant="ghost" size="content" disabled={!s.offset||busy||s.query.isFetching} onClick={()=>s.setOffset(s.offset-20)}>上一页帖子</Button><span>第 {s.offset/20+1} 页</span><Button variant="ghost" size="content" disabled={!s.query.data?.hasMore||busy||s.query.isFetching} onClick={()=>s.setOffset(s.offset+20)}>下一页帖子</Button></Pager></div>;
}
