import {useState} from 'react';
import {Link} from '@/lib/router-compat';
import {Badge} from '@/components/ui/badge';
import {Button} from '@/components/ui/button';
import {EmptyState} from '@/components/patterns/empty-state';
import {RecordItem,RecordList} from '@/components/patterns/record-list';
import {SectionCard} from '@/components/patterns/section-card';
import {ErrorNotice} from '@/components/feedback';
import {LocalPostHistory} from './local-post-history';
import {useLocalPosts} from './use-local-posts';

export function LocalPosts({runId,onClose}:{runId:string;onClose?:()=>void}){
 const posts=useLocalPosts(runId),[historyId,setHistoryId]=useState<string|null>(null);
 const items=posts.posts.data??[],comments=items.reduce((sum,post)=>sum+post.comments,0),selected=items.find(post=>post.id===historyId);
 return <div className="flex flex-col gap-4">
  <SectionCard title="本轮笔记" description={`${items.length} 篇 · ${comments} 条评论`} actions={onClose?<Button variant="ghost" size="sm" onClick={onClose}>收起</Button>:undefined}>
   {posts.error?<ErrorNotice error={posts.error}/>:null}
   {posts.notice?<p role="status" className="text-body text-muted-foreground">{posts.notice}</p>:null}
   {items.length?<RecordList>
    {items.map(post=><RecordItem key={post.id} title={post.title||'无标题笔记'} meta={<span className="flex flex-wrap items-center gap-2">
      <Badge variant={post.coverage==='COMPLETE'?'success':post.readAvailable?'warning':'outline'}>{post.coverage==='COMPLETE'?'完整':post.readAvailable?'待补读':'完整性未确认'}</Badge>
      <span>{post.comments} 条评论 · {post.observedAt?new Date(post.observedAt).toLocaleString():'历史时间未知'}</span>
     </span>} action={<>
      <Button variant="outline" onClick={()=>setHistoryId(post.id)}>查看原文与评论</Button>
      {post.coverage!=='COMPLETE'?(post.resumeReady&&post.postId?<Button variant="outline" asChild><Link to={`/posts?post=${post.postId}&action=resume`}>补读</Link></Button>:<Button variant="outline" disabled>补读</Button>):null}
     </>}>
      {!post.readAvailable?<p className="text-caption">来源凭据不可用，请用关键词重新查找。</p>:null}
     </RecordItem>)}
   </RecordList>:<EmptyState title="本轮还没有保存的笔记。"/>}
   {historyId?<LocalPostHistory key={historyId} postId={historyId} onClose={()=>setHistoryId(null)} footer={<>
    <Button variant="ghost" onClick={()=>setHistoryId(null)}>关闭</Button>
    {selected?.postId?<Button variant="outline" asChild><Link to={`/posts?post=${selected.postId}&action=view`}>在帖子列表中打开</Link></Button>:null}
   </>}/>:null}
  </SectionCard>
 </div>;
}
