import {SemanticRuleFields,useSemanticDraft} from './semantic-rule-fields';
import {CommentRuleFields,useCommentRuleDraft} from './comment-rule-fields';
import { useReplyTemplates } from '@/features/replies/use-replies';
import { Link } from 'react-router-dom';
import { useState, useEffect, FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useDraftGuard } from '@/features/work/draft-guard';
import { ErrorNotice } from '@/components/feedback';
import { modeLabels } from './mode';
import { Config, ConfigDraft } from './types';
import { useWorkspaceMutation } from './use-collection';
const words = (value: string) => value.split(/[\n,，、]/).map(v => v.trim()).filter(Boolean);
export function ConfigEditor({ availableMode, config, onClose, onSaved, onDirty }: {
    config?: Config;
    availableMode?: ConfigDraft['mode'] | null;
    onDirty:(dirty:boolean)=>void;
    onClose: () => void;
    onSaved: (config: Config) => void;
}) {
    const semantic=useSemanticDraft(config?.semanticRules);
    const rules=useCommentRuleDraft(config?.commentRules,!config);
    const mutation = useWorkspaceMutation<Config>();
    const templates = useReplyTemplates();
    const [templateId, setTemplateId] = useState(config?.defaultReplyTemplateId || '');
    const [name, setName] = useState(config?.name || '');
    const initialKeywords=config?.keywords.join('\n') || '';
    const [keywords, setKeywords] = useState(initialKeywords);
    const [exclude, setExclude] = useState(config?config.excludeWords.join('\n'):'广告');
    const [platform, setPlatform] = useState<ConfigDraft['platform']>(config?.platform || 'XHS');
    const [limit, setLimit] = useState(config?.batchLimit || 1);
    const [mode, setMode] = useState<ConfigDraft['mode']>(config?.mode || 'MOCK');
    const [enabled, setEnabled] = useState(config?.enabled ?? true);
    const dirty=semantic.dirty||rules.dirty||mode!==(config?.mode||'MOCK')||name!==(config?.name||'')||keywords!==initialKeywords||exclude!==(config?config.excludeWords.join('\n'):'广告')||platform!==(config?.platform||'XHS')||limit!==(config?.batchLimit||1)||enabled!==(config?.enabled??true)||templateId!==(config?.defaultReplyTemplateId||'');
    const discard=useDraftGuard(dirty);
    useEffect(()=>{onDirty(dirty);return()=>onDirty(false);},[dirty,onDirty]);
    const close=()=>{if(discard())onClose();};
    const submit = (event: FormEvent) => { event.preventDefault(); const draft: ConfigDraft = { name, semanticRules:semantic.value, commentRules:rules.enabled?rules.rules:null, keywords: words(keywords), excludeWords: words(exclude), platform, batchLimit: limit, enabled, mode, ...(!templates.isError ? { defaultReplyTemplateId: templateId || null } : {}) }; mutation.mutate({ path: config ? `/collection/configs/${config.id}` : '/collection/configs', method: config ? 'PATCH' : 'POST', body: config ? { config: draft, revision: config.revision } : draft }, { onSuccess: onSaved }); };
    return <section className="space-inline-editor"><header><h2>{config ? '编辑关键词配置' : '新增关键词配置'}</h2><p>保存后重复使用。模块切换会保留草稿；保存修改后创建新配置版本，不重放历史采集；首次新窗口只抑制提醒，不抑制线索。</p></header><form className="config-form detail-scroll" onSubmit={submit}>
  <ErrorNotice error={mutation.error}/><label>配置名称<Input value={name} onChange={e => setName(e.target.value)} maxLength={80} required placeholder="例如：企业部署需求"/></label>
  <div className="form-pair"><label>来源平台<select value={platform} onChange={e => { setPlatform(e.target.value as ConfigDraft['platform']); if (e.target.value !== 'XHS') setMode('MOCK'); }}><option value="XHS">小红书</option><option value="DOUYIN" disabled={mode !== 'MOCK'}>抖音 · 模拟适配器</option></select></label><label>单轮帖子上限<Input type="number" min={1} max={mode==='MOCK'?10:3} value={limit} onChange={e => setLimit(e.target.valueAsNumber)} required/></label></div>
  <label>采集模式<select aria-label="采集模式" value={mode} onChange={e => {setMode(e.target.value as ConfigDraft['mode']);if(e.target.value!=='MOCK')setLimit(Math.min(limit,3));}}>{Object.entries(modeLabels).map(([value, label]) => <option key={value} value={value} disabled={value !== 'MOCK' && (platform !== 'XHS' || value !== availableMode)}>{label}{value !== 'MOCK' && value !== availableMode ? '（服务端未开放）' : ''}</option>)}</select></label>
  <label>搜索关键词<Textarea value={keywords} onChange={e => setKeywords(e.target.value)} required maxLength={328} placeholder="例如：产品部署&#10;每行一个，最多 8 个，每个 40 字" rows={4}/></label>
  <SemanticRuleFields draft={semantic}/>
  <CommentRuleFields draft={rules} legacy={!!config&&!config.commentRules}/>
  <label>评论排除词<Textarea value={exclude} onChange={e => setExclude(e.target.value)} maxLength={820} placeholder="每行一个，最多 20 个" rows={3}/></label>
  <label>默认回复话术（可选）<select aria-label="默认回复话术" value={templateId} onChange={e => setTemplateId(e.target.value)} disabled={templates.isError}><option value="">不关联话术</option>{templates.data?.map(t => <option key={t.id} value={t.id}>{t.name} · {t.channel === 'DM' ? '私信' : '评论'}</option>)}</select></label><p className="helper-text">仅用于来源中的文字预览，不会发送。<Link to="/work?module=templates">管理回复话术</Link>{templates.isError && ' · 话术功能需要新版 API，请完成试用后升级。'}</p>
  <label className="check-label"><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)}/>保存后启用（仅允许手动有限运行）</label>
  <p className="helper-text">每轮最多 32 个内部读取步骤（含缓存读取，不是搜索次数）、100 条评论、{mode==='MOCK'?20:150} 秒；{mode === 'MOCK' ? '模拟分页每流最多4页。' : mode === 'XHS_FIXTURE' ? '离线夹具仅用于验证有限读取流程。' : '真实读取受当次限额约束；支持分块保存，并在配置、账号与设备等恢复条件满足时续读未完成进度，不代表平台全量评论。'}没有自动轮询或发送。{mode === 'MOCK' ? '内置模拟全部为虚构。' : mode === 'XHS_FIXTURE' ? '离线MCP夹具全部为虚构，不代表真实平台连接。' : '只读有限窗口；不宣称完整覆盖，首次读取不提醒。'}</p>
  <div className="action-row"><Button disabled={mutation.isPending}>{mutation.isPending ? '保存中…' : '保存配置'}</Button><Button type="button" variant="ghost" disabled={mutation.isPending} onClick={close}>取消</Button></div>
 </form></section>;
}
