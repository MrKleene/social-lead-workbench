import {commentCoverage} from '../collection/collection-outcome';
import {savedTitleLabel} from '@/features/collection/saved-text';
import {useEffect,useRef,useState} from 'react';
import {safePostCoverUrl,safeRunCoverage,type RunPostItem} from '@crm/contracts';
import {Button} from '@/components/ui/button';
import {Sheet,SheetContent,SheetHeader,SheetTitle,SheetDescription} from '@/components/ui/sheet';
import {SavedText,savedSourceText} from '@/features/collection/saved-text';
import {displayPublication,readingTime} from '@/features/collection/display-metadata';
import {type Run} from '@/features/collection/types';
import {useRunPostFeed} from './use-run-post-feed';
import './run-post-stream.css';
function PostCover({url}:{url?:string}){
 const safe=safePostCoverUrl(url),[failed,setFailed]=useState('');
 return safe&&failed!==safe?<img className="run-post-cover" src={safe} alt="已保存帖子封面" loading="lazy" referrerPolicy="no-referrer" crossOrigin="anonymous" onError={()=>setFailed(safe)}/>:null;
}
function PostFacts({post:p,run}:{post:RunPostItem;run:Run}){
 const evidence=safeRunCoverage(run.metrics?.coverage)?.posts.find(item=>item.postRef===p.platformPostId);
 const coverage=commentCoverage(evidence?.recovery?.remainingAnchors?undefined:evidence?.boundedRead,p.stopReason,p.savedCount);
 const published=displayPublication(p.publishedAt);
 return <><p className="run-post-counts">{p.confirmedRecovery?'本次确认':'已保存'} {p.savedCount??'数量待确认'} 条评论/回复 <span>{p.rootCount===null?'一级评论数待确认':`${p.rootCount} 条一级评论`} · {p.replyCount===null?'回复数待确认':`${p.replyCount} 条回复`}</span></p>
 <div className="run-post-meta" data-warning={coverage.warning}><span>{coverage.label}</span>{coverage.declared!==null&&<span>平台声明 {coverage.declared} 条{coverage.difference?` · 差 ${coverage.difference} 条原因未确认`:""}</span>}{coverage.issue&&<span>{coverage.issue}</span>}<span>新存 {p.newCount??'待确认'} · 复用 {p.reusedCount??'待确认'} 份原文</span></div>
 <div className="run-post-times">{published&&<time dateTime={published}>发布 {readingTime(published)}</time>}<time dateTime={p.savedAt}>采集更新 {readingTime(p.savedAt)}</time><span>北京时间</span></div></>;
}
export function RunPostStream({configId,run,visible}:{configId:string;run:Run;visible:boolean}){
 const feed=useRunPostFeed(configId,run,visible),data=feed.data,items=data?.items||[];
 const viewport=useRef<HTMLDivElement>(null),following=useRef(true),previous=useRef<string[]>([]),returnFocus=useRef<HTMLButtonElement|null>(null);
 const [unseen,setUnseen]=useState(false),[selected,setSelected]=useState('');
 const detail=items.find(p=>p.platformPostId===selected);
 useEffect(()=>{
  const ids=items.map(p=>p.platformPostId),added=ids.some(id=>!previous.current.includes(id));
  if(added&&previous.current.length){if(following.current)viewport.current?.scrollTo({top:viewport.current.scrollHeight,behavior:'instant'});else setUnseen(true);}
  previous.current=ids;
 },[items]);
 if(feed.isPending)return <p className="run-post-notice" role="status">正在读取本轮已保存帖子…</p>;
 if(feed.unsupported)return <p className="run-post-notice" role="status">逐篇明细需后台升级；本轮总进度仍可查看。</p>;
 if(data?.availability==='SUPERSEDED')return <p className="run-post-notice">旧任务未保留完整的逐篇快照，请从采集信息查看现存原文。</p>;
 return <section className="run-post-feed" aria-label="本轮帖子信息流">
  <div className="run-post-feed-head"><span>已保存帖子 · {items.length} 篇</span><button onClick={()=>void feed.refetch()} className="info-text-action">刷新帖子</button></div>
  {feed.isError&&<p role="alert" className="run-post-notice">帖子明细读取失败，已有内容可能未更新。<button onClick={()=>void feed.refetch()}>重试</button></p>}
  {data?.limited&&<p className="run-post-notice">明细超出本次返回范围，数量暂不汇总。</p>}
  <div ref={viewport} tabIndex={0} role="region" aria-label="逐篇帖子列表" className="run-post-list" onScroll={e=>{const el=e.currentTarget;following.current=el.scrollHeight-el.clientHeight-el.scrollTop<64;if(following.current)setUnseen(false);}}>
   {items.map((p,i)=><article key={p.platformPostId} data-run-post={p.platformPostId} className="run-post-card"><div className="run-post-number">{p.readOrdinal?`读取 ${p.readOrdinal}`:`存档 ${i+1}`} </div><div className="run-post-content"><div className="run-post-title-row"><button className="run-post-title" onClick={e=>{returnFocus.current=e.currentTarget;setSelected(p.platformPostId);}}>{savedTitleLabel(p.title)}</button><PostCover url={p.coverUrl}/></div><SavedText text={savedSourceText(p.body)} limit={180} label="正文"/><PostFacts post={p} run={run}/></div></article>)}
   {!items.length&&!feed.isError&&<p className="run-post-notice">{['RUNNING','QUEUED'].includes(run.status)?'等待首篇帖子返回；不会预猜正在读取的内容。':'本轮没有可返回的帖子原文。'}</p>}
  </div>
  {unseen&&<Button className="run-post-new" variant="outline" onClick={()=>{following.current=true;viewport.current?.scrollTo({top:viewport.current.scrollHeight,behavior:'instant'});setUnseen(false);}}>有新帖子 · 查看</Button>}
  {!!items.length&&<small className="run-post-footnote">{items.every(p=>p.readOrdinal)?'按本次读取顺序 · 与覆盖证据逐帖对应':'历史未记录读取关联，存档序号不是读取序号'} · 数量包含本轮确认的已存原文，不代表平台总评论数</small>}
  <Sheet open={!!detail} onOpenChange={open=>{if(!open)setSelected('');}}><SheetContent className="task-settings-sheet run-post-detail" onCloseAutoFocus={e=>{e.preventDefault();returnFocus.current?.focus({preventScroll:true});}}><SheetHeader><SheetTitle>{savedTitleLabel(detail?.title)}</SheetTitle><SheetDescription>本轮已保存内容；关闭后返回原位置。</SheetDescription></SheetHeader>{detail&&<div className="task-settings-body"><PostCover url={detail.coverUrl}/><p className="run-post-full">{savedSourceText(detail.body)}</p><PostFacts post={detail} run={run}/></div>}</SheetContent></Sheet>
 </section>;
}
