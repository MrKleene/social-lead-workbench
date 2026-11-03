import {useConfirmDiscard,useDraftGuard} from '@/features/work/draft-guard';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { FieldGroup } from '@/components/ui/field';
import { FormField } from '@/components/form-field';
import { SelectField, SelectOption } from '@/components/select-field';
import { Checkbox } from '@/components/ui/checkbox';
import {InfoDrawer} from '@/components/information-panel';
import './model-settings.css';
import {useLayoutEffect,useRef,useState} from 'react';
import {Sheet,SheetContent,SheetHeader,SheetTitle,SheetDescription} from '@/components/ui/sheet';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {ErrorNotice,Loading} from '@/components/feedback';
import {ApiError} from '@/lib/api';
import {useModelSettings,useModelForm,credentialTransportAllowed,type ModelSettings} from './use-model-settings';

function ModelForm({value:v,onComplete,onBusyChange}:{value:ModelSettings;onComplete:()=>void;onBusyChange:(busy:boolean)=>void}){
 const [editing,setEditing]=useState(false),[keyDirty,setKeyDirty]=useState(false),confirm=useConfirmDiscard();
 const editTrigger=useRef<HTMLButtonElement>(null),deleteTrigger=useRef<HTMLButtonElement>(null),cancelDelete=useRef<HTMLButtonElement>(null);
 const f=useModelForm(v,onComplete),transportSafe=credentialTransportAllowed(),ready=v.vault.state==='READY'&&transportSafe;
 useLayoutEffect(()=>{onBusyChange(f.busy);return()=>onBusyChange(false);},[f.busy,onBusyChange]);
 const dirty=editing&&(keyDirty||f.note!==v.note||f.model!==v.model);
 useDraftGuard(dirty,'modal');useDraftGuard(f.busy,'pending');
 const cancelEdit=async()=>{if(f.busy||dirty&&!await confirm('模型配置尚未保存，确定放弃修改吗？'))return;f.reset();setKeyDirty(false);setEditing(false);requestAnimationFrame(()=>editTrigger.current?.focus());};
 return <>
 {!transportSafe&&<Alert role="alert"><AlertDescription>当前是远程 HTTP，禁止输入或提交 Key。请通过本机地址或直接 HTTPS 使用。</AlertDescription></Alert>}
 {v.vault.state!=='READY'&&<Alert role="alert"><AlertDescription>{v.vault.message}。请管理员检查本机密钥库。</AlertDescription></Alert>}
 {!editing?(!v.configured?<div className="model-configuration-empty"><p>尚未配置模型</p><Button ref={editTrigger} onClick={()=>setEditing(true)}>新增模型配置</Button></div>:<div className="model-configured"><header><h2>{v.note||'评论语义匹配模型'}</h2><Button ref={editTrigger} variant="outline" size="sm" onClick={()=>setEditing(true)}>编辑配置</Button></header><dl><div><dt>描述</dt><dd>{v.note||'未设置'}</dd></div><div><dt>模型</dt><dd>{v.model}</dd></div><div><dt>API Key</dt><dd role="status">已配置</dd></div></dl></div>):<form autoComplete="off" className="model-settings-form" onSubmit={e=>{e.preventDefault();void f.save();}}><FieldGroup className="form-fields"><h2>{v.configured?'编辑模型配置':'新增模型配置'}</h2>
 <div className="model-fields"><FormField className="model-field">描述<Input autoFocus aria-label="模型描述" value={f.note} maxLength={200} disabled={f.busy} onChange={e=>f.setNote(e.target.value)} placeholder="例如：评论语义匹配"/></FormField><FormField className="model-field">模型<SelectField aria-label="匹配模型" value={f.model} disabled={f.busy} onValueChange={e=>f.setModel(e)}>{v.models.map(m=><SelectOption key={m.id} value={m.id}>{m.id}</SelectOption>)}</SelectField></FormField>
 <FormField className="model-field">API Key<Input ref={f.keyInput} onChange={e=>setKeyDirty(e.currentTarget.value.length>0)} aria-label="模型 API Key" type="password" autoComplete="new-password" data-1p-ignore data-lpignore="true" data-bwignore="true" spellCheck={false} minLength={16} maxLength={512} required={!v.configured} disabled={!ready||f.busy} placeholder={v.configured?'留空保留已存 Key':'输入 API Key'}/></FormField></div>
 <div className="model-form-actions"><div className="action-row"><Button type="submit" disabled={!ready||f.busy}>{f.busy?'保存中…':'保存配置'}</Button><Button type="button" variant="ghost" disabled={f.busy} onClick={()=>void cancelEdit()}>取消</Button></div>{v.configured&&<Button type="button" ref={deleteTrigger} variant="ghost" disabled={f.busy} onClick={()=>{f.setDeleteConfirmed(false);f.setDeleting(true);}}>删除已存 Key</Button>}</div>
 </FieldGroup></form>}
 <Sheet open={f.deleting} onOpenChange={open=>{if(!f.busy)f.setDeleting(open);}}><SheetContent role="alertdialog" aria-label="确认删除模型Key" className="task-settings-sheet" showCloseButton={!f.busy} onOpenAutoFocus={e=>{e.preventDefault();cancelDelete.current?.focus();}} onCloseAutoFocus={e=>{e.preventDefault();deleteTrigger.current?.focus();}}><SheetHeader><SheetTitle>删除已存 Key？</SheetTitle><SheetDescription>只删除本机保存的 Key，保留历史结果。</SheetDescription></SheetHeader><div className="task-settings-body"><p>删除后阻止新的模型请求，已发出的请求可能完成并计费。此操作不会撤销服务商平台上的 Key。</p><FormField className="check-label"><Checkbox  checked={f.deleteConfirmed} disabled={f.busy} onCheckedChange={e=>f.setDeleteConfirmed((e === true))}/>我确认删除本机保存的 Key</FormField><div className="action-row"><Button disabled={!f.deleteConfirmed||f.busy} onClick={()=>void f.remove()}>{f.busy?'删除中…':'确认删除'}</Button><Button ref={cancelDelete} id="cancel-model-key-delete" variant="ghost" disabled={f.busy} onClick={()=>f.setDeleting(false)}>取消删除</Button></div><ErrorNotice error={f.error}/></div></SheetContent></Sheet>
 {!f.deleting&&<ErrorNotice error={f.error}/>}
 </>;
}
export function ModelSettingsBody({onBusyChange}:{onBusyChange:(busy:boolean)=>void}){
 const q=useModelSettings(),heading=useRef<HTMLHeadingElement>(null);
 if(q.isPending)return <Loading/>;
 if(q.error instanceof ApiError&&q.error.status===404)return <p role="status">模型设置后台尚未部署；请先完成后台升级，不要在其他字段输入 Key。</p>;
 if(q.isError||!q.data)return <ErrorNotice error={q.error}/>;
 return <section className="model-settings" aria-label="管理员模型设置"><h3 className="sr-only" ref={heading} tabIndex={-1}>评论语义匹配模型</h3><ModelForm onBusyChange={onBusyChange} key={q.data.version} value={q.data} onComplete={()=>heading.current?.focus()}/></section>;
}
export function ModelSettingsPanel(){
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false);
 return <InfoDrawer title="模型设置 · 仅管理员" className="table-panel collection-body" open={open} onOpenChange={setOpen} busy={busy} description="保存配置与授权使用分开。这里只保存描述、模型和 Key。">{visible=>visible&&<ModelSettingsBody onBusyChange={setBusy}/>}</InfoDrawer>;
}
