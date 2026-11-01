import {postReadPresentation,type PostReadEvidence} from './post-read-presentation';
import {readingTime} from './display-metadata';
import {ShieldCheck} from 'lucide-react';
import {Badge} from '@/components/ui/badge';
import {Tooltip,TooltipTrigger,TooltipContent} from '@/components/ui/tooltip';
import { Disclosure } from '@/components/disclosure';
import { FormField } from '@/components/form-field';
import { SelectField, SelectOption } from '@/components/select-field';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {useRef,useState} from 'react';
import {postReasonLabels,unknownPostAvailability,type PostAvailabilityView} from '@crm/contracts';
import {Sheet,SheetContent,SheetHeader,SheetTitle,SheetDescription} from '@/components/ui/sheet';
import {Button} from '@/components/ui/button';
import {ErrorNotice,Loading} from '@/components/feedback';
import {usePostAvailability} from './use-post-availability';
import './post-availability.css';
export function PostStateTag({value=unknownPostAvailability,readEvidence}:{value?:PostAvailabilityView;readEvidence?:PostReadEvidence}){const view=postReadPresentation(readEvidence,value);return <Tooltip><TooltipTrigger asChild><Badge variant="outline" className="post-state-tag" data-state={view.captured?'NORMAL':value.state}>{view.access}</Badge></TooltipTrigger><TooltipContent>{view.captured?'仅代表此次采集时成功读取原帖，不代表当前实时状态':postReasonLabels[value.reason]??value.reason} · {view.accessAt?readingTime(view.accessAt):'从未检查'}</TooltipContent></Tooltip>;}
export function PostStateEvidence({value=unknownPostAvailability}:{value?:PostAvailabilityView}){
 const note=value.evidence&&typeof value.evidence==='object'&&'note' in value.evidence?value.evidence.note:undefined;
 return <div className="post-state-evidence"><dl className="post-state-facts">
  <div><dt>独立检查</dt><dd>{value.reason==='NOT_CHECKED'&&!value.version?'未单独检查':<PostStateTag value={value}/>}</dd></div>
  <div><dt>检查时间</dt><dd>{value.checkedAt?new Date(value.checkedAt).toLocaleString():'从未检查'}</dd></div>
  <div><dt>原因</dt><dd>{postReasonLabels[value.reason]??value.reason}</dd></div>
  <div><dt>来源</dt><dd>{value.source==='MANUAL'?'管理员记录':value.source??'无证据来源'}</dd></div>
  <div><dt>证据版本</dt><dd>v{value.version}</dd></div>
  {typeof note==='string'&&<div><dt>记录内容</dt><dd className="post-state-note">{note}</dd></div>}
 </dl><p className="post-state-caution">状态仅代表最后一次检查，历史原文与联系记录继续保留。</p></div>;
}
export function PostAvailabilityEntry({id,readEvidence}:{id:string;readEvidence?:PostReadEvidence}){
 const [open,setOpen]=useState(false),trigger=useRef<HTMLButtonElement>(null),s=usePostAvailability(id,open,readEvidence?.scope==='RUN'?readEvidence.runId||'':''),busy=s.save.isPending||s.recheck.isPending;
 return <><Button variant="outline" size="sm" ref={trigger} className="post-state-entry" onClick={()=>setOpen(true)} aria-label="查看帖子状态"><ShieldCheck data-icon="inline-start"/><span>状态与证据</span></Button><Sheet open={open} onOpenChange={v=>{if(!busy)setOpen(v);}}><SheetContent className="task-settings-sheet post-state-sheet" onCloseAutoFocus={e=>{e.preventDefault();trigger.current?.focus();}}><SheetHeader><SheetTitle>帖子状态与证据</SheetTitle><SheetDescription>404 和访问受限不等于删除；记录状态不会删除帖子、评论或发送历史。</SheetDescription></SheetHeader><div className="task-settings-body">{s.query.isPending?<Loading/>:s.query.isError?<ErrorNotice error={s.query.error}/>:s.query.data&&<>{s.query.data.readEvidence&&<div className="post-state-evidence"><dl className="post-state-facts"><div><dt>{postReadPresentation(s.query.data.readEvidence).scope}</dt><dd>{s.query.data.readEvidence.observedAt?readingTime(s.query.data.readEvidence.observedAt):'时间证据不足'}</dd></div><div><dt>采集访问</dt><dd>{s.query.data.readEvidence.accessObserved?'采集时可访问':'缺少可靠读取证据'}</dd></div><div><dt>读取覆盖</dt><dd>{postReadPresentation(s.query.data.readEvidence).coverage}</dd></div></dl></div>}<PostStateEvidence value={s.query.data.current}/><Button variant="outline" disabled={busy} onClick={()=>s.recheck.mutate()}>重新检查</Button><p role="status">{s.recheck.data?.recheck.reason??s.query.data.recheck.reason}</p><Disclosure title={<> 人工记录已核查证据 </>}><p>请记录检查方式、观察时间及来源。恢复正常不会自动补发旧任务，需重新审核和授权当前范围。</p><FormField>检查结论<SelectField aria-label="检查结论" value={s.reason} onValueChange={e=>s.setReason(e)}>{Object.entries(postReasonLabels).filter(([key])=>!['NOT_CHECKED','PLATFORM_DELETED'].includes(key)).map(([key,label])=><SelectOption key={key} value={key}>{label}</SelectOption>)}</SelectField></FormField><FormField>来源证据<Textarea aria-label="来源证据" maxLength={1000} value={s.evidence} onChange={e=>s.setEvidence(e.target.value)} placeholder="说明检查方式、时间及页面明确提示；不要粘贴登录令牌"/></FormField>{s.reason==='MANUAL_DELETED'&&<FormField><Checkbox  checked={s.confirmDeleted} onCheckedChange={e=>s.setConfirmDeleted((e === true))}/>我明确标记已删除，并已记录确认来源（单独 404 不足以确认）</FormField>}<Button disabled={busy||!s.valid} onClick={()=>s.save.mutate()}>保存状态证据</Button></Disclosure><Disclosure title={<> 历史状态证据（最近 20 次） </>}>{s.query.data.events.length?s.query.data.events.map(v=><PostStateEvidence key={v.version} value={v}/>):<p>尚无检查记录。</p>}</Disclosure></>}<ErrorNotice error={s.save.error||s.recheck.error}/></div></SheetContent></Sheet></>;
}
