import {useSearchParams} from '@/lib/router-compat';
import {Button} from '@/components/ui/button';
import {LocalHistory} from './local-history';
import {LocalReceivePanel} from './local-platform';
import {useLocalRecords,useLocalAction} from './use-local-records';

function LocalCommentNotifications(){
 const [params,setParams]=useSearchParams(),page=Math.max(1,Number(params.get('page'))||1);
 const messages=useLocalRecords('inboxPage',{page,channel:'COMMENT',accountId:params.get('account')||undefined,unread:params.get('unread')==='1',query:params.get('query')||''});
 const read=useLocalAction('markRead'),changePage=(n:number)=>setParams(p=>{p.set('page',String(n));return p;});
 return <section className="local-panel"><h2>评论通知</h2><p>这里显示已保存的入站评论通知。查看与标记已读只影响本机记录；回复须经过原文读取、审核与精确发送授权。</p>{(messages.error||read.error)&&<p role="alert">{(messages.error||read.error)?.message}</p>}
 {messages.isPending?<p>正在读取…</p>:!messages.data?.total?<p className="local-empty">没有符合筛选条件的评论通知。</p>:null}
 <ul className="local-config-list">{messages.data?.items.map(m=><li key={m.id}><div><strong>{m.sender_name||'未命名用户'}{m.unread?' · 未读':''}</strong><small>{m.post_title||'未记录笔记标题'} · {new Date(m.received_at).toLocaleString()}</small><p>{m.content_type==='TEXT'?m.body:'当前不支持展示此消息类型'}</p>{!!m.unread&&<Button variant="outline" pending={read.isPending} onClick={()=>read.mutate({id:m.id})}>标记已读</Button>}</div></li>)}</ul>
 {(messages.data?.total??0)>30&&<nav className="local-actions" aria-label="评论通知分页"><Button disabled={page===1} onClick={()=>changePage(page-1)}>上一页</Button><span>{page} / {Math.ceil((messages.data?.total??0)/30)}</span><Button disabled={page*30>=(messages.data?.total??0)} onClick={()=>changePage(page+1)}>下一页</Button></nav>}</section>;
}
export function LocalInboxPage(){
 const status=useLocalRecords('status'),accounts=useLocalRecords('accounts'),[params,setParams]=useSearchParams(),comments=params.get('view')==='comments';
 const change=(key:string,value:string)=>setParams(previous=>{const next=new URLSearchParams(previous);value?next.set(key,value):next.delete(key);next.delete('page');return next;},{replace:true,flushSync:true});
 return <><h1>消息通知</h1><div className="local-actions" aria-label="消息类型"><Button variant={comments?'outline':'default'} aria-pressed={!comments} onClick={()=>change('view','')}>私信会话</Button><Button variant={comments?'default':'outline'} aria-pressed={comments} onClick={()=>change('view','comments')}>评论通知</Button></div>
 <div className="local-filterbar"><label>接收账号<select aria-label="接收账号" value={params.get('account')||''} onChange={e=>change('account',e.target.value)}><option value="">全部账号</option>{accounts.data?.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label><label>搜索消息<input aria-label="搜索消息" value={params.get('query')||''} onChange={e=>change('query',e.target.value)} placeholder="正文或用户昵称"/></label><label><input type="checkbox" checked={params.get('unread')==='1'} onChange={e=>change('unread',e.target.checked?'1':'')}/>仅未读</label></div>
 {comments?<LocalCommentNotifications/>:<LocalHistory tab="conversations"/>}<section className="local-panel"><LocalReceivePanel credentialsAvailable={!!status.data?.credentialsAvailable}/></section></>;
}
