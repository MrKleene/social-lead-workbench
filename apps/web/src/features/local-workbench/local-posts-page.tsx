import {useQuery} from '@tanstack/react-query';
import {useSearchParams} from '@/lib/router-compat';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import {DatePicker} from '@/components/ui/date-picker';
import {Input} from '@/components/ui/input';
import {SELECT_EMPTY,Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select';
import {EmptyState} from '@/components/patterns/empty-state';
import {FilterBar,FilterField} from '@/components/patterns/filter-bar';
import {PageHeader} from '@/components/patterns/page-header';
import {Pagination} from '@/components/patterns/pagination';
import {ErrorNotice} from '@/components/feedback';
import {CollectedPostCard} from './collected-post-card';
import {localApi} from './local-api';
import {LocalPostHistory} from './local-post-history';
import {LocalPostRead} from './local-post-read';
import {LocalReviewDialog} from './local-review-dialog';

export function LocalPostsPage(){
 const [params,setParams]=useSearchParams();
 const get=(key:string)=>params.get(key)||'',page=Math.max(1,Number(get('page'))||1);
 const change=(key:string,value:string)=>setParams(previous=>{const next=new URLSearchParams(previous);if(value)next.set(key,value);else next.delete(key);next.delete('page');return next;},{replace:true});
 const open=(id:string,action:string)=>setParams(previous=>{const next=new URLSearchParams(previous);next.set('post',id);next.set('action',action);return next;});
 const close=()=>setParams(previous=>{const next=new URLSearchParams(previous);next.delete('post');next.delete('action');return next;});
 const query=get('query'),coverage=get('coverage'),accountId=get('account'),from=get('from'),to=get('to');
 const posts=useQuery({queryKey:['local','collected-posts',page,query,coverage,accountId,from,to],queryFn:()=>localApi('collectedPosts',{page,query,coverage,accountId,from,to})});
 const accounts=useQuery({queryKey:['local','platform-accounts'],queryFn:()=>localApi('accountOverview')});
 const selected=posts.data?.items.find(item=>item.id===get('post')),action=get('action');
 return <>
  <PageHeader title="帖子列表" description={posts.data?`${posts.data.total} 篇笔记`:'已采集的笔记'}/>
  <div className="flex flex-col gap-3">
   <FilterBar>
    <FilterField label="搜索帖子标题"><Input type="search" maxLength={200} value={query} onChange={event=>change('query',event.target.value)}/></FilterField>
    <FilterField label="完整度">
     <Select value={coverage} onValueChange={value=>change('coverage',value)}>
      <SelectTrigger aria-label="完整度"><SelectValue/></SelectTrigger>
      <SelectContent>
       <SelectItem value={SELECT_EMPTY}>全部</SelectItem>
       <SelectItem value="COMPLETE">完整</SelectItem>
       <SelectItem value="PARTIAL">待补读</SelectItem>
      </SelectContent>
     </Select>
    </FilterField>
    <FilterField label="采集账号">
     <Select value={accountId} onValueChange={value=>change('account',value)}>
      <SelectTrigger aria-label="采集账号"><SelectValue/></SelectTrigger>
      <SelectContent>
       <SelectItem value={SELECT_EMPTY}>全部账号</SelectItem>
       {accounts.data?.accounts.map(account=><SelectItem key={account.id} value={account.id}>{account.name}</SelectItem>)}
      </SelectContent>
     </Select>
    </FilterField>
    <FilterField label="最近采集开始日期"><DatePicker ariaLabel="最近采集开始日期" value={from} placeholder="不限" onChange={value=>change('from',value)}/></FilterField>
    <FilterField label="最近采集结束日期"><DatePicker ariaLabel="最近采集结束日期" value={to} placeholder="不限" onChange={value=>change('to',value)}/></FilterField>
   </FilterBar>
   {accounts.error?<ErrorNotice error={accounts.error}/>:null}
   {posts.error?<ErrorNotice error={posts.error}/>:null}
   {posts.isPending?<p className="text-body text-muted-foreground">正在读取…</p>:null}
   {!posts.isPending&&!posts.data?.total?<EmptyState title="还没有采集的帖子。"/>:null}
   {posts.data?.items.length?<div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">
    {posts.data.items.map(post=><CollectedPostCard key={post.id} post={post} onOpen={()=>open(post.id,'view')}/>)}
   </div>:null}
   {posts.data&&posts.data.total?<Pagination page={page} total={posts.data.total} onPageChange={value=>setParams(previous=>{const next=new URLSearchParams(previous);next.set('page',String(value));return next;})} label="帖子列表分页" countLabel="篇笔记"/>:null}
  </div>
  {selected&&action==='view'?<LocalPostHistory key={selected.viewPostId} postId={selected.viewPostId} onClose={close} footer={<>
   <Button variant="ghost" onClick={close}>关闭</Button>
   <Button variant="outline" onClick={()=>open(selected.id,'read')}>重新读取</Button>
   {selected.coverage!=='COMPLETE'?<Button variant="outline" disabled={!selected.resumeReady} onClick={()=>open(selected.id,'resume')}>补读</Button>:null}
   {selected.reviewReady?<Button variant="outline" onClick={()=>open(selected.id,'review')}>审核这篇的评论</Button>:null}
  </>}/>:null}
  {selected&&(action==='read'||action==='resume')?<LocalPostRead key={selected.latestRunPostId+action} savedPostId={selected.latestRunPostId} resume={action==='resume'} onClose={close}/>:null}
  {selected&&action==='review'&&selected.latestCompleteRunId&&selected.latestCompleteRunPostId?<Dialog open onOpenChange={value=>{if(!value)close();}}>
   <DialogContent className="sm:max-w-xl"><DialogHeader><DialogTitle>审核这篇的评论</DialogTitle></DialogHeader><LocalReviewDialog runId={selected.latestCompleteRunId} postId={selected.latestCompleteRunPostId} independent bare onClose={close}/></DialogContent>
  </Dialog>:null}
 </>;
}
