import {useEffect,useState} from 'react';
import {Button} from '@/components/ui/button';
import {ErrorNotice,Loading} from '@/components/feedback';
import {ApiError} from '@/lib/api';
import {formatDate} from '@/lib/types';
import {useConfig} from './use-collection';
import {useArchivePage,belongsToRun,coverageLabel} from './archive-data';
import {SemanticReviewPanel} from './semantic-review-panel';
import {RunStats} from './run-stats';
import {reasonLabels,runLabels,type Config} from './types';
export function CollectionResults({configs,initialId,onSettings}:{configs:Config[];initialId?:string;onSettings:()=>void}){
 const [choice,setChoice]=useState(initialId||''),[offset,setOffset]=useState(0),[search,setSearch]=useState(''),[runId,setRun]=useState(''),[postId,setPost]=useState(''),[kind,setKind]=useState('all'),[analysis,setAnalysis]=useState(false);
 useEffect(()=>{if(initialId){setChoice(initialId);setOffset(0);setRun('');setPost('');setAnalysis(false);}},[initialId]);
 const selected=configs.find(c=>c.id===choice)||configs.find(c=>c.id===initialId)||configs[0];
 const archive=useArchivePage(selected?.id,offset),history=useConfig(selected?.id),d=archive.data;
 const runs=history.data?.runs||selected?.runs||[];
 const activeRun=runs.find(r=>r.id===runId);
 const items=(d?.items||[]).filter(c=>belongsToRun(c,runId)&&(!postId||c.snapshot.postId===postId)&&(kind==='all'||(kind==='reply'?!!c.snapshot.parentId:!c.snapshot.parentId))&&`${c.snapshot.title} ${c.snapshot.body} ${c.snapshot.comment} ${c.snapshot.parent||''}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
 // API already deduplicates each content/context version. Keep distinct versions visible.
 const posts=new Map((d?.posts||[]).filter(p=>belongsToRun(p,runId)).map(p=>[p.platformPostId,{id:p.platformPostId,title:p.snapshot.title}]));
 for(const c of d?.items||[])if(belongsToRun(c,runId))posts.set(c.snapshot.postId,{id:c.snapshot.postId,title:c.snapshot.title});
 const changeConfig=(id:string)=>{setChoice(id);setOffset(0);setRun('');setPost('');setAnalysis(false);};
 return <section className="collection-results" aria-label="独立采集结果"><header className="list-heading"><div><h1>采集结果</h1><p>帖子、评论与回复独立留存。无需模型或 CRM，缺失原文不补猜。</p></div><Button variant="outline" onClick={()=>void archive.refetch()}>刷新原文</Button></header>
 {!configs.length?<div className="empty-state"><h2>还没有采集配置</h2><p>保存关键词并主动完成有限批次后，实际读到的原文会出现在这里。</p><Button onClick={onSettings}>配置关键词</Button></div>:<>
 <div className="archive-filters"><label>搜索配置<select aria-label="结果搜索配置" value={selected?.id||''} onChange={e=>changeConfig(e.target.value)}>{configs.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>任务历史<select aria-label="结果任务历史" value={runId} onChange={e=>{setRun(e.target.value);setPost('');}}><option value="">全部已保存版本</option>{runs.map(r=><option key={r.id} value={r.id}>{formatDate(r.createdAt)} · {runLabels[r.status]||r.status}</option>)}</select></label><label>搜索当前页原文<input aria-label="搜索采集原文" value={search} onChange={e=>setSearch(e.target.value)} placeholder="帖子、评论、父评论"/></label><label>评论层级<select aria-label="评论层级" value={kind} onChange={e=>setKind(e.target.value)}><option value="all">一级评论与回复</option><option value="root">一级评论</option><option value="reply">回复</option></select></label></div>
 {activeRun&&<section className="archive-run"><strong>{runLabels[activeRun.status]||activeRun.status} · {activeRun.id}</strong><RunStats run={activeRun}/><p>{reasonLabels[activeRun.reason||'']||activeRun.reason||'没有额外停止原因记录'}</p></section>}
 <p className="helper-text">任务原文按首次/最近观察归属展示；旧版未保存每次观察关联，不能还原中间每轮完整快照。搜索与帖子筛选限定当前 50 条评论页及最近 20 个帖子版本；下一页继续查阅。相同内容与上下文自动去重，不同版本保留。</p>
 {archive.isPending?<Loading/>:archive.error instanceof ApiError&&archive.error.status===404?<p role="status">原文接口尚未部署；不会自动采集或修改数据。</p>:archive.isError?<ErrorNotice error={archive.error}/>:d&&<>
 <div className="archive-summary"><span>已保存 {d.postTotal} 个帖子版本 / {d.total} 个评论上下文版本</span><span>LLM {d.control.enabled?'已开启 · 外发仍需逐批确认':'关闭 · 仅归档'}</span><Button variant="ghost" onClick={()=>setAnalysis(v=>!v)} aria-expanded={analysis}>语义分析与 LLM 开关</Button></div>
 {d.legacyWithoutSnapshot>0&&<p role="status">{d.legacyWithoutSnapshot} 条历史记录缺少原文，无法重建，不会自动补采。</p>}
 <div className="archive-reader"><aside aria-label="已归档帖子"><button className={!postId?'selected':''} onClick={()=>setPost('')}>当前页全部帖子</button>{[...posts.values()].map(p=><button className={postId===p.id?'selected':''} key={p.id} onClick={()=>setPost(p.id)}>{p.title||'标题缺失'}</button>)}{!posts.size&&<p>此页尚无已保存帖子。</p>}</aside><div className="archive-evidence">
 {(d.posts||[]).filter(p=>belongsToRun(p,runId)&&(!postId||p.platformPostId===postId)).map(p=><details key={p.id}><summary>{p.snapshot.title||'标题缺失'} · 帖子原文</summary><p>{p.snapshot.body||'帖子正文未获取'}</p><small>{coverageLabel(p.coverage)} · {reasonLabels[p.stopReason||'']||p.stopReason||'窗口结束'} · {formatDate(p.lastSeenAt)}</small></details>)}
 {items.map(c=><article key={c.id} className="archive-comment"><div className="source-flags"><span>{c.snapshot.parentId?'回复':'一级评论'}</span><span>{coverageLabel(c.post.coverage)}</span><span>{c.snapshot.isDemo?'虚构样本':'平台原文'}</span></div><h3>{c.snapshot.title||'帖子标题缺失'}</h3><p className="archive-original">{c.snapshot.comment}</p><small>{c.reviews.length?'已有语义队列或结果':'未分析 · 无评分'} · {reasonLabels[c.post.stopReason||'']||c.post.stopReason||'窗口结束'}</small><details><summary>查看上下文与原文证据</summary><p>帖子正文：{c.snapshot.body||'未获取'}</p><blockquote>父评论：{c.snapshot.parent??(c.snapshot.parentId?'原文未采到，需待确认':'一级评论，无父评论')}</blockquote><p>来源帖子 {c.snapshot.postId} · 评论 {c.snapshot.commentId}</p><p>上下文版本 {c.contextVersion} · 最近观察 {formatDate(c.lastSeenAt)}</p>{c.reviews.map(r=><div key={r.id}><p>规则版本 {r.revision} · {r.selectedModel||'未指定模型'} · {r.score===null?'暂无可信评分':`${r.score} / 100 · 排序分，非概率`}</p><p>{r.reason}</p>{r.result?.evidence.map((e,i)=><blockquote key={i}>{e.source}：{e.quote}</blockquote>)}</div>)}</details></article>)}
 {!items.length&&<p role="status">当前页和筛选条件下没有评论原文。可清除筛选或翻页；这不表示任务没有读取，也不会自动重新采集。</p>}</div></div>
 <div className="action-row"><Button variant="outline" disabled={!offset} onClick={()=>setOffset(v=>Math.max(0,v-50))}>上一页原文</Button><span>评论页 {offset/50+1} · 当前筛选 {items.length} 条</span><Button variant="outline" disabled={!d.hasMore} onClick={()=>setOffset(v=>v+50)}>下一页原文</Button></div><p className="helper-text">未知总量不显示百分比；完整分页、精准补采和持续多账号尚未验收。真实评论与私信发送保持关闭。</p>
 {analysis&&selected&&<SemanticReviewPanel key={selected.id} configId={selected.id}/>}
 </>}
 </>}
 </section>;
}
