import { FieldGroup } from '@/components/ui/field';
import { FormField } from '@/components/form-field';
import { SelectField, SelectOption } from '@/components/select-field';
import { Checkbox } from '@/components/ui/checkbox';
import {accountOptionName} from '@/features/accounts/account-presentation';
import { Link } from 'react-router-dom';
import { useState, useEffect, FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useDraftGuard } from '@/features/work/draft-guard';
import { ErrorNotice } from '@/components/feedback';
import { modeLabels } from './mode';
import { Config, ConfigDraft } from './types';
import { useWorkspaceMutation,useMcpReadiness } from './use-collection';
const words = (value: string) => value.split(/[\n,，、]/).map(v => v.trim()).filter(Boolean);
export function ConfigEditor({ availableMode, config, onClose, onSaved, onDirty }: {
    config?: Config;
    availableMode?: ConfigDraft['mode'] | null;
    onDirty:(dirty:boolean)=>void;
    onClose: () => void;
    onSaved: (config: Config) => void;
}) {
    const readiness=useMcpReadiness();
    const [defaultAccount,setDefaultAccount]=useState(config?.defaultExecutionAccountId||'');
    const mutation = useWorkspaceMutation<Config>();
    const [name, setName] = useState(config?.name || '');
    const initialKeywords=config?.keywords.join('\n') || '';
    const [keywords, setKeywords] = useState(initialKeywords);
    const [platform, setPlatform] = useState<ConfigDraft['platform']>(config?.platform || 'XHS');
    const [limit, setLimit] = useState(config?.batchLimit || 1);
    const [mode, setMode] = useState<ConfigDraft['mode']>(config?.mode || 'MOCK');
    const [enabled, setEnabled] = useState(config?.enabled ?? true);
    const dirty=defaultAccount!==(config?.defaultExecutionAccountId||'')||mode!==(config?.mode||'MOCK')||name!==(config?.name||'')||keywords!==initialKeywords||platform!==(config?.platform||'XHS')||limit!==(config?.batchLimit||1)||enabled!==(config?.enabled??true);
    const discard=useDraftGuard(dirty);
    useEffect(()=>{onDirty(dirty);return()=>onDirty(false);},[dirty,onDirty]);
    const close=async()=>{if(await discard())onClose();};
    const submit = (event: FormEvent) => { event.preventDefault(); const draft: ConfigDraft = { name, keywords: words(keywords), excludeWords: config?.excludeWords||[], platform, batchLimit: limit, enabled, mode,defaultExecutionAccountId:defaultAccount||null }; mutation.mutate({ path: config ? `/collection/configs/${config.id}` : '/collection/configs', method: config ? 'PATCH' : 'POST', body: config ? { config: draft, revision: config.revision } : draft }, { onSuccess: onSaved }); };
    return <section className="space-inline-editor"><header><h2>{config ? '编辑关键词配置' : '新增关键词配置'}</h2><p>保存后重复使用。模块切换会保留草稿；保存修改后创建新搜索版本，不重放历史采集。只采集并保存原文，不按评论内容筛选或创建线索。</p></header><form className="config-form detail-scroll" onSubmit={submit}><FieldGroup className="form-fields">
  <ErrorNotice error={mutation.error}/><FormField>配置名称<Input value={name} onChange={e => setName(e.target.value)} maxLength={80} required placeholder="例如：企业部署需求"/></FormField>
  <div className="form-pair"><FormField>来源平台<SelectField value={platform} onValueChange={e => { setPlatform(e as ConfigDraft['platform']); if (e !== 'XHS') setMode('MOCK'); }}><SelectOption value="XHS">小红书</SelectOption><SelectOption value="DOUYIN" disabled={mode !== 'MOCK'}>抖音 · 模拟适配器</SelectOption></SelectField></FormField><FormField>单轮帖子上限<Input type="number" min={1} max={mode==='MOCK'?10:3} value={limit} onChange={e => setLimit(e.target.valueAsNumber)} required/></FormField></div>
  <FormField>采集模式<SelectField aria-label="采集模式" value={mode} onValueChange={e => {setMode(e as ConfigDraft['mode']);if(e!=='MOCK')setLimit(Math.min(limit,3));}}>{Object.entries(modeLabels).map(([value, label]) => <SelectOption key={value} value={value} disabled={value !== 'MOCK' && (platform !== 'XHS' || value !== availableMode)}>{label}{value !== 'MOCK' && value !== availableMode ? '（服务端未开放）' : ''}</SelectOption>)}</SelectField></FormField>
  <FormField>默认执行账号<SelectField aria-label="默认执行账号" value={defaultAccount} onValueChange={e=>setDefaultAccount(e)} disabled={mutation.isPending||readiness.isPending}><SelectOption value="">暂不设置 · 开始前选择一次</SelectOption>{defaultAccount&&!readiness.data?.accounts?.some(a=>a.id===defaultAccount)&&<SelectOption value={defaultAccount}>原默认账号不可用 · 请重新选择</SelectOption>}{(platform==='XHS'?readiness.data?.accounts:[])?.map(a=><SelectOption key={a.id} value={a.id}>{accountOptionName(a)}{a.eligible?'':' · 当前需处理'}</SelectOption>)}</SelectField><small>按当前关键词组保存；任务中临时更换不会修改这里。</small></FormField>
  <ErrorNotice error={readiness.error}/>
  <FormField>搜索关键词<Textarea aria-label="搜索关键词" value={keywords} onChange={e => setKeywords(e.target.value)} required maxLength={328} placeholder="例如：产品部署&#10;每行一个，最多 8 个，每个 40 字" rows={4}/></FormField>
  <p className="helper-text">评论判断请前往 <Link to="/comment-review">评论审核</Link>，审核需求独立保存，不影响搜索。</p>
  <FormField className="check-label"><Checkbox  checked={enabled} onCheckedChange={e => setEnabled((e === true))}/>保存后启用（仅允许手动有限运行）</FormField>
  <p className="helper-text">每轮最多 32 个内部读取步骤（含缓存读取，不是搜索次数）、100 条评论、{mode==='MOCK'?20:150} 秒；{mode === 'MOCK' ? '模拟分页每流最多4页。' : mode === 'XHS_FIXTURE' ? '离线夹具仅用于验证有限读取流程。' : '真实读取受当次限额约束；支持分块保存，并在配置、账号与设备等恢复条件满足时续读未完成进度，不代表平台全量评论。'}没有自动轮询或发送。{mode === 'MOCK' ? '内置模拟全部为虚构。' : mode === 'XHS_FIXTURE' ? '离线MCP夹具全部为虚构，不代表真实平台连接。' : '只读有限窗口；不宣称完整覆盖，首次读取不提醒。'}</p>
  <div className="action-row"><Button disabled={mutation.isPending}>{mutation.isPending ? '保存中…' : '保存配置'}</Button><Button type="button" variant="ghost" disabled={mutation.isPending} onClick={close}>取消</Button></div>
 </FieldGroup></form></section>;
}
