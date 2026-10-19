import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Plus, Settings2 } from 'lucide-react';
import { useAuth } from '@/features/auth/use-auth';
import { Button } from '@/components/ui/button';
import { DemoNotice, ErrorNotice, Loading } from '@/components/feedback';
import { platformLabel } from '@/lib/types';
import { useConfigs, useWorkspaceMutation } from './use-collection';
import { ConfigEditor } from './config-editor';
import { ConfigDetailPanel } from './config-detail';
import type { Config } from './types';
export function CollectionPage() {
    const { user } = useAuth();
    const admin = user?.role === 'ADMIN';
    const query = useConfigs(admin);
    const mutation = useWorkspaceMutation();
    const { configId } = useParams();
    const navigate = useNavigate();
    const [editor, setEditor] = useState<Config | 'new' | null>(null);
    const [feedback, setFeedback] = useState('');
    if (!admin)
        return <div className="empty-state"><h1>仅管理员可管理采集配置</h1><Link to="/work">返回待处理</Link></div>;
    const configs = query.data || [];
    const selected = configId || configs[0]?.id;
    const action = (c: Config, archive = false) => mutation.mutate({ path: `/collection/configs/${c.id}${archive ? '' : '/enabled'}`, method: archive ? 'DELETE' : 'PATCH', body: { revision: c.revision, ...(!archive ? { enabled: !c.enabled } : {}) } }, { onSuccess: () => setFeedback(archive ? '配置已归档，来源证据保留' : c.enabled ? '配置与当前运行已暂停' : '配置已启用，可手动运行模拟') });
    return <><div className="page-heading"><div><span className="eyebrow">低频配置 · COLLECTION</span><h1>关键词与采集</h1><p>配置一次，按需复用。所有运行均为有限的虚构模拟。</p></div><Button onClick={() => setEditor('new')}><Plus />新增关键词配置</Button></div><DemoNotice /><div className="connection-banner"><Settings2 size={18}/><div><strong>模拟已就绪 · 真实平台未连接</strong><p>小红书只读适配代码待授权验证；抖音仅模拟。自动评论、私信、内嵌聊天均未启用。</p></div><Button disabled variant="outline">真实采集未开放</Button></div><ErrorNotice error={query.error || mutation.error}/>{feedback && <p role="status" className="success-note">{feedback}</p>}
 {query.isPending ? <Loading /> : <div className="collection-layout"><aside className="config-list" aria-label="关键词配置列表">{configs.map(c => <article key={c.id} className={selected === c.id ? 'config-card selected' : 'config-card'}><Link to={`/collection/${c.id}`}><strong>{c.name}</strong><span>{platformLabel[c.platform]} · {c.enabled ? '已启用' : '已暂停'} · 模拟</span><p>{c.keywords.join(' / ')}</p></Link><small>排除 {c.excludeWords.join('、') || '无'} · 最多 {c.batchLimit} 帖/轮</small><div className="action-row"><Button size="sm" variant="ghost" disabled={!!c.activeRunId} onClick={() => setEditor(c)}>编辑</Button><Button size="sm" variant="outline" disabled={mutation.isPending} onClick={() => action(c)}>{c.enabled ? '暂停' : '启用'}</Button><Button size="sm" variant="ghost" disabled={mutation.isPending} onClick={() => action(c, true)}>归档</Button></div></article>)}</aside>{selected && configs.some(c => c.id === selected) ? <ConfigDetailPanel key={selected} id={selected}/> : <section className="empty-state table-panel"><h2>让规则为你整理待处理线索</h2><p>添加第一组关键词，运行基线和新增模拟，再到待处理工作台分配与跟进。</p><Button onClick={() => setEditor('new')}>新增关键词配置</Button></section>}</div>}
 {editor && <ConfigEditor config={editor === 'new' ? undefined : editor} onClose={() => { setEditor(null); }} onSaved={saved => { setEditor(null); setFeedback(`配置已保存：${saved.name}`); navigate(`/collection/${saved.id}`); }}/>}</>;
}
