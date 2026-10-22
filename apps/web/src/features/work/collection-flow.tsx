import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {ErrorNotice,Loading} from '@/components/feedback';
import {ConfigEditor} from '@/features/collection/config-editor';
import {useMcpReadiness,useConfig} from '@/features/collection/use-collection';
import {useArchivePage,coverageLabel} from '@/features/collection/archive-data';
import {reasonLabels,runLabels,type Config} from '@/features/collection/types';
import {RunStats} from '@/features/collection/run-stats';
import {shouldRefreshRun} from '@/features/collection/mode';
import {collectionPreflight,preflightText} from './collection-preflight';
import {CollectionLauncher} from './collection-launcher';
export function CollectionFlow({configs,loading,initialId,onAccounts,onSettings,onResults,onSelect}:{configs:Config[];loading:boolean;initialId?:string;onAccounts:()=>void;onSettings:()=>void;onResults:()=>void;onSelect:(id:string)=>void}){
 const readiness=useMcpReadiness(),[choice,setChoice]=useState(initialId||''),[create,setCreate]=useState(false),[dirty,setDirty]=useState(false);
 const selected=configs.find(c=>c.id===choice)||configs.find(c=>c.id===initialId)||configs.find(c=>c.enabled)||configs[0];
 const status=collectionPreflight(selected,readiness.data,loading||readiness.isPending);
 const discard=()=>!dirty||window.confirm('关键词配置尚未保存，确定放弃修改吗？');
 if(status==='loading')return <Loading/>;
 return <section className="collection-flow"><header className="list-heading"><div><h1>自动化采集</h1><p>只补缺项，保留本轮账号授权。保存不启动，模型不是基础采集门槛。</p></div><Button variant="outline" onClick={onResults}>采集结果</Button></header>
 <ErrorNotice error={readiness.error}/>
 <div className="collection-runbar">{!!configs.length&&<label>搜索关键词组<select aria-label="启动搜索关键词组" value={selected?.id||''} onChange={e=>{if(discard()){setChoice(e.target.value);onSelect(e.target.value);setCreate(false);}}}>{configs.map(c=><option key={c.id} value={c.id}>{c.name}{c.enabled?'':' · 已暂停'}</option>)}</select></label>}<Button variant="ghost" onClick={()=>{if(discard())setCreate(v=>!v);}}>{create?'返回已保存配置':'新增关键词组'}</Button><Button variant="ghost" onClick={onSettings}>管理搜索与可选模型</Button></div>
 {create||status==='keywords'?<ConfigEditor key={create?'new':selected?.id||'new'} config={create?undefined:selected} availableMode={readiness.data?.enabled?readiness.data.mode:null} onDirty={setDirty} onClose={()=>setCreate(false)} onSaved={c=>{setChoice(c.id);onSelect(c.id);setCreate(false);}}/>:<>
 <p className="flow-status" role="status">{preflightText[status]}</p>
 {(status==='account'||status==='device')?<div className="flow-missing"><h2>{status==='account'?'仅需补充可用账号':'仅需恢复执行设备'}</h2><p>关键词已保存：{selected?.keywords.join(' / ')}。账号状态只读取本地记录；平台登录及会话核验需由你主动进行，执行时后台再次检查。</p><Button onClick={onAccounts}>前往账号中心{status==='account'?'登录或恢复会话':'检查设备'}</Button><Button variant="outline" onClick={()=>void readiness.refetch()}>刷新本地就绪状态</Button><p>处理后从固定“采集任务”入口返回；原关键词不会丢失。</p></div>:status==='paused'||status==='backoff'?<div className="flow-missing"><p>{reasonLabels[selected?.pauseReason||'']||selected?.pauseReason||'请核查所选配置状态'}</p><Button onClick={onSettings}>核查搜索配置</Button></div>:<CollectionLauncher key={selected?.id||'none'} configs={selected?[selected]:[]} loading={false} initialId={selected?.id} runsOpen={false} onRuns={onResults}/>}
 {selected&&<LiveCollectionHistory config={selected} onResults={onResults}/>}
 </>}
 </section>;
}
function LiveCollectionHistory({config,onResults}:{config:Config;onResults:()=>void}){
 const detail=useConfig(config.id),archive=useArchivePage(config.id,0,shouldRefreshRun(config,Date.now()));
 const latest=config.runs[0],posts=(archive.data?.posts||[]).filter(p=>p.lastRunId===latest?.id);
 return <section className="live-collection-history" aria-label="实际采集进度"><h2>运行详情与归档</h2>{latest?<><strong>{runLabels[latest.status]||latest.status} · {latest.id}</strong><RunStats run={latest}/><p>停止原因：{reasonLabels[latest.reason||'']||latest.reason||(['RUNNING','QUEUED'].includes(latest.status)?'本轮尚未结束':'未记录额外原因')}</p><p className="helper-text">当前接口仅提供运行状态与已保存原文，没有逐步骤、逐帖实时游标；不推测当前正在读取哪篇。评论/回复拆分以本轮提交的统计为准，期间增量计数可能未拆分。</p><h3>本轮最近已归档帖子</h3>{posts.map(p=><article key={p.id}><strong>{p.snapshot.title||'标题缺失'}</strong><span>{coverageLabel(p.coverage)} · {reasonLabels[p.stopReason||'']||p.stopReason||'窗口结束'}</span></article>)}{!posts.length&&<p>当前原文页尚无本轮已保存帖子，不等同于零读取。</p>}</>:<p>尚未运行。只有你主动确认后才会开始；不会因进入页面采集。</p>}<ErrorNotice error={archive.error||detail.error}/><Button variant="outline" onClick={onResults}>打开独立采集结果</Button><details><summary>任务历史（最近 20 轮）</summary>{(detail.data?.runs||config.runs).map(r=><article key={r.id}><strong>{runLabels[r.status]||r.status} · {new Date(r.createdAt).toLocaleString()}</strong><RunStats run={r}/><p>{reasonLabels[r.reason||'']||r.reason}</p></article>)}</details><p className="helper-text">本轮暂停即停止继续读取并保留已采原文；精准断点恢复尚未提供，勿把新批次当作无损续采。</p></section>;
}
