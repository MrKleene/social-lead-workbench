import './model-settings.css';
import {useRef,useState} from 'react';
import {Sheet,SheetContent,SheetHeader,SheetTitle,SheetDescription} from '@/components/ui/sheet';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {ErrorNotice,Loading} from '@/components/feedback';
import {ApiError} from '@/lib/api';
import {useModelSettings,useModelForm,credentialTransportAllowed,type ModelSettings} from './use-model-settings';
function ModelForm({value:v}:{value:ModelSettings}){
 const deleteTrigger=useRef<HTMLButtonElement>(null),cancelDelete=useRef<HTMLButtonElement>(null);
 const f=useModelForm(v),transportSafe=credentialTransportAllowed(),ready=v.vault.state==='READY'&&transportSafe,price=v.models.find(m=>m.id===f.model)?.priceDescription;
 return <section className="model-settings" aria-label="管理员模型设置"><h3>评论语义匹配模型</h3><p role="status">{v.configured?'Key 已配置（不显示内容）':'Key 未配置'}{v.updatedAt?` · 更新于 ${new Date(v.updatedAt).toLocaleString()}`:''}</p><p>备注：{v.note||'未填写'}</p><p className="helper-text">{v.vault.message}。Key 没有查看或复制入口；忘记时可直接替换。</p>
 {!transportSafe&&<p role="alert">当前是远程 HTTP，禁止输入或提交 Key。请在本机 http://127.0.0.1:63968 或直接 HTTPS 使用。</p>}
 {v.vault.state!=='READY'&&<p>请管理员恢复配套主密钥；首次使用须先单独批准本机初始化。此处不会自动生成主密钥、变更权限或联网。</p>}
 <form autoComplete="off" className="rule-fields model-settings-form" onSubmit={e=>{e.preventDefault();void f.save();}}>
 <div className="model-field-pair"><label className="model-field">模型<select aria-label="匹配模型" value={f.model} disabled={f.busy} onChange={e=>f.setModel(e.target.value)}>{v.models.map(m=><option key={m.id} value={m.id}>{m.id}</option>)}</select></label>
 <label className="model-field">处理地域<select aria-label="处理地域" value="beijing-standard" disabled><option value="beijing-standard">北京 · 官方标准接口</option></select></label></div>
 <p className="helper-text">仅使用官方北京接口；不接收自定义地址。普通调用由 Key 决定业务空间，无需填写 workspace ID。</p>
 <div className="model-setting-group"><label className="model-field">每日最多请求次数<Input aria-describedby="model-budget-note" aria-label="每日最多请求次数" type="number" min={1} max={100} required value={f.dailyLimit} disabled={f.busy} onChange={e=>f.setDailyLimit(e.target.valueAsNumber)}/></label>
 <p id="model-budget-note" className="helper-text">按 UTC 日、全项目共享，1–100 次；这是请求次数上限，不是人民币金额上限。</p>
 <div className="model-price-note"><strong>当前模型价格</strong><ul>{price?.split('；').map((tier,index)=><li key={index}>{tier}</li>)}</ul><p>价格核对版本 {v.priceVersion}；最终费用以服务商账单为准。</p></div></div>
 <label className="model-field">{v.configured?'替换 Key（留空保留原值）':'新的 API Key'}<Input ref={f.keyInput} aria-label="模型 API Key" type="password" autoComplete="new-password" data-1p-ignore data-lpignore="true" data-bwignore="true" spellCheck={false} minLength={16} maxLength={512} required={!v.configured} disabled={!ready||f.busy} placeholder="仅本次输入，不会回显"/></label>
 <label className="model-field">用途备注<Input aria-label="Key 用途备注" value={f.note} maxLength={200} disabled={f.busy} onChange={e=>f.setNote(e.target.value)} placeholder="例如：教培评论匹配；不要填写Key或联系方式"/></label>
 <label className="check-label"><input type="checkbox" checked={f.pricing} disabled={f.busy} onChange={e=>f.setPricing(e.target.checked)}/><span>我已核对当前模型价格和每日请求上限</span></label>
 <label className="check-label"><input type="checkbox" checked={f.consent} disabled={f.busy} onChange={e=>f.setConsent(e.target.checked)}/><span>允许经逐批审核的需求、评论和必要上下文脱敏后在北京处理</span></label>
 <div className="action-row"><Button type="submit" disabled={!ready||!f.pricing||!f.consent||f.busy}>保存模型设置（不调用）</Button><Button type="button" variant="ghost" disabled={f.busy} onClick={f.clear}>清空本次 Key 输入</Button><Button ref={deleteTrigger} type="button" variant="outline" disabled={!v.configured||f.busy} onClick={()=>{f.clear();f.setDeleteConfirmed(false);f.setDeleting(true);}}>删除已存 Key</Button></div></form>
 <div className="model-save-notes helper-text"><p>保存只在本机加密存储，不测试连接、不自动开启 LLM 开关，不产生付费请求。</p><p>实际分析仍需开启独立开关、预览并逐批确认。真实评论和私信发送关闭。</p><p>保存后立即用于下一次手动请求，无需再次重启。</p></div>
 <Sheet open={f.deleting} onOpenChange={open=>{if(!f.busy)f.setDeleting(open);}}><SheetContent role="alertdialog" aria-label="确认删除模型Key" className="task-settings-sheet" showCloseButton={!f.busy} onOpenAutoFocus={e=>{e.preventDefault();cancelDelete.current?.focus();}} onCloseAutoFocus={e=>{e.preventDefault();deleteTrigger.current?.focus();}}><SheetHeader><SheetTitle>确认删除本机保存的 Key？</SheetTitle><SheetDescription>此操作只删除本机保存的模型凭据。</SheetDescription></SheetHeader><div className="task-settings-body"><p>删除后阻断新模型请求，不删除历史结果，也不撤销千问平台上的 Key。在途请求可能已经发出并产生费用。需要撤销平台Key，请在千问控制台操作。</p><label className="check-label"><input type="checkbox" checked={f.deleteConfirmed} disabled={f.busy} onChange={e=>f.setDeleteConfirmed(e.target.checked)}/>我确认删除本机保存的 Key</label><div className="action-row"><Button disabled={!f.deleteConfirmed||f.busy} onClick={()=>void f.remove()}>确认删除</Button><Button ref={cancelDelete} id="cancel-model-key-delete" variant="ghost" disabled={f.busy} onClick={()=>f.setDeleting(false)}>取消删除</Button></div></div></SheetContent></Sheet>
 <ErrorNotice error={f.error}/></section>;
}
function SettingsBody(){const q=useModelSettings();if(q.isPending)return <Loading/>;if(q.error instanceof ApiError&&q.error.status===404)return <p role="status">模型设置后台尚未部署；请先完成获批准的升级与主密钥初始化，不要在其他字段输入 Key。</p>;if(q.isError||!q.data)return <ErrorNotice error={q.error}/>;return <><ModelForm key={q.data.version} value={q.data}/><Button variant="ghost" onClick={()=>void q.refetch()}>刷新模型配置状态</Button></>;}
export function ModelSettingsPanel(){const [open,setOpen]=useState(false);return <details className="table-panel collection-body" onToggle={e=>setOpen(e.currentTarget.open)}><summary>模型设置 · 仅管理员</summary>{open&&<SettingsBody/>}</details>;}
