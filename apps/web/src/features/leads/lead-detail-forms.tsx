import {Badge} from '@/components/ui/badge';
import {FormField} from '@/components/form-field';
import {SelectField,SelectOption} from '@/components/select-field';
import {InfoSection,InfoDrawer} from '@/components/information-panel';
import {assessmentLabels} from '@crm/contracts';
import {useDraftGuard} from '@/features/work/draft-guard';
import {useState,type FormEvent,type ReactNode} from 'react';
import {CheckCircle2,UserRound,CalendarClock,FileText} from 'lucide-react';
import {LeadReplyPreview} from '@/features/replies/reply-preview';
import {ContactActions,contactLabels} from './contact-actions';
import {useLead} from './use-leads';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
import {Field,FieldGroup,FieldLabel} from '@/components/ui/field';
import {ErrorNotice} from '@/components/feedback';
import {formatDate,statusLabel,type Lead} from '@/lib/types';
import './graphite-lead-forms.css';

type FormKind='review'|'owner'|'followup'|'task';
type DateDraft={key:string;value:string}|undefined;
export function localFollowUpDate(value:string|null|undefined){if(!value)return '';const date=new Date(value);return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);}
// Match the former input key: server date changes replace its value; closing a form does not.
export function retainedFollowUpDate(saved:string|null|undefined,draft:DateDraft){return draft?.key===(saved||'none')?draft.value:localFollowUpDate(saved);}
export function DetailForms({lead,state,admin,children}:{lead:Lead;state:ReturnType<typeof useLead>;admin:boolean;children?:ReactNode}){
 const [saveCount,setSaveCount]=useState(0),[ownerDraft,setOwner]=useState<string|undefined>(),[note,setNote]=useState(''),[content,setContent]=useState(''),[statusDraft,setStatus]=useState<Lead['status']|undefined>(),[taskTitle,setTaskTitle]=useState(''),[success,setSuccess]=useState('');
 const [open,setOpen]=useState<FormKind|null>(null),[lastForm,setLastForm]=useState<FormKind|null>(null),[dateDraft,setDateDraft]=useState<DateDraft>();
 const [draftVersion,setDraftVersion]=useState<number|null>(null);
 const owner=ownerDraft??lead.owner?.id??'',status=statusDraft??lead.status,nextDate=retainedFollowUpDate(lead.nextFollowUpAt,dateDraft),busy=state.mutation.isPending;
 const dateDirty=nextDate!==localFollowUpDate(lead.nextFollowUpAt);
 useDraftGuard(draftVersion!==null||!!taskTitle||dateDirty,'lead');
 useDraftGuard(busy,'pending');
 const beginEdit=()=>setDraftVersion(v=>v??lead.version);
 const changeDate=(value:string)=>{beginEdit();setDateDraft({key:lead.nextFollowUpAt||'none',value});};
 const changeOpen=(kind:FormKind)=>(value:boolean)=>{if(!busy)setOpen(value?kind:null);};
 const run=(kind:FormKind,path:string,method:string,body:unknown,message:string)=>{
  setLastForm(kind);
  state.mutation.mutate({path,method,body},{onSuccess:()=>{
   setSaveCount(v=>v+1);setSuccess(message);setOpen(null);
   // Another closed dialog may hold a draft. Never discard it after saving this one.
   if(kind==='review')setNote('');
   if(kind==='owner')setOwner(undefined);
   if(kind==='followup'){setContent('');setStatus(undefined);setDateDraft(undefined);}
   if(kind==='task')setTaskTitle('');
   const otherDraft=(kind!=='review'&&!!note)||(kind!=='owner'&&ownerDraft!==undefined)||(kind!=='followup'&&(!!content||statusDraft!==undefined||dateDirty));
   if(!otherDraft)setDraftVersion(null);
  }});
 };
 const feedback=(kind:FormKind)=>lastForm===kind?<ErrorNotice error={state.mutation.error}/>:null;
 const close=<Button type="button" variant="outline" disabled={busy} onClick={()=>setOpen(null)}>返回详情</Button>;
 const context=<div className="lead-form-context"><strong>{lead.identity.nickname}</strong><p>{lead.summary}</p></div>;
 const dateField=(id:string,label:string)=><Field><FieldLabel htmlFor={id}>{label}</FieldLabel><Input id={id} type="datetime-local" value={nextDate} onInput={e=>changeDate(e.currentTarget.value)} disabled={busy}/></Field>;
 const followup=(e:FormEvent)=>{e.preventDefault();run('followup',`/leads/${lead.id}/followups`,'POST',{content,nextFollowUpAt:nextDate?new Date(nextDate).toISOString():null,status,version:draftVersion??lead.version},'跟进已保存');};
 return <div className="detail-sections graphite-lead-forms">
  {children??<><p className="soft-tag">{contactLabels[lead.contactStage||'MATCHED']}</p><ContactActions lead={lead}/><InfoDrawer className="secondary-actions" title="首次联系话术预览（不发送）"><LeadReplyPreview id={lead.id}/></InfoDrawer></>}
  <InfoSection className="secondary-actions" title="当前负责人和跟进时间"><div className="detail-facts"><div><UserRound size={16}/><span>当前负责人<strong>{lead.owner?.name||'待分配'}{!admin&&'（只读）'}</strong></span></div><div><CalendarClock size={16}/><span>下次跟进<strong>{formatDate(lead.nextFollowUpAt)}</strong></span></div></div></InfoSection>
  {success&&<p role="status" key={saveCount} className="success-note"><CheckCircle2 size={17}/>{success}</p>}
  <section className="lead-source-evidence"><h3><FileText size={16}/>需求依据</h3>{lead.identity.comments?.map(comment=><blockquote key={comment.id}><div className="source-flags">{comment.parentPlatformCommentId&&<Badge variant="secondary" className="soft-tag">楼中楼回复</Badge>}{comment.matches?.map((m,i)=><Badge variant="secondary" className="soft-tag" key={i}>规则 · {assessmentLabels[m.classification]||m.classification} · {m.keywords.join('、')}{m.isBaseline?' · 首次记录':''}</Badge>)}</div><p>{comment.originalText}</p><footer>{comment.post.title}<br/>帖子 {comment.post.platformPostId} · 评论 {comment.platformCommentId}</footer></blockquote>)}{lead.reviewedAt&&<div className="review-record"><strong>已人工核验 · {formatDate(lead.reviewedAt)}</strong><p>{lead.reviewNote}</p></div>}</section>
  <div className="lead-form-actions">
   {!lead.reviewedAt&&<InfoDrawer kind="dialog" className="lead-form-entry" title="人工核验" open={open==='review'} onOpenChange={changeOpen('review')} busy={busy} description="仅记录人工核验，不启用发送。"><div className="graphite-lead-form">{context}<form onSubmit={e=>{e.preventDefault();run('review',`/leads/${lead.id}/review`,'PATCH',{note,version:draftVersion??lead.version},'人工核验已记录');}}><FieldGroup className="form-fields"><Field><FieldLabel htmlFor="review">人工核验说明（5–2000 字）</FieldLabel><Textarea id="review" value={note} onChange={e=>{beginEdit();setNote(e.target.value);}} minLength={5} maxLength={2000} required disabled={busy} aria-describedby="review-note-help" aria-invalid={note.length>0&&note.trim().length<5} placeholder="记录明确求助的原文依据与判断，不将专业相关视为同意联系"/><p id="review-note-help" className={note.length>0&&note.trim().length<5?'lead-field-error':'helper-text'}>{note.length>0&&note.trim().length<5?'至少填写 5 字':'专业相关或明确求助均不代表同意联系。'}<span>{note.length} / 2000</span></p></Field>{feedback('review')}<div className="lead-form-footer">{close}<Button disabled={busy||note.trim().length<5}>{busy?'保存中…':'保存人工核验'}</Button></div></FieldGroup></form></div></InfoDrawer>}
   {admin&&<InfoDrawer kind="dialog" className="lead-form-entry" title="分配负责人" open={open==='owner'} onOpenChange={changeOpen('owner')} busy={busy} description="仅管理员可分配。"><div className="graphite-lead-form">{context}<p className="lead-current-owner">当前负责人<strong>{lead.owner?.name||'未分配'}</strong></p><ErrorNotice error={state.usersError}/>{!state.usersLoading&&!state.usersError&&state.users.length===0&&<p className="helper-text">尚无可分配销售，请由管理员在本机创建销售账号。</p>}<form onSubmit={e=>{e.preventDefault();run('owner',`/leads/${lead.id}/owner`,'PATCH',{ownerId:owner||null,version:draftVersion??lead.version},'负责人已更新');}}><FieldGroup className="form-fields"><FormField htmlFor="owner">销售负责人<SelectField id="owner" value={owner} disabled={busy||state.usersLoading||!!state.usersError} onValueChange={value=>{beginEdit();setOwner(value);}}><SelectOption value="">未分配</SelectOption>{lead.owner&&!state.users.some(u=>u.id===lead.owner?.id)&&<SelectOption value={lead.owner.id} disabled>{lead.owner.name}（当前负责人）</SelectOption>}{state.users.map(u=><SelectOption key={u.id} value={u.id}>{u.name}</SelectOption>)}</SelectField></FormField><p className="lead-transfer-warning">转交后，原负责人立即失去该线索与关联任务的访问权限。</p>{feedback('owner')}<div className="lead-form-footer">{close}<Button disabled={busy||state.usersLoading||!!state.usersError||owner===(lead.owner?.id||'')}>{busy?'保存中…':'分配 / 转交'}</Button></div></FieldGroup></form></div></InfoDrawer>}
   <InfoDrawer kind="dialog" className="lead-form-entry" title="添加沟通记录" open={open==='followup'} onOpenChange={changeOpen('followup')} busy={busy} description="只保存人工记录，不发送平台消息。"><div className="graphite-lead-form">{context}<form onSubmit={followup}><FieldGroup className="form-fields"><Field><FieldLabel htmlFor="followup">沟通内容</FieldLabel><Textarea id="followup" value={content} onChange={e=>{beginEdit();setContent(e.target.value);}} disabled={busy} required maxLength={4000} placeholder="记录人工沟通或核验情况，不在此发送平台消息"/><p className="lead-field-count">{content.length} / 4000</p></Field><div className="lead-form-pair">{dateField('next','销售下次联系时间')}<FormField htmlFor="stage">销售线索阶段<SelectField id="stage" value={status} disabled={busy} onValueChange={value=>{beginEdit();setStatus(value as Lead['status']);}}>{Object.entries(statusLabel).map(([value,label])=><SelectOption key={value} value={value}>{label}</SelectOption>)}</SelectField></FormField></div>{feedback('followup')}<div className="lead-form-footer">{close}<Button disabled={busy||!content.trim()}>{busy?'保存中…':'保存沟通记录'}</Button></div></FieldGroup></form><section className="lead-form-timeline"><h3>跟进时间线 <span className="muted">{lead.followups?.length||0}</span></h3><div className="timeline">{lead.followups?.length?lead.followups.map(item=><article key={item.id}><div><strong>{item.author.name}</strong><time>{formatDate(item.createdAt)}</time></div><p>{item.content}</p>{item.nextFollowUpAt&&<small>下次跟进 · {formatDate(item.nextFollowUpAt)}</small>}</article>):<p className="muted">尚未添加销售沟通记录。</p>}</div></section></div></InfoDrawer>
   <InfoDrawer kind="dialog" className="lead-form-entry" title="创建人工任务" open={open==='task'} onOpenChange={changeOpen('task')} busy={busy} description="仅创建人工跟进任务。"><div className="graphite-lead-form">{context}<form onSubmit={e=>{e.preventDefault();run('task','/tasks','POST',{leadId:lead.id,title:taskTitle,dueAt:nextDate?new Date(nextDate).toISOString():null},'任务已创建');}}><FieldGroup className="form-fields"><Field><FieldLabel htmlFor="task">任务名称</FieldLabel><Input id="task" value={taskTitle} onChange={e=>setTaskTitle(e.target.value)} required maxLength={200} disabled={busy} placeholder="例如：核对需求范围"/></Field>{dateField('task-due','到期时间')}<p className="helper-text">到期时间与下次联系时间同步。创建任务不保存沟通记录。</p>{feedback('task')}<div className="lead-form-footer">{close}<Button disabled={busy||!taskTitle.trim()}>{busy?'创建中…':'创建任务'}</Button></div></FieldGroup></form></div></InfoDrawer>
  </div>
 </div>;
}
