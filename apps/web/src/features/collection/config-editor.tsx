import { useReplyTemplates } from '@/features/replies/use-replies';
import { Link } from 'react-router-dom';
import { useState, FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { ErrorNotice } from '@/components/feedback';
import { Config, ConfigDraft } from './types';
import { useWorkspaceMutation } from './use-collection';
const words = (value: string) => value.split(/[\n,，、]/).map(v => v.trim()).filter(Boolean);
export function ConfigEditor({ config, onClose, onSaved }: {
    config?: Config;
    onClose: () => void;
    onSaved: (config: Config) => void;
}) {
    const mutation = useWorkspaceMutation<Config>();
    const templates = useReplyTemplates();
    const [templateId, setTemplateId] = useState(config?.defaultReplyTemplateId || '');
    const [name, setName] = useState(config?.name || '');
    const [keywords, setKeywords] = useState(config?.keywords.join('\n') || '');
    const [exclude, setExclude] = useState(config?.excludeWords.join('\n') || '广告');
    const [platform, setPlatform] = useState<ConfigDraft['platform']>(config?.platform || 'XHS');
    const [limit, setLimit] = useState(config?.batchLimit || 1);
    const [enabled, setEnabled] = useState(config?.enabled ?? true);
    const submit = (event: FormEvent) => { event.preventDefault(); const draft: ConfigDraft = { name, keywords: words(keywords), excludeWords: words(exclude), platform, batchLimit: limit, enabled, mode: 'MOCK', ...(!templates.isError ? { defaultReplyTemplateId: templateId || null } : {}) }; mutation.mutate({ path: config ? `/collection/configs/${config.id}` : '/collection/configs', method: config ? 'PATCH' : 'POST', body: config ? { config: draft, revision: config.revision } : draft }, { onSuccess: onSaved }); };
    return <Sheet open onOpenChange={open => { if (!open && !mutation.isPending)
        onClose(); }}><SheetContent className="detail-sheet"><SheetHeader><SheetTitle>{config ? '编辑关键词配置' : '新增关键词配置'}</SheetTitle><SheetDescription>保存后重复使用。编辑规则将开启新版本并重新建立基线。</SheetDescription></SheetHeader><form className="config-form detail-scroll" onSubmit={submit}>
  <ErrorNotice error={mutation.error}/><label>配置名称<Input value={name} onChange={e => setName(e.target.value)} maxLength={80} required placeholder="例如：企业部署需求"/></label>
  <div className="form-pair"><label>来源平台<select value={platform} onChange={e => setPlatform(e.target.value as ConfigDraft['platform'])}><option value="XHS">小红书 · 模拟适配器</option><option value="DOUYIN">抖音 · 模拟适配器</option></select></label><label>单轮帖子上限<Input type="number" min={1} max={10} value={limit} onChange={e => setLimit(e.target.valueAsNumber)} required/></label></div>
  <label>搜索关键词<Textarea value={keywords} onChange={e => setKeywords(e.target.value)} required maxLength={328} placeholder="例如：产品部署&#10;每行一个，最多 8 个，每个 40 字" rows={4}/></label>
  <label>排除词<Textarea value={exclude} onChange={e => setExclude(e.target.value)} maxLength={820} placeholder="每行一个，最多 20 个" rows={3}/></label>
  <label>默认回复话术（可选）<select aria-label="默认回复话术" value={templateId} onChange={e => setTemplateId(e.target.value)} disabled={templates.isError}><option value="">不关联话术</option>{templates.data?.map(t => <option key={t.id} value={t.id}>{t.name} · {t.channel === 'DM' ? '私信' : '评论'}</option>)}</select></label><p className="helper-text">仅用于来源中的文字预览，不会发送。<Link to="/templates">管理回复话术</Link>{templates.isError && ' · 话术功能需要新版 API，请完成试用后升级。'}</p>
  <label className="check-label"><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)}/>保存后启用（仅允许手动模拟运行）</label>
  <p className="helper-text">每轮最多 32 次读取、100 条评论、20 秒；每个分页流最多 4 页。没有自动轮询或发送。全部数据为虚构。</p>
  <div className="action-row"><Button disabled={mutation.isPending}>{mutation.isPending ? '保存中…' : '保存配置'}</Button><Button type="button" variant="ghost" disabled={mutation.isPending} onClick={onClose}>取消</Button></div>
 </form></SheetContent></Sheet>;
}
