import { Alert, AlertDescription } from '@/components/ui/alert';
import { FormField } from '@/components/form-field';
import { Checkbox } from '@/components/ui/checkbox';
import { SelectField, SelectOption } from '@/components/select-field';
import {accountOptionName,collectionAccountReason} from '@/features/accounts/account-presentation';
import {InfoSection} from '@/components/information-panel';
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
 return <><Button ref={trigger} variant="outline" size="sm" disabled={!sourceAvailable} onClick={()=>{state.reset();setOpen(true);}}>重新读取此帖</Button>{!sourceAvailable&&<small>需有效原文引用</small>}{runId&&<p role="status">本帖读取已提交，<Link to="/work?module=runs">查看采集进度</Link></p>}
 <Sheet open={open} onOpenChange={value=>{if(!state.mutation.isPending)setOpen(value);}}><SheetContent className="task-settings-sheet" onCloseAutoFocus={e=>{e.preventDefault();trigger.current?.focus({preventScroll:true});}}><SheetHeader><SheetTitle>仅重新读取这一帖</SheetTitle><SheetDescription>{savedTitleLabel(title)} · 保存新增原文，已有记录保留。</SheetDescription></SheetHeader><div className="task-settings-body">
 <p>仅定向读取此帖，不执行搜索；优先恢复未完成进度，已有原文保留。匹配与回复仍按各自已授权规则执行。</p>
 <p role="status" aria-live="polite">{state.reviewNotice.text}</p>
 <InfoSection  title={<>恢复选项</>}><FormField className="check-label" style={{display:'flex',alignItems:'flex-start',gap:8,marginTop:12}}><Checkbox style={{width:'auto',flexShrink:0,marginTop:3}}  checked={state.restartCheckpoint} disabled={state.mutation.isPending||state.uncertain} onCheckedChange={e=>{state.setRestartCheckpoint((e === true));state.setConsent(false);}}/>从头重新核对，保留所有已存原文</FormField></InfoSection>
 <FormField>执行账号<SelectField aria-label="定向读取账号" value={state.selected} disabled={state.mutation.isPending||state.uncertain} onValueChange={e=>state.setAccount(e)}><SelectOption value="">请选择可用账号</SelectOption>{state.readiness.data?.accounts?.map(a=><SelectOption key={a.id} value={a.id} disabled={!a.eligible}>{accountOptionName(a,state.readiness.data?.accounts)}{!a.eligible&&` · ${collectionAccountReason(a)}`}</SelectOption>)}</SelectField></FormField>
 {open&&!state.mutation.isPending&&!state.uncertain&&!state.accepted&&state.reason&&<p role="status">{state.reason}。<Link to="/work?module=accounts">账号中心</Link></p>}
 <FormField className="check-label"><Checkbox  aria-label="授权重新读取此帖" disabled={!!state.reason||state.mutation.isPending||state.uncertain} checked={state.consent} onCheckedChange={e=>state.setConsent((e === true))}/>使用所选账号的本机会话，仅重新读取这篇并保存结果。</FormField>
 <ErrorNotice error={state.mutation.error}/>{state.uncertain&&<Alert role="alert"><AlertDescription>未确认是否已创建任务，请关闭后查看运行历史，不要重复提交。</AlertDescription></Alert>}
 <Button disabled={!!state.reason||!state.consent||state.mutation.isPending||state.uncertain||state.accepted} onClick={state.submit}>{state.mutation.isPending?'正在提交…':'确认读取此帖'}</Button>
 </div></SheetContent></Sheet></>;
}
