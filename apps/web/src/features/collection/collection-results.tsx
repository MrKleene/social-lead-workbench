import {useLayoutEffect,useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
import {ErrorNotice,Loading} from '@/components/feedback';
import {ApiError} from '@/lib/api';
import {formatDate,platformLabel} from '@/lib/types';
import {SemanticReviewPanel} from './semantic-review-panel';
import {runLabels,type Config} from './types';
import {savedCommentCount} from './collection-info-model';
import {useCollectionInfo} from './use-collection-info';
import {CollectionPostDetail} from './collection-post-detail';
import './collection-info.css';
export function CollectionResults({configs,initialId,onSettings}:{configs:Config[];initialId?:string;onSettings:()=>void}){
 const s=useCollectionInfo(configs,initialId),d=s.archive.data;
 const [analysis,setAnalysis]=useState(false),scroll=useRef({inner:0,outer:0}),root=useRef<HTMLElement>(null),returnTo=useRef<string>('');
 const previousPost=useRef(s.postId);
 useLayoutEffect(()=>{if(!s.active)return;if(previousPost.current&&!s.postId){root.current?.scrollTo({top:scroll.current.inner});window.scrollTo({top:scroll.current.outer});Array.from(root.current?.querySelectorAll<HTMLButtonElement>('[data-post]')||[]).find(e=>e.dataset.post===returnTo.current)?.focus({preventScroll:true});}previousPost.current=s.postId;},[s.postId,s.active]);
 return <section ref={root} className="collection-results collection-info" aria-label="独立采集信息"><header className="list-heading"><div><h1>采集信息</h1><p>已保存的帖子与评论</p></div><Button variant="outline" onClick={()=>void s.archive.refetch()}>刷新</Button></header>
 {!configs.length?<div className="empty-state"><h2>还没有采集信息</h2><Button onClick={onSettings}>配置关键词</Button></div>:<>
 <div hidden={!!s.postId} className="info-filters"><label>关键词组<select aria-label="结果搜索配置" value={s.selected?.id||''} onChange={e=>s.setConfig(e.target.value)}>{configs.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>搜索本页<input aria-label="搜索采集原文" value={s.search} onChange={e=>s.setSearch(e.target.value)} placeholder="帖子或已返回评论"/></label><details><summary>按任务筛选</summary><select aria-label="结果任务历史" value={s.runId} onChange={e=>s.setRun(e.target.value)}><option value="">全部已保存版本</option>{(s.history.data?.runs||s.selected?.runs||[]).map(r=><option key={r.id} value={r.id}>{formatDate(r.createdAt)} · {runLabels[r.status]||r.status}</option>)}</select></details></div>
 {s.archive.isPending?<Loading/>:s.archive.error instanceof ApiError&&s.archive.error.status===404?<p role="status">原文接口尚未部署。</p>:s.archive.isError?<ErrorNotice error={s.archive.error}/>:d&&<>
 <p className="info-scope">评论页 {s.offset/50+1} · 每页最多 50 个原文版本{d.hasMore?' · 还有下一页':''} · 帖子来自最近 20 个版本及本页关联</p>
 {d.legacyWithoutSnapshot>0&&<p role="status">{d.legacyWithoutSnapshot} 条历史观察缺少原文，无法重建。</p>}
 {s.postId?<CollectionPostDetail post={s.post} id={s.postId} comments={s.comments} hasOtherPages={d.hasMore||s.offset>0} onBack={s.back}/>:<div className="info-post-list" aria-label="已采集帖子">{s.visible.map(p=><button className="info-post-card" data-post={p.id} key={p.id} onClick={()=>{scroll.current={inner:root.current?.scrollTop||0,outer:window.scrollY};returnTo.current=p.id;s.open(p);root.current?.scrollTo({top:0});}}><span className="info-post-top"><strong>{p.title||'标题缺失'}</strong><span aria-hidden="true">↗</span></span><span>{platformLabel[s.selected!.platform]} · {formatDate(p.lastSeenAt)}</span><span>本页已采集 {savedCommentCount(p.comments)} 条评论／回复{p.comments.length>savedCommentCount(p.comments)?` · ${p.comments.length} 个原文版本`:''}</span><small>来源帖子 ID：{p.id}</small></button>)}{!s.visible.length&&<p role="status">当前页和筛选下没有帖子原文。</p>}</div>}
 <div className="action-row info-pagination"><Button variant="outline" disabled={!s.offset} onClick={()=>s.setPage(Math.max(0,s.offset-50))}>上一页原文</Button><span>评论页 {s.offset/50+1}</span><Button variant="outline" disabled={!d.hasMore||s.offset>=100000} onClick={()=>s.setPage(s.offset+50)}>下一页原文</Button></div>
 <details className="info-boundaries"><summary>保存范围与分析</summary><p>配置内共 {d.postTotal} 个帖子版本、{d.total} 个评论上下文版本。帖子列表来自最近 20 个帖子版本及本页评论，非完整帖子目录；翻页仅翻评论。搜索与任务筛选仅作用于已返回内容，任务归属只保留首次/最近观察。已采集数量不是平台总数，不同内容版本保留。</p><p>LLM {d.control.enabled?'已开启 · 外发仍需逐批确认':'关闭 · 原文仍可浏览'}。真实发送关闭。</p><Button variant="ghost" onClick={()=>setAnalysis(v=>!v)} aria-expanded={analysis}>语义分析与 LLM 开关</Button>{analysis&&s.selected&&<SemanticReviewPanel key={s.selected.id} configId={s.selected.id}/>}</details>
 </>}
 </>}
 </section>;
}
