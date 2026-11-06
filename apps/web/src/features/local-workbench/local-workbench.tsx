import {useState,type FormEvent} from 'react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {useLocalWorkbench} from './use-local-workbench';
import {LocalAutomation} from './local-automation';
import {LocalPlatform} from './local-platform';
import {LocalDataManagement} from './local-data-management';
import {LocalHistory} from './local-history';
import {LocalModelSettings} from './local-model-settings';
import type {ConfigurationKind,LocalConfiguration} from './local-api';
import './local-workbench.css';
const labels:Record<ConfigurationKind,string>={KEYWORDS:'关键词',MATCHING:'匹配目标',COMMENT_TEMPLATE:'评论模板',DM_TEMPLATE:'私信模板'};
function ConfigurationEditor({existing,onSave,onCancel,pending}:{existing?:LocalConfiguration;onSave:(value:Partial<LocalConfiguration>)=>Promise<unknown>;onCancel:()=>void;pending:boolean}){
 const [kind,setKind]=useState<ConfigurationKind>(existing?.kind||'KEYWORDS'),[name,setName]=useState(existing?.name||''),[text,setText]=useState(existing?.body.keywords?.join('\n')||existing?.body.text||'');
 const submit=async(event:FormEvent)=>{event.preventDefault();try{await onSave({...existing,kind,name,body:kind==='KEYWORDS'?{keywords:text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean),...(existing?.body.excludeWords?{excludeWords:existing.body.excludeWords}:{})}:{text}});onCancel();}catch{/* The screen renders mutation error. */}};
 return <form className="local-editor" onSubmit={submit}><h2>{existing?'编辑配置':'新增配置'}</h2><label>类型<select value={kind} disabled={!!existing} onChange={e=>setKind(e.target.value as ConfigurationKind)}>{Object.entries(labels).map(([id,label])=><option value={id} key={id}>{label}</option>)}</select></label><label>名称<Input value={name} onChange={e=>setName(e.target.value)} maxLength={100} required/></label><label>{kind==='KEYWORDS'?'关键词，每行一条':'内容'}<textarea value={text} onChange={e=>setText(e.target.value)} rows={7} required/></label>{kind==='KEYWORDS'&&<small>每组最多 100 条，每条最多 40 个字。</small>}<div className="local-actions"><Button type="submit" pending={pending}>保存到本机</Button><Button type="button" variant="outline" onClick={onCancel}>取消</Button></div></form>;
}
export function LocalWorkbench(){
 const work=useLocalWorkbench(),[editing,setEditing]=useState<LocalConfiguration|'new'|null>(null),[keyValue,setKeyValue]=useState('');
 const saveKey=async(e:FormEvent)=>{e.preventDefault();try{await work.key.mutateAsync(keyValue);setKeyValue('');}catch{setKeyValue('');}};
 return <main className="local-workbench"><header><div><span className="local-eyebrow">SOCIAL LEAD · DESKTOP</span><h1>本地工作台</h1><p>配置与业务数据保存在这台电脑。</p></div><span className="local-status">本地存储</span></header>
 {work.error&&<div role="alert" className="local-error">{work.error.message}</div>}{work.notice&&<p role="status" className="local-notice">{work.notice}</p>}
 {work.status.isPending?<p>正在打开本地数据…</p>:!work.status.data?<Button onClick={()=>void work.status.refetch()}>重新连接</Button>:!work.status.data.initialized?<section className="local-panel"><h2>首次使用</h2><p>初始化本机工作台，无需创建工作台账号。小红书账号需要另外扫码登录。</p><Button pending={work.initialize.isPending} onClick={()=>work.initialize.mutate()}>初始化并打开</Button></section>:<>
 <section className="local-platform-note"><strong>{work.status.data.platform.ready?'本地平台组件已就绪':'平台功能尚未切换'}</strong><p>账号登录、有界采集和限时收件分别授权，模型逐批确认。私信回复须有可靠入站身份并逐条确认；已有账号限制继续生效。</p></section>
 <section className="local-panel"><div className="local-section-title"><div><h2>配置管理</h2><p>关键词、匹配目标和渠道模板</p></div><Button onClick={()=>setEditing('new')}>新增配置</Button></div>
 {editing&&<ConfigurationEditor key={editing==='new'?'new':editing.id} existing={editing==='new'?undefined:editing} pending={work.save.isPending} onSave={work.save.mutateAsync} onCancel={()=>setEditing(null)}/>}
 {!work.configs.data?.length?<p className="local-empty">还没有配置。可以先添加关键词。</p>:<ul className="local-config-list">{work.configs.data.map(item=><li key={item.id}><div><small>{labels[item.kind]}</small><strong>{item.name}</strong><span>{item.body.keywords?`${item.body.keywords.length} 条关键词`:item.body.text}</span></div><Button variant="outline" onClick={()=>setEditing(item)}>编辑</Button></li>)}</ul>}</section>
 <section className="local-panel"><h2>模型密钥</h2><p>{work.status.data.modelKeyConfigured?'已配置；密钥不会回显。':'仅保存在本机系统保护区。保存不会调用模型。'}</p><form className="local-key-form" onSubmit={saveKey}><label>千问 API Key<Input type="password" value={keyValue} autoComplete="off" onChange={e=>setKeyValue(e.target.value)} required/></label><Button type="submit" pending={work.key.isPending} disabled={!work.status.data.credentialsAvailable}>加密保存</Button></form>{!work.status.data.credentialsAvailable&&<p>系统凭据保护未就绪，暂时不能保存密钥。</p>}</section>
 <section className="local-panel"><h2>备份与恢复</h2><p>备份包含业务数据，不包含模型密钥或平台登录凭据。恢复先生成独立副本，不覆盖当前数据。</p><div className="local-actions"><Button variant="outline" pending={work.backup.isPending} onClick={()=>work.backup.mutate()}>创建本地备份</Button><Button variant="outline" pending={work.restore.isPending} onClick={()=>work.restore.mutate()}>校验并恢复副本</Button></div></section>
 <LocalDataManagement/><section className="local-panel"><h2>任务记录</h2>{work.jobs.data?.length?<ul>{work.jobs.data.map(j=><li key={j.id}>{j.kind} · {j.state}{['QUEUED','RUNNING'].includes(j.state)&&<Button variant="outline" pending={work.cancel.isPending} onClick={()=>work.cancel.mutate(j.id)}>取消任务</Button>}</li>)}</ul>:<p className="local-empty">暂无任务。打开应用不会自动采集或发送。</p>}</section>
 <LocalPlatform credentialsAvailable={work.status.data.credentialsAvailable}/><LocalModelSettings keyConfigured={work.status.data.modelKeyConfigured}/><LocalAutomation/><LocalHistory/>
 </>}
 </main>;
}
