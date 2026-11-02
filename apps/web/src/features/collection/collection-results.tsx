import {Table,TableHeader,TableBody,TableRow,TableHead,TableCell} from '@/components/ui/table';
import {Pager} from '@/components/pager';
import { FormField } from '@/components/form-field';
import { Empty } from '@/components/ui/empty';
import { SelectField, SelectOption } from '@/components/select-field';
import { Input } from '@/components/ui/input';
import {Sheet,SheetContent,SheetHeader,SheetTitle,SheetDescription} from '@/components/ui/sheet';
import {postStates} from '@crm/contracts';
import {postAccessLabel} from './post-reading-labels';
import {collectionOutcome} from '@/features/collection/collection-outcome';
import {SavedPostRead} from './saved-post-read';
import {useLayoutEffect,useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
import {ErrorNotice,Loading} from '@/components/feedback';
import {ApiError} from '@/lib/api';
import {formatDate} from '@/lib/types';
import {type Config} from './types';
import {CollectionPostCard} from './collection-post-card';
import {useCollectionInfo} from './use-collection-info';
import {CollectionPostDetail} from './collection-post-detail';
import './collection-info.css';
import {SinglePostCheck} from './single-post-check';
export function CollectionResults({configs,initialId,onSettings}:{configs:Config[];initialId?:string;onSettings:()=>void}){
 const s=useCollectionInfo(configs,initialId),d=s.list.data;
 const scroll=useRef({inner:0,outer:0}),root=useRef<HTMLElement>(null),returnTo=useRef<string>(s.postId);
 const previousPost=useRef(s.postId);
 useLayoutEffect(()=>{if(!s.active)return;if(previousPost.current&&!s.postId){root.current?.scrollTo({top:scroll.current.inner});window.scrollTo({top:scroll.current.outer});Array.from(root.current?.querySelectorAll<HTMLButtonElement>('[data-post]')||[]).find(e=>e.dataset.post===returnTo.current)?.focus({preventScroll:true});}previousPost.current=s.postId;},[s.postId,s.active]);
 return <section ref={root} className="collection-results collection-info" data-detail={false} aria-label="独立采集信息"><header className="list-heading"><div>{<><h1>采集信息</h1><span className="archive-subtitle">历史归档</span></>}</div><div className="action-row"><SinglePostCheck/><Button variant="outline" onClick={()=>void s.archive.refetch()}>刷新列表</Button></div></header>
 {!configs.length?<Empty className="empty-state"><h2>还没有采集信息</h2><Button onClick={onSettings}>配置关键词</Button></Empty>:<>
 <div className="info-filters"><FormField>关键词组<SelectField aria-label="结果搜索配置" value={s.selected?.id||''} onValueChange={e=>s.setConfig(e)}>{configs.map(c=><SelectOption key={c.id} value={c.id}>{c.name}</SelectOption>)}</SelectField></FormField><FormField>搜索已保存内容<Input aria-label="搜索采集原文" value={s.search} onChange={e=>s.setSearch(e.target.value)} placeholder="帖子、评论或昵称"/></FormField><FormField>帖子状态<SelectField aria-label="帖子状态筛选" value={s.availability} onValueChange={e=>s.setAvailability(e)}><SelectOption value="">全部状态</SelectOption>{postStates.map(state=><SelectOption key={state} value={state}>{postAccessLabel(state)}</SelectOption>)}</SelectField></FormField><FormField>按任务筛选<SelectField aria-label="结果任务历史" value={s.runId} onValueChange={e=>s.setRun(e)}><SelectOption value="">全部已保存版本</SelectOption>{(s.history.data?.runs||s.selected?.runs||[]).map(r=><SelectOption key={r.id} value={r.id}>{formatDate(r.createdAt)} · {collectionOutcome(r).label}</SelectOption>)}</SelectField></FormField></div>
  {s.postId&&<Sheet open onOpenChange={open=>{if(!open)s.back();}}><SheetContent className="post-reader-dialog" onCloseAutoFocus={e=>{e.preventDefault();requestAnimationFrame(()=>{Array.from(root.current?.querySelectorAll<HTMLButtonElement>('[data-post]')||[]).find(n=>n.dataset.post===returnTo.current)?.focus({preventScroll:true});});}}><SheetHeader><SheetTitle>帖子与评论原文</SheetTitle><SheetDescription className="sr-only">已保存原文、评论与回复</SheetDescription></SheetHeader>{s.archive.isPending?<Loading/>:s.archive.isError?<div className="task-settings-body"><ErrorNotice error={s.archive.error}/><Button variant="outline" onClick={()=>void s.archive.refetch()}>重试读取原文</Button></div>:<CollectionPostDetail key={`${s.selected!.id}:${s.runId}:${s.postId}`} configId={s.selected!.id} readAction={s.selected?.mode==='XHS_MCP'&&s.post?.versions[0]?<SavedPostRead config={s.selected} savedPostId={s.post.versions[0].id} title={s.post.title} sourceAvailable={s.post.versions[0].sourceAvailable===true}/>:undefined} platform={s.selected!.platform} post={s.post} id={s.postId} onBack={s.back} onRefresh={()=>void s.archive.refetch()}/>}</SheetContent></Sheet>}
 {s.list.isPending?<Loading/>:s.list.error instanceof ApiError&&s.list.error.status===404?<p role="status">原文接口尚未部署。</p>:s.list.isError?<div className="archive-load-error"><ErrorNotice error={s.list.error}/><Button variant="outline" onClick={()=>void s.list.refetch()}>重试查询</Button></div>:d&&<>
 {<div className="info-scope"><span>当前展示 <strong>{s.visible.length}</strong> 篇帖子</span><span>配置内 <strong>{s.list.data?.postTotal??'—'}</strong> 篇匹配帖子</span><span>帖子列表 · {s.list.data?.hasMore?'还有下一页帖子':'已到列表末页'}</span></div>}
<Table className="archive-post-table" aria-label="已采集帖子"><TableHeader><TableRow><TableHead>帖子</TableHead><TableHead>原帖访问</TableHead><TableHead>已保存评论</TableHead><TableHead>读取覆盖</TableHead><TableHead>最近保存</TableHead><TableHead>操作</TableHead></TableRow></TableHeader><TableBody>{s.visible.map(p=><CollectionPostCard key={p.id} post={p} platform={s.selected!.platform} onOpen={()=>{scroll.current={inner:root.current?.scrollTop||0,outer:window.scrollY};returnTo.current=p.id;s.open(p);}}/>)}{!s.visible.length&&<TableRow><TableCell colSpan={6}><div className="archive-list-empty" role="status"><h2>暂无已保存帖子</h2><p>当前筛选条件下无结果</p></div></TableCell></TableRow>}</TableBody></Table>
 {<Pager className="action-row info-pagination"><Button variant="outline" disabled={!s.offset} onClick={()=>s.setPage(Math.max(0,s.offset-20))}>上一页帖子</Button><span>帖子列表第 {s.offset/20+1} 页{d.hasMore?" · 还有下一页":""}</span><Button variant="outline" disabled={!s.list.data?.hasMore||s.offset>=100000} onClick={()=>s.setPage(s.offset+20)}>下一页帖子</Button></Pager>}
 {d.legacyWithoutSnapshot>0&&<p role="status">当前关键词组共有 {d.legacyWithoutSnapshot} 条历史观察缺少原文，无法重建；不是当前帖的缺失评论数。</p>}
 </>}
 </>}
 </section>;
}
