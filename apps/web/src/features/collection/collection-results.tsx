import {collectionOutcome} from '@/features/collection/collection-outcome';
import {SavedPostRead} from './saved-post-read';
import {useLayoutEffect,useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
import {ErrorNotice,Loading} from '@/components/feedback';
import {ApiError} from '@/lib/api';
import {formatDate} from '@/lib/types';
import {SemanticReviewPanel} from './semantic-review-panel';
import {type Config} from './types';
import {CollectionPostCard} from './collection-post-card';
import {useCollectionInfo} from './use-collection-info';
import {CollectionPostDetail} from './collection-post-detail';
import './collection-info.css';
import {SinglePostCheck} from './single-post-check';
export function CollectionResults({configs,initialId,onSettings}:{configs:Config[];initialId?:string;onSettings:()=>void}){
 const s=useCollectionInfo(configs,initialId),d=s.archive.data;
 const [analysis,setAnalysis]=useState(false),scroll=useRef({inner:0,outer:0}),root=useRef<HTMLElement>(null),returnTo=useRef<string>('');
 const previousPost=useRef(s.postId);
 useLayoutEffect(()=>{if(!s.active)return;if(previousPost.current&&!s.postId){root.current?.scrollTo({top:scroll.current.inner});window.scrollTo({top:scroll.current.outer});Array.from(root.current?.querySelectorAll<HTMLButtonElement>('[data-post]')||[]).find(e=>e.dataset.post===returnTo.current)?.focus({preventScroll:true});}previousPost.current=s.postId;},[s.postId,s.active]);
 return <section ref={root} className="collection-results collection-info" data-detail={!!s.postId} aria-label="独立采集信息"><header hidden={!!s.postId&&!!d&&!s.archive.isError&&!s.archive.isPending} className="list-heading"><div>{s.postId?<span className="info-detail-label">采集信息 / 帖子详情</span>:<><h1>采集信息</h1><p>已保存的帖子与评论</p></>}</div><div className="action-row"><SinglePostCheck/><Button variant="outline" onClick={()=>void s.archive.refetch()}>刷新</Button></div></header>
 {!configs.length?<div className="empty-state"><h2>还没有采集信息</h2><Button onClick={onSettings}>配置关键词</Button></div>:<>
 <div hidden={!!s.postId} className="info-filters"><label>关键词组<select aria-label="结果搜索配置" value={s.selected?.id||''} onChange={e=>s.setConfig(e.target.value)}>{configs.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>搜索已保存内容<input aria-label="搜索采集原文" value={s.search} onChange={e=>s.setSearch(e.target.value)} placeholder="帖子、评论或昵称"/></label><details><summary>按任务筛选</summary><select aria-label="结果任务历史" value={s.runId} onChange={e=>s.setRun(e.target.value)}><option value="">全部已保存版本</option>{(s.history.data?.runs||s.selected?.runs||[]).map(r=><option key={r.id} value={r.id}>{formatDate(r.createdAt)} · {collectionOutcome(r).label}</option>)}</select></details></div>
 {s.archive.isPending?<Loading/>:s.archive.error instanceof ApiError&&s.archive.error.status===404?<p role="status">原文接口尚未部署。</p>:s.archive.isError?<ErrorNotice error={s.archive.error}/>:d&&<>
 {!s.postId&&<div className="info-scope"><span>当前展示 <strong>{s.visible.length}</strong> 篇帖子</span><span>配置内 <strong>{d.postTotal}</strong> 篇匹配帖子</span><span>帖子列表 · {d.hasMore?'还有下一页帖子':'已到列表末页'}</span></div>}
 {s.postId?<CollectionPostDetail key={`${s.selected!.id}:${s.postId}`} configId={s.selected!.id} readAction={s.selected?.mode==='XHS_MCP'&&s.post?.versions[0]?<SavedPostRead config={s.selected} savedPostId={s.post.versions[0].id} title={s.post.title} sourceAvailable={s.post.versions[0].sourceAvailable===true}/>:undefined} platform={s.selected!.platform} post={s.post} id={s.postId} onBack={s.back} onRefresh={()=>void s.archive.refetch()}/>:<div className="info-post-list" aria-label="已采集帖子">{s.visible.map(p=><CollectionPostCard key={p.id} post={p} platform={s.selected!.platform} onOpen={()=>{scroll.current={inner:root.current?.scrollTop||0,outer:window.scrollY};returnTo.current=p.id;s.open(p);root.current?.scrollTo({top:0});window.scrollTo({top:0});}}/>)}{!s.visible.length&&<p role="status">当前筛选下没有帖子原文。</p>}</div>}
 {!s.postId&&<div className="action-row info-pagination"><Button variant="outline" disabled={!s.offset} onClick={()=>s.setPage(Math.max(0,s.offset-20))}>上一页帖子</Button><span>帖子列表第 {s.offset/20+1} 页{d.hasMore?" · 还有下一页":""}</span><Button variant="outline" disabled={!d.hasMore||s.offset>=100000} onClick={()=>s.setPage(s.offset+20)}>下一页帖子</Button></div>}
 <details className="info-boundaries"><summary>数据范围与分析{d.legacyWithoutSnapshot>0?" · 有历史原文缺失":""}</summary>{d.legacyWithoutSnapshot>0&&<p role="status">当前关键词组共有 {d.legacyWithoutSnapshot} 条历史观察缺少原文，无法重建；不是当前帖的缺失评论数。</p>}<p>{s.postId?'当前帖子':`当前配置（含所有保存版本）`}共 {d.total} 个评论上下文版本。帖子列表按平台帖子ID去重，每页最多20篇；搜索覆盖已保存帖子、评论和昵称，任务筛选按首次/最近观察归属。进入帖子后连续加载该帖已保存评论，每条默认展示最新保存版本；不同原文版本仍可查看。卡片和详情标题是该帖累计去重已保存数，不是平台总数。帖子详情的评论搜索与筛选覆盖该帖已保存数据，与列表任务筛选无关。已采集数量不是平台总数，不同内容版本保留。</p><p>封面仅保存来源图片地址，不是永久文件备份；地址失效时显示占位。</p><p>LLM {d.control.enabled?'已开启 · 外发仍需逐批确认':'关闭 · 原文仍可浏览'}。真实发送关闭。</p><Button variant="ghost" onClick={()=>setAnalysis(v=>!v)} aria-expanded={analysis}>语义分析与 LLM 开关</Button>{analysis&&s.selected&&<SemanticReviewPanel key={s.selected.id} configId={s.selected.id}/>}</details>
 </>}
 </>}
 </section>;
}
