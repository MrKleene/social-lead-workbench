import {ToggleGroup,ToggleGroupItem} from '@/components/ui/toggle-group';
import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {Fragment,useCallback,useEffect,useLayoutEffect,useRef,useState,type KeyboardEvent} from 'react';
import {MoreHorizontal,Search} from 'lucide-react';
import {CommentContextSheet,type ContextRequest} from './comment-context-sheet';
import {commentThread,replyGroups} from './comment-thread';
import {replyTargetFor} from './reply-target';
import {SavedAvatar} from './saved-avatar';
import {SavedText,savedSourceText} from './saved-text';
import {displayNickname,displayPublication,readingTime} from './display-metadata';
import {useSavedCommentStream,type StreamComment} from './use-saved-comment-stream';
import type {ArchivedComment} from './archive-data';

export function SavedCommentConversation({configId,postId,declared,observedScope=false,refreshVersion,onEvidence}:{configId:string;postId:string;declared?:number|null;observedScope?:boolean;refreshVersion:number;onEvidence:(c:ArchivedComment,button:HTMLButtonElement)=>void}){
 const [search,setSearch]=useState(''),[query,setQuery]=useState(''),[kind,setKind]=useState<'all'|'roots'|'replies'>('all');
 const [expanded,setExpanded]=useState<Record<string,number>>({}),[context,setContext]=useState<ContextRequest|null>(null);
 const stream=useSavedCommentStream(configId,postId,query,kind),viewport=useRef<HTMLDivElement>(null),sentinel=useRef<HTMLDivElement>(null),nodes=useRef(new Map<string,HTMLElement>()),anchor=useRef<{id:string;top:number}|null>(null),lastRefresh=useRef(refreshVersion);
 useEffect(()=>{const timer=setTimeout(()=>setQuery(search.trim()),250);return()=>clearTimeout(timer);},[search]);
 useLayoutEffect(()=>{viewport.current?.scrollTo({top:0});setExpanded({});anchor.current=null;},[configId,postId,query,kind]);
 const load=useCallback(()=>{
  if(stream.isFetching||!stream.hasNextPage)return;
  const box=viewport.current;if(box){const first=[...nodes.current].find(([,n])=>!n.hidden&&n.getBoundingClientRect().bottom>box.getBoundingClientRect().top);anchor.current=first?{id:first[0],top:first[1].getBoundingClientRect().top-box.getBoundingClientRect().top}:null;}
  void stream.fetchNextPage({cancelRefetch:false});
 },[stream.isFetching,stream.hasNextPage,stream.fetchNextPage]);
 useEffect(()=>{if(lastRefresh.current!==refreshVersion){lastRefresh.current=refreshVersion;const box=viewport.current;if(box){const first=[...nodes.current].find(([,n])=>!n.hidden&&n.getBoundingClientRect().bottom>box.getBoundingClientRect().top);anchor.current=first?{id:first[0],top:first[1].getBoundingClientRect().top-box.getBoundingClientRect().top}:null;}void stream.reset();}},[refreshVersion,stream.reset]);
 useLayoutEffect(()=>{const a=anchor.current,box=viewport.current,node=a?nodes.current.get(a.id):undefined;if(a&&box&&node){box.scrollTop+=node.getBoundingClientRect().top-box.getBoundingClientRect().top-a.top;anchor.current=null;}},[stream.data]);
 useEffect(()=>{const node=sentinel.current,root=viewport.current;if(!node||!root||!stream.hasNextPage||stream.isError||stream.isFetching)return;const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting))load();},{root,rootMargin:'0px 0px 160px 0px'});observer.observe(node);return()=>observer.disconnect();},[load,stream.hasNextPage,stream.isError,stream.isFetching,stream.data]);
 const comments=stream.comments,rows=commentThread(comments),groups=replyGroups(rows),ends=new Map([...groups].map(([id,replies])=>[replies.at(-1)!.comment.id,{id,replies}]));
 const filtering=!!query||kind!=='all',hidden=new Set([...groups].flatMap(([id,replies])=>filtering?[]:replies.slice(expanded[id]||1).map(r=>r.comment.id)));
 const focus=(c:ArchivedComment)=>{const group=[...groups].find(([,replies])=>replies.some(r=>r.comment.id===c.id));if(group)setExpanded(v=>({...v,[group[0]]:group[1].length}));requestAnimationFrame(()=>{const n=nodes.current.get(c.id),box=viewport.current;if(!n||!box)return;n.focus({preventScroll:true});box.scrollTop+=n.getBoundingClientRect().top-box.getBoundingClientRect().top-8;});};
 const keys=(e:KeyboardEvent<HTMLDivElement>)=>{if(e.target!==e.currentTarget||e.altKey||e.ctrlKey||e.metaKey||!['Home','End'].includes(e.key))return;e.preventDefault();e.currentTarget.scrollTo({top:e.key==='Home'?0:e.currentTarget.scrollHeight});};
 const total=stream.summary;
 return <div className="info-conversation saved-conversation"><header className="info-conversation-heading"><div><h3>评论与回复 <span>{total?.total??'—'}</span></h3><p>已加载 {comments.length} 条{total?` · 累计已保存 ${total.total} 条`:''}{declared!=null?` · ${observedScope?'该轮平台声明':'平台声明'} ${declared} 条`:''}</p>{!observedScope&&declared!=null&&total&&declared!==total.total&&<p>声明与已保存相差 {Math.abs(declared-total.total)} 条，原因尚未确认</p>}</div>
 <div className="info-comment-tools"><ToggleGroup type="single" value={kind} onValueChange={value=>{if(value)setKind(value as typeof kind);}} className="info-comment-tabs" aria-label="筛选已保存评论">{([['all','全部',total?.total],['roots','主评论',total?.roots],['replies','回复',total?.replies]] as const).map(([value,label,n])=><ToggleGroupItem value={value} key={value}>{label}{n!==undefined&&<span>{n}</span>}</ToggleGroupItem>)}</ToggleGroup><FormField className="info-comment-search"><Search size={14}/><Input aria-label="搜索已保存评论或昵称" placeholder="搜索已保存评论或昵称" maxLength={200} value={search} onChange={e=>setSearch(e.target.value)}/></FormField></div>
 {filtering&&total&&<small className="info-filter-result" role="status">匹配 {total.matched} 条 · 已加载 {stream.matched.size} 条匹配结果{comments.length>stream.matched.size?' · 同时展示所属讨论上下文':''}</small>}</header>
 <div ref={viewport} className="info-comments" onKeyDown={keys} role="region" tabIndex={0} aria-label="已保存评论列表" aria-busy={stream.isFetching}>
 {rows.map(({comment:c,parent,parentAmbiguous},index)=>{const target=replyTargetFor(c,comments),group=ends.get(c.id),contextOnly=!stream.matched.has(c.platformCommentId);return <Fragment key={c.id}>
 <article hidden={hidden.has(c.id)} className="info-comment-row" data-comment={c.id} data-reply={!!c.snapshot.parentId} data-linked={!!parent} data-context={contextOnly} tabIndex={-1} ref={node=>{if(node)nodes.current.set(c.id,node);else nodes.current.delete(c.id);}}>
  <SavedAvatar url={c.snapshot.authorAvatarUrl}/><div className="info-comment-meta"><span className="info-comment-kind">{displayNickname(c.snapshot.authorNickname)||'昵称未采集'}{c.snapshot.isDemo&&<small>演示</small>}{contextOnly&&<small>讨论上下文</small>}</span><Button variant="ghost" size="content" className="info-comment-more" aria-label={`评论 ${index+1} 的来源与证据`} onClick={e=>onEvidence(c,e.currentTarget)}><MoreHorizontal size={17}/></Button></div>
  {target.state==='RESOLVED'&&target.comment?.id!==parent?.id&&<Button variant="ghost" size="content" className="info-direct-target" aria-label="查看回复对象" onClick={()=>focus(target.comment!)}>回复 {displayNickname(target.comment!.snapshot.authorNickname)||'该评论'}：</Button>}
  {target.state==='UNAVAILABLE'&&<Button variant="ghost" size="content" className="info-direct-target" onClick={e=>setContext({...c.snapshot.replyTarget!,label:'回复对象上下文',trigger:e.currentTarget})}>回复对象 · 查看已保存上下文</Button>}
  {target.state==='CONFLICT'&&<small className="info-parent-context">回复对象待核对</small>}
  <SavedText key={c.id} text={savedSourceText(c.snapshot.comment)} limit={360} label="评论"/>
  <div className="info-comment-footer"><time title="北京时间（UTC+8）" dateTime={displayPublication(c.snapshot.publishedAt)||c.lastSeenAt}>{displayPublication(c.snapshot.publishedAt)?'':'采集于 '}{readingTime(displayPublication(c.snapshot.publishedAt)||c.lastSeenAt)}</time>
  {c.snapshot.parentId&&!parent&&<Button variant="ghost" size="content" className="info-text-action" onClick={e=>setContext({commentId:c.snapshot.parentId!,label:'父评论上下文',fallback:c.snapshot.parent,trigger:e.currentTarget})}>{parentAmbiguous?'父评论版本待核对':'父评论未保存于本次读取范围'} · 查看上下文</Button>}
  {(c as StreamComment).savedVersions!>1&&<Button variant="ghost" size="content" className="info-text-action" onClick={e=>setContext({commentId:c.platformCommentId,label:'评论原文版本',trigger:e.currentTarget})}>{(c as StreamComment).savedVersions} 个保存版本</Button>}</div>
 </article>
 {!filtering&&group&&group.replies.length>1&&<Button variant="ghost" size="content" className="info-replies-toggle info-text-action" aria-expanded={(expanded[group.id]||1)>1} onClick={()=>setExpanded(v=>({...v,[group.id]:(v[group.id]||1)>=group.replies.length?1:Math.min((v[group.id]||1)+5,group.replies.length)}))}>{(expanded[group.id]||1)>=group.replies.length?'收起回复':`展开更多回复（${group.replies.length-(expanded[group.id]||1)}）`}</Button>}
 </Fragment>;})}
 {!stream.isFetching&&!stream.isError&&!comments.length&&<p className="info-comment-empty" role="status">{filtering?'没有符合筛选的已采集评论。':'暂无已保存评论。'} 不代表平台没有评论。</p>}
 <div ref={sentinel} className="info-stream-footer">{stream.isError?<div role="alert"><p>评论加载失败，已加载内容仍保留。</p><Button variant="ghost" size="content" onClick={()=>stream.isFetchNextPageError?load():void stream.refetch()}>重试加载评论</Button></div>:stream.isFetching?<p role="status">正在加载已保存评论…</p>:stream.hasNextPage?<Button variant="ghost" size="content" onClick={load}>加载更多已采集评论</Button>:total&&<p role="status">{filtering?'没有更多符合筛选的已采集评论':'没有更多已采集评论'}<small>仅代表本地已保存范围，不代表平台评论已采全。</small></p>}</div>
 </div><CommentContextSheet request={context} configId={configId} postId={postId} onClose={()=>setContext(null)}/></div>;
}
