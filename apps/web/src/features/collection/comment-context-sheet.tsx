import { Alert, AlertDescription } from '@/components/ui/alert';
import {InfoSection} from '@/components/information-panel';
import {useEffect,useRef,useState} from 'react';
import {api} from '@/lib/api';
import {Sheet,SheetContent,SheetHeader,SheetTitle,SheetDescription} from '@/components/ui/sheet';
import {SavedAvatar} from './saved-avatar';
import {SavedText,savedSourceText} from './saved-text';
import {displayNickname,displayPublication,readingTime} from './display-metadata';
import type {ArchivePage} from './archive-data';
import {readCommentContext,type ContextTarget,type ContextResult} from './comment-context';
export type ContextRequest=ContextTarget&{label:string;fallback?:string|null;trigger:HTMLButtonElement};
export function CommentContextSheet({request,configId,postId,onClose}:{request:ContextRequest|null;configId:string;postId:string;onClose:()=>void}){
 const lastRequest=useRef<ContextRequest|null>(null);if(request)lastRequest.current=request;const displayed=request||lastRequest.current;
 const [result,setResult]=useState<ContextResult>(),[error,setError]=useState(false);
 useEffect(()=>{
  if(!request)return;setResult(undefined);setError(false);
  const controller=new AbortController(),timer=window.setTimeout(()=>{setError(true);controller.abort();},20000);
  void readCommentContext(postId,request,offset=>api<ArchivePage>(`/collection/configs/${encodeURIComponent(configId)}/captures?offset=${offset}&postId=${encodeURIComponent(postId)}`,{signal:controller.signal}),controller.signal).then(setResult).catch(()=>{if(!controller.signal.aborted)setError(true);}).finally(()=>clearTimeout(timer));
  return()=>{clearTimeout(timer);controller.abort();};
 },[request,configId,postId]);
 return <Sheet open={!!request} onOpenChange={open=>{if(!open)onClose();}}><SheetContent className="task-settings-sheet info-context-sheet" onCloseAutoFocus={e=>{e.preventDefault();lastRequest.current?.trigger.focus({preventScroll:true});}}><SheetHeader><SheetTitle>{displayed?.label||'评论上下文'}</SheetTitle><SheetDescription>仅查找本帖已保存的原文，不重新采集。</SheetDescription></SheetHeader><div className="task-settings-body">
  {!result&&!error&&<p role="status">正在查找已保存上下文…</p>}
  {error&&<Alert role="alert"><AlertDescription>上下文读取失败，请关闭后重试。当前评论阅读位置未改变。</AlertDescription></Alert>}
  {result&&<><p role="status">{result.items.length?`找到 ${result.items.length} 个原文版本`:'当前查找范围内没有找到相关原文'}{!result.complete&&` · 已检查 ${result.scanned} 条记录，达到查找上限或分页未前进`}</p>{result.items.length>1&&<small>保留不同原文版本，不自动选择某一版。</small>}{result.items.map(c=><article className="info-context-record" key={c.id}><header><SavedAvatar url={c.snapshot.authorAvatarUrl}/><strong>{displayNickname(c.snapshot.authorNickname)||'昵称未采集'}</strong></header><SavedText text={savedSourceText(c.snapshot.comment)} limit={600} label="上下文原文"/><time>{displayPublication(c.snapshot.publishedAt)?'发布于':'采集于'} {readingTime(displayPublication(c.snapshot.publishedAt)||c.lastSeenAt)} · 北京时间</time>{c.snapshot.parent!=null&&<InfoSection  title={<>所属讨论的已保存上下文</>}><p>{savedSourceText(c.snapshot.parent)}</p></InfoSection>}</article>)}</>}
  {displayed?.fallback!=null&&<InfoSection  title={<>回复记录中保存的父评论</>}><SavedText text={savedSourceText(displayed.fallback)} limit={600} label="已保存父评论"/></InfoSection>}
  {result&&!result.complete&&<small>最多查找 500 条保存记录；未找到不代表原文不存在。未查到的记录不会被补写或替代。</small>}
 </div></SheetContent></Sheet>;
}
