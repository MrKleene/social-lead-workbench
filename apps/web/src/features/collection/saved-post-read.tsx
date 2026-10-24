import {useRef,useState} from 'react';
import {Link} from 'react-router-dom';
import {Button} from '@/components/ui/button';
import {ErrorNotice} from '@/components/feedback';
import {Sheet,SheetContent,SheetHeader,SheetTitle,SheetDescription} from '@/components/ui/sheet';
import {useSavedPostRead} from './use-saved-post-read';
import {savedTitleLabel} from './saved-text';
import type {Config} from './types';
export function SavedPostRead({config,savedPostId,title,sourceAvailable}:{config:Config;savedPostId:string;title:string;sourceAvailable:boolean}){
 const [open,setOpen]=useState(false),[runId,setRunId]=useState(''),trigger=useRef<HTMLButtonElement>(null);
 const state=useSavedPostRead(config,savedPostId,open,id=>{setRunId(id);setOpen(false);});
 return <><Button ref={trigger} variant="outline" disabled={!sourceAvailable} onClick={()=>{state.reset();setOpen(true);}}>重新读取此帖</Button>{!sourceAvailable&&<small>需有效原文引用</small>}{runId&&<p role="status">本帖读取已提交，<Link to="/work?module=runs">查看采集进度</Link></p>}
 <Sheet open={open} onOpenChange={value=>{if(!state.mutation.isPending)setOpen(value);}}><SheetContent className="task-settings-sheet" onCloseAutoFocus={e=>{e.preventDefault();trigger.current?.focus({preventScroll:true});}}><SheetHeader><SheetTitle>仅重新读取这一帖</SheetTitle><SheetDescription>{savedTitleLabel(title)} · 保存新增原文，已有记录保留。</SheetDescription></SheetHeader><div className="task-settings-body">
 <p>不执行搜索。分块保存，优先恢复未完成的读取；达到限额会保留进度，不调用模型或发送消息。</p>
 <details><summary>恢复选项</summary><label className="check-label" style={{display:'flex',alignItems:'flex-start',gap:8,marginTop:12}}><input style={{width:'auto',flexShrink:0,marginTop:3}} type="checkbox" checked={state.restartCheckpoint} disabled={state.mutation.isPending||state.uncertain} onChange={e=>{state.setRestartCheckpoint(e.target.checked);state.setConsent(false);}}/>从头重新核对，保留所有已存原文</label></details>
 <label>执行账号<select aria-label="定向读取账号" value={state.selected} disabled={state.mutation.isPending||state.uncertain} onChange={e=>state.setAccount(e.target.value)}><option value="">请选择可用账号</option>{state.readiness.data?.accounts?.map(a=><option key={a.id} value={a.id} disabled={!a.eligible}>{a.label}{a.eligible?'':' · 待核验'}</option>)}</select></label>
 {open&&!state.mutation.isPending&&!state.uncertain&&!state.accepted&&state.reason&&<p role="status">{state.reason}。<Link to="/work?module=accounts">账号中心</Link></p>}
 <label className="check-label"><input type="checkbox" aria-label="授权重新读取此帖" disabled={!!state.reason||state.mutation.isPending||state.uncertain} checked={state.consent} onChange={e=>state.setConsent(e.target.checked)}/>使用所选账号的本机会话，仅重新读取这篇并保存结果。</label>
 <ErrorNotice error={state.mutation.error}/>{state.uncertain&&<p role="alert">未确认是否已创建任务，请关闭后查看运行历史，不要重复提交。</p>}
 <Button disabled={!!state.reason||!state.consent||state.mutation.isPending||state.uncertain||state.accepted} onClick={state.submit}>{state.mutation.isPending?'正在提交…':'确认读取此帖'}</Button>
 </div></SheetContent></Sheet></>;
}
