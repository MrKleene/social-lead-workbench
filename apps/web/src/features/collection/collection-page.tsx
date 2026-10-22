import {ModelSettingsPanel} from '../model-settings/model-settings-panel';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useAuth } from '@/features/auth/use-auth';
import { Button } from '@/components/ui/button';
import { DemoNotice, ErrorNotice, Loading } from '@/components/feedback';
import { platformLabel } from '@/lib/types';
import { useConfigs, useWorkspaceMutation, useMcpReadiness } from './use-collection';
import { ConfigEditor } from './config-editor';
import { SoftSwap } from '@/features/work/space-panel';
import { McpReadinessPanel } from './mcp-readiness';
import { modeLabels } from './mode';
import type { Config } from './types';
export function CollectionPage() {
    const { user } = useAuth();
    const admin = user?.role === 'ADMIN';
    const query = useConfigs(admin);
    const readiness = useMcpReadiness(admin);
    const mutation = useWorkspaceMutation();
    const [params] = useSearchParams();
    const configId=params.get("config");
    const navigate = useNavigate();
    const [editor, setEditor] = useState<Config | 'new' | null>(null);
    const [dirty,setDirty]=useState(false);
    const discard=()=>!dirty||window.confirm('当前配置尚未保存，确定放弃修改并切换吗？');
    const [feedback, setFeedback] = useState('');
    if (!admin)
        return <div className="empty-state"><h1>仅管理员可管理采集配置</h1><Link to="/work">返回待处理</Link></div>;
    const configs = query.data || [];
    const selected = configId || configs[0]?.id;
    const action = (c: Config, archive = false) => mutation.mutate({ path: `/collection/configs/${c.id}${archive ? '' : '/enabled'}`, method: archive ? 'DELETE' : 'PATCH', body: { revision: c.revision, ...(!archive ? { enabled: !c.enabled } : {}) } }, { onSuccess: () => setFeedback(archive ? '配置已归档，来源证据保留' : c.enabled ? '配置与当前运行已暂停' : '配置已启用，可手动运行有限批次') });
    return <><div className="page-heading"><div><span className="eyebrow">低频配置 · COLLECTION</span><h1>搜索设置</h1><p>这里管理帖子搜索词、自然语言审核目标、独立评论规则和批次预算。运行与进度统一放在自动化采集。</p></div><Button disabled={readiness.data?.loginOnly && !readiness.data?.configurationOnly} onClick={() => {if(discard())setEditor('new');}}><Plus />新增关键词配置</Button></div><DemoNotice /><McpReadinessPanel /><ModelSettingsPanel/><ErrorNotice error={query.error || mutation.error}/>{feedback && <p role="status" className="success-note">{feedback}</p>}
 {query.isPending ? <Loading /> : <div className="collection-layout"><aside className="config-list" aria-label="关键词配置列表">{configs.map(c => <article key={c.id} className={selected === c.id ? 'config-card selected' : 'config-card'}><Link onClick={event=>{if(!discard()){event.preventDefault();return;}setEditor(null);}} to={`/work?module=settings&config=${c.id}`}><strong>{c.name}</strong><span>{platformLabel[c.platform]} · {c.enabled ? '已启用' : '已暂停'} · {modeLabels[c.mode]}</span><p>{c.keywords.join(' / ')}</p></Link><small>排除 {c.excludeWords.join('、') || '无'} · 最多 {c.batchLimit} 帖/轮</small><div className="action-row"><Button size="sm" variant="ghost" disabled={!!c.activeRunId} onClick={() => {if(discard())setEditor(c);}}>编辑</Button><Button size="sm" variant="outline" disabled={mutation.isPending} onClick={() => action(c)}>{c.enabled ? '暂停' : '启用'}</Button><Button size="sm" variant="ghost" disabled={mutation.isPending} onClick={() => action(c, true)}>归档</Button></div></article>)}</aside><SoftSwap identity={editor ? (editor==='new'?'new':editor.id) : `view-${selected||'empty'}`} >{editor ? <ConfigEditor availableMode={readiness.data?.enabled ? readiness.data.mode : null} onDirty={setDirty} key={editor==='new'?'new':editor.id} config={editor==='new'?undefined:editor} onClose={()=>setEditor(null)} onSaved={saved=>{setEditor(null);setFeedback(`配置已保存：${saved.name}`);navigate(`/work?module=settings&config=${saved.id}`);}}/> : <section className="table-panel collection-body"><h2>{readiness.data?.loginOnly ? '当前仅验证登录状态' : '保存后，返回自动化采集'}</h2><p>{readiness.data?.loginOnly ? readiness.data?.configurationOnly ? '可保存关键词、排除词与批次预算。此持久工作台禁用采集执行；扫码与会话核验请到账号中心。' : '此独立环境没有采集任务。请使用上方按钮手动检查；真实登录和会话保存仍由独立登录程序完成。' : '保存的关键词可以重复使用。采集原文在独立“采集信息”查看，LLM 可关闭；需要时再做语义审核与销售交接。'}</p><Button asChild><Link to={`/work?module=runs${selected ? `&config=${selected}` : ''}`}>返回自动化采集</Link></Button></section>}</SoftSwap></div>}
 </>;
}
