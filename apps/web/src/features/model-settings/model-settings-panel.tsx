import './model-settings.css';
import {useId,useRef,useState} from 'react';
import {Sheet,SheetContent,SheetHeader,SheetTitle,SheetDescription} from '@/components/ui/sheet';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {ErrorNotice,Loading} from '@/components/feedback';
import {ApiError} from '@/lib/api';
import {useModelSettings,useModelForm,credentialTransportAllowed,type ModelSettings} from './use-model-settings';

function ModelForm({value:v,onComplete}:{value:ModelSettings;onComplete:()=>void}){
 const [editing,setEditing]=useState(!v.configured),[advanced,setAdvanced]=useState(false),[confirmationNeeded,setConfirmationNeeded]=useState(false);
 const editTrigger=useRef<HTMLButtonElement>(null),deleteTrigger=useRef<HTMLButtonElement>(null),cancelDelete=useRef<HTMLButtonElement>(null),advancedTrigger=useRef<HTMLButtonElement>(null),advancedBody=useRef<HTMLDivElement>(null);
 const advancedId=useId(),budgetId=useId();
 const f=useModelForm(v,onComplete),transportSafe=credentialTransportAllowed(),ready=v.vault.state==='READY'&&transportSafe;
 const selectedModel=v.models.find(m=>m.id===f.model),price=selectedModel?.priceDescription;
 const openAdvanced=()=>{setAdvanced(true);setConfirmationNeeded(true);requestAnimationFrame(()=>advancedBody.current?.querySelector<HTMLInputElement>('input:invalid, input[type="checkbox"]:not(:checked)')?.focus());};
 const save=()=>{
  if(!Number.isInteger(f.dailyLimit)||f.dailyLimit<1||f.dailyLimit>100||!f.pricing||!f.consent){openAdvanced();return;}
  setConfirmationNeeded(false);void f.save();
 };
 const cancelEdit=()=>{f.reset();setEditing(false);setAdvanced(false);setConfirmationNeeded(false);requestAnimationFrame(()=>editTrigger.current?.focus());};
 return <>
 {!transportSafe&&<p role="alert">当前是远程 HTTP，禁止输入或提交 Key。请通过本机地址或直接 HTTPS 使用。</p>}
 {v.vault.state!=='READY'&&<p role="alert">{v.vault.message}。请管理员检查本机密钥库。</p>}
 {v.configured&&!editing?<div className="model-configured"><div><p role="status"><span className="model-configured-dot" aria-hidden="true"/>Key 已配置</p><p className="model-current">{v.model}</p></div><div className="action-row"><Button ref={editTrigger} variant="outline" onClick={()=>setEditing(true)}>更换</Button><Button ref={deleteTrigger} variant="ghost" onClick={()=>{f.setDeleteConfirmed(false);f.setDeleting(true);}}>删除</Button></div></div>:<form autoComplete="off" className="model-settings-form" onSubmit={e=>{e.preventDefault();save();}}>
 <div className="model-field-pair"><label className="model-field">模型<select autoFocus={v.configured} aria-label="匹配模型" value={f.model} disabled={f.busy} onChange={e=>f.setModel(e.target.value)}>{v.models.map(m=><option key={m.id} value={m.id}>{m.id}</option>)}</select></label>
 <label className="model-field">API Key<Input ref={f.keyInput} aria-label="模型 API Key" type="password" autoComplete="new-password" data-1p-ignore data-lpignore="true" data-bwignore="true" spellCheck={false} minLength={16} maxLength={512} required={!v.configured} disabled={!ready||f.busy} placeholder={v.configured?'留空保留已存 Key':'输入 API Key'}/></label></div>
 <div className="model-form-actions"><div className="action-row"><Button type="submit" disabled={!ready||f.busy}>{f.busy?'保存中…':'保存'}</Button>{v.configured&&<Button type="button" variant="ghost" disabled={f.busy} onClick={cancelEdit}>取消</Button>}</div><Button ref={advancedTrigger} type="button" variant="ghost" aria-expanded={advanced} aria-controls={advancedId} disabled={f.busy} onClick={()=>setAdvanced(!advanced)}>高级设置<span aria-hidden="true">{advanced?'−':'＋'}</span></Button></div>
 <p className="helper-text model-save-hint">保存仅加密存储，不会调用模型或开启自动发送。</p>
 {confirmationNeeded&&<p role="status" className="model-confirmation-hint">保存前，请确认高级设置中的价格、请求上限与数据处理范围。</p>}
 {advanced&&<div ref={advancedBody} id={advancedId} className="model-advanced">
 <div className="model-field-pair"><label className="model-field">每日最多请求次数<Input aria-describedby={budgetId} aria-label="每日最多请求次数" type="number" min={1} max={100} required value={Number.isNaN(f.dailyLimit)?'':f.dailyLimit} disabled={f.busy} onChange={e=>f.setDailyLimit(e.target.valueAsNumber)}/></label><label className="model-field">用途备注（可选）<Input aria-label="Key 用途备注" value={f.note} maxLength={200} disabled={f.busy} onChange={e=>f.setNote(e.target.value)} placeholder="仅填写用途，不要填写 Key"/></label></div>
 <p id={budgetId} className="helper-text">全项目共享，按 UTC 日计数，最多 1–100 次；不是金额上限。</p>
 <div className="model-price-note"><strong>当前模型价格</strong><ul>{price?.split('；').map((tier,index)=><li key={index}>{tier}</li>)}</ul><p>价格版本 {selectedModel?.priceVersion??v.priceVersion}；实际费用以服务商账单为准。</p></div>
 <p className="helper-text">处理地域：北京。分析前仍需开启独立 LLM 开关，并逐批预览、确认脱敏文本。</p>
 <label className="check-label"><input type="checkbox" checked={f.pricing} disabled={f.busy} onChange={e=>f.setPricing(e.target.checked)}/><span>我已核对当前模型价格和每日请求上限</span></label>
 <label className="check-label"><input type="checkbox" checked={f.consent} disabled={f.busy} onChange={e=>f.setConsent(e.target.checked)}/><span>允许经逐批审核的需求、评论和必要上下文脱敏后在北京处理</span></label>
 </div>}
 </form>}
 <Sheet open={f.deleting} onOpenChange={open=>{if(!f.busy)f.setDeleting(open);}}><SheetContent role="alertdialog" aria-label="确认删除模型Key" className="task-settings-sheet" showCloseButton={!f.busy} onOpenAutoFocus={e=>{e.preventDefault();cancelDelete.current?.focus();}} onCloseAutoFocus={e=>{e.preventDefault();deleteTrigger.current?.focus();}}><SheetHeader><SheetTitle>删除已存 Key？</SheetTitle><SheetDescription>只删除本机保存的 Key，保留历史结果。</SheetDescription></SheetHeader><div className="task-settings-body"><p>删除后阻止新的模型请求，已发出的请求可能完成并计费。此操作不会撤销服务商平台上的 Key。</p><label className="check-label"><input type="checkbox" checked={f.deleteConfirmed} disabled={f.busy} onChange={e=>f.setDeleteConfirmed(e.target.checked)}/>我确认删除本机保存的 Key</label><div className="action-row"><Button disabled={!f.deleteConfirmed||f.busy} onClick={()=>void f.remove()}>{f.busy?'删除中…':'确认删除'}</Button><Button ref={cancelDelete} id="cancel-model-key-delete" variant="ghost" disabled={f.busy} onClick={()=>f.setDeleting(false)}>取消删除</Button></div><ErrorNotice error={f.error}/></div></SheetContent></Sheet>
 {!f.deleting&&<ErrorNotice error={f.error}/>}
 </>;
}
function SettingsBody(){
 const q=useModelSettings(),heading=useRef<HTMLHeadingElement>(null);
 if(q.isPending)return <Loading/>;
 if(q.error instanceof ApiError&&q.error.status===404)return <p role="status">模型设置后台尚未部署；请先完成后台升级，不要在其他字段输入 Key。</p>;
 if(q.isError||!q.data)return <ErrorNotice error={q.error}/>;
 return <section className="model-settings" aria-label="管理员模型设置"><h3 ref={heading} tabIndex={-1}>评论语义匹配模型</h3><ModelForm key={q.data.version} value={q.data} onComplete={()=>heading.current?.focus()}/></section>;
}
export function ModelSettingsPanel(){const [open,setOpen]=useState(false);return <details className="table-panel collection-body" onToggle={e=>setOpen(e.currentTarget.open)}><summary>模型设置 · 仅管理员</summary>{open&&<SettingsBody/>}</details>;}
