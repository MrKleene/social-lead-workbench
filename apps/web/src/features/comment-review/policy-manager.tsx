import {useState} from 'react';
import type {ReviewOverview,ReviewPolicy} from '@crm/contracts';
import {send} from '@/lib/api';
import {Sheet,SheetContent,SheetHeader,SheetTitle,SheetDescription} from '@/components/ui/sheet';
import {FormField} from '@/components/form-field';
import {SelectField,SelectOption} from '@/components/select-field';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
import {Button} from '@/components/ui/button';
import {ErrorNotice} from '@/components/feedback';
import {useSettingsOperation} from '@/features/work/settings-data';
import {useConfirmDiscard,useDraftGuard} from '@/features/work/draft-guard';
export function PolicyManager({overview,initialId,onClose}:{overview:ReviewOverview;initialId?:string;onClose:(id?:string)=>void}){
 const [id,setId]=useState(initialId||overview.policies[0]?.id||''),[message,setMessage]=useState(''),policy=overview.policies.find(p=>p.id===id);
 return <PolicyEditor key={id||'new'} overview={overview} policy={policy} message={message} onSaved={savedId=>{setId(savedId);setMessage('方案已保存');}} onSelect={nextId=>{setMessage('');setId(nextId);}} onClose={()=>onClose(id||undefined)}/>;
}
function PolicyEditor({overview,policy,message,onSaved,onSelect,onClose}:{overview:ReviewOverview;policy?:ReviewPolicy;message:string;onSaved:(id:string)=>void;onSelect:(id:string)=>void;onClose:()=>void}){
 const op=useSettingsOperation(),confirm=useConfirmDiscard(),[name,setName]=useState(policy?.name||''),[target,setTarget]=useState(policy?.target||'');
 const dirty=name!==(policy?.name||'')||target!==(policy?.target||'');useDraftGuard(dirty,'modal');useDraftGuard(op.busy,'pending');
 const leave=async(action:()=>void)=>{if(op.busy)return;if(!dirty||await confirm('放弃未保存的方案编辑？'))action();};
 return <Sheet open onOpenChange={open=>{if(!open)void leave(onClose);}}><SheetContent className="task-settings-sheet" showCloseButton={!op.busy}><SheetHeader><SheetTitle>评论匹配方案</SheetTitle><SheetDescription>在这里维护方案内容；自动化设置只选择已有方案。</SheetDescription></SheetHeader><form className="task-settings-body preset-form" onSubmit={e=>{e.preventDefault();void op.run(async()=>{const saved=await send<ReviewPolicy>(policy?`/comment-review/policies/${policy.id}`:'/comment-review/policies',policy?'PUT':'POST',{name,target,...(policy?{version:policy.version}:{})});setName(saved.name);setTarget(saved.target);await op.refresh();onSaved(saved.id);});}}><div className="preset-picker"><FormField>匹配方案<SelectField aria-label="管理的匹配方案" value={policy?.id||''} disabled={op.busy} onValueChange={id=>void leave(()=>onSelect(id))}><SelectOption value="" disabled>新增方案</SelectOption>{overview.policies.map(p=><SelectOption key={p.id} value={p.id}>{p.name}</SelectOption>)}</SelectField></FormField><Button type="button" variant="outline" size="sm" disabled={op.busy} onClick={()=>void leave(()=>onSelect(''))}>新增方案</Button></div><FormField>方案描述<Input aria-label="方案描述" required maxLength={80} disabled={op.busy} value={name} onChange={e=>setName(e.target.value)}/></FormField><FormField>识别内容<Textarea aria-label="识别内容" required minLength={10} maxLength={1500} rows={5} disabled={op.busy} value={target} onChange={e=>setTarget(e.target.value)}/></FormField><ErrorNotice error={op.error}/>{message&&<p role="status">{message}</p>}<div className="action-row"><Button disabled={op.busy||!dirty}>保存方案</Button><Button type="button" variant="ghost" disabled={op.busy} onClick={()=>void leave(onClose)}>返回评论审核</Button></div></form></SheetContent></Sheet>;
}
