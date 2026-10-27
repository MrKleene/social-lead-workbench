import {postStates,postStateLabels} from '@crm/contracts';
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
 const s=useCollectionInfo(configs,initialId),d=s.archive.data;
 const scroll=useRef({inner:0,outer:0}),root=useRef<HTMLElement>(null),returnTo=useRef<string>('');
 const previousPost=useRef(s.postId);
 useLayoutEffect(()=>{if(!s.active)return;if(previousPost.current&&!s.postId){root.current?.scrollTo({top:scroll.current.inner});window.scrollTo({top:scroll.current.outer});Array.from(root.current?.querySelectorAll<HTMLButtonElement>('[data-post]')||[]).find(e=>e.dataset.post===returnTo.current)?.focus({preventScroll:true});}previousPost.current=s.postId;},[s.postId,s.active]);
 return <section ref={root} className="collection-results collection-info" data-detail={!!s.postId} aria-label="独立采集信息"><header hidden={!!s.postId&&!!d&&!s.archive.isError&&!s.archive.isPending} className="list-heading"><div>{s.postId?<span className="info-detail-label">采集信息 / 帖子详情</span>:<><h1>采集信息</h1><p>已保存的帖子与评论</p></>}</div><div className="action-row"><SinglePostCheck/><Button variant="outline" onClick={()=>void s.archive.refetch()}>刷新</Button></div></header>
 {!configs.length?<div className="empty-state"><h2>还没有采集信息</h2><Button onClick={onSettings}>配置关键词</Button></div>:<>
 <div hidden={!!s.postId} className="info-filters"><label>关键词组<select aria-label="结果搜索配置" value={s.selected?.id||''} onChange={e=>s.setConfig(e.target.value)}>{configs.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>搜索已保存内容<input aria-label="搜索采集原文" value={s.search} onChange={e=>s.setSearch(e.target.value)} placeholder="帖子、评论或昵称"/></label><label>帖子状态<select aria-label="帖子状态筛选" value={s.availability} onChange={e=>s.setAvailability(e.target.value)}><option value="">全部状态</option>{postStates.map(state=><option key={state} value={state}>{postStateLabels[state]}</option>)}</select></label><label>按任务筛选<select aria-label="结果任务历史" value={s.runId} onChange={e=>s.setRun(e.target.value)}><option value="">全部已保存版本</option>{(s.history.data?.runs||s.selected?.runs||[]).map(r=><option key={r.id} value={r.id}>{formatDate(r.createdAt)} · {collectionOutcome(r).label}</option>)}</select></label></div>
 {s.archive.isPending?<Loading/>:s.archive.error instanceof ApiError&&s.archive.error.status===404?<p role="status">原文接口尚未部署。</p>:s.archive.isError?<ErrorNotice error={s.archive.error}/>:d&&<>
 {!s.postId&&<div className="info-scope"><span>当前展示 <strong>{s.visible.length}</strong> 篇帖子</span><span>配置内 <strong>{d.postTotal}</strong> 篇匹配帖子</span><span>帖子列表 · {d.hasMore?'还有下一页帖子':'已到列表末页'}</span></div>}
 {s.postId?<CollectionPostDetail key={`${s.selected!.id}:${s.postId}`} configId={s.selected!.id} readAction={s.selected?.mode==='XHS_MCP'&&s.post?.versions[0]?<SavedPostRead config={s.selected} savedPostId={s.post.versions[0].id} title={s.post.title} sourceAvailable={s.post.versions[0].sourceAvailable===true}/>:undefined} platform={s.selected!.platform} post={s.post} id={s.postId} onBack={s.back} onRefresh={()=>void s.archive.refetch()}/>:<div className="info-post-list" aria-label="已采集帖子">{s.visible.map(p=><CollectionPostCard key={p.id} post={p} platform={s.selected!.platform} onOpen={()=>{scroll.current={inner:root.current?.scrollTop||0,outer:window.scrollY};returnTo.current=p.id;s.open(p);root.current?.scrollTo({top:0});window.scrollTo({top:0});}}/>)}{!s.visible.length&&<p role="status">当前筛选下没有帖子原文。</p>}</div>}
 {!s.postId&&<div className="action-row info-pagination"><Button variant="outline" disabled={!s.offset} onClick={()=>s.setPage(Math.max(0,s.offset-20))}>上一页帖子</Button><span>帖子列表第 {s.offset/20+1} 页{d.hasMore?" · 还有下一页":""}</span><Button variant="outline" disabled={!d.hasMore||s.offset>=100000} onClick={()=>s.setPage(s.offset+20)}>下一页帖子</Button></div>}
 {d.legacyWithoutSnapshot>0&&<p role="status">当前关键词组共有 {d.legacyWithoutSnapshot} 条历史观察缺少原文，无法重建；不是当前帖的缺失评论数。</p>}
 </>}
 </>}
 </section>;
}
