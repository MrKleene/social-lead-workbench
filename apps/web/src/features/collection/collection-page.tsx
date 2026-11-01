import {useConfirmDiscard} from '@/features/work/draft-guard';
import { Empty } from '@/components/ui/empty';
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
    const confirmDiscard=useConfirmDiscard();
    const discard=async()=>!dirty||await confirmDiscard('当前配置尚未保存，确定放弃修改并切换吗？');
    const [feedback, setFeedback] = useState('');
    if (!admin)
        return <Empty className="empty-state"><h1>仅管理员可管理采集配置</h1><Link to="/work">返回待处理</Link></Empty>;
    const configs = query.data || [];
    const selected = configId || configs[0]?.id;
    const selectedConfig=configs.find(c=>c.id===selected);
    const action = (c: Config, archive = false) => mutation.mutate({ path: `/collection/configs/${c.id}${archive ? '' : '/enabled'}`, method: archive ? 'DELETE' : 'PATCH', body: { revision: c.revision, ...(!archive ? { enabled: !c.enabled } : {}) } }, { onSuccess: () => setFeedback(archive ? '配置已归档，来源证据保留' : c.enabled ? '配置与当前运行已暂停' : '配置已启用，可手动运行有限批次') });
    return <><div className="page-heading"><div><span className="eyebrow">低频配置 · COLLECTION</span><h1>搜索与采集配置</h1></div><div className="action-row configuration-actions"><ModelSettingsPanel/><Button disabled={readiness.data?.loginOnly && !readiness.data?.configurationOnly} onClick={async () => {if(await discard())setEditor('new');}}><Plus />新增关键词配置</Button></div></div><DemoNotice /><McpReadinessPanel /><ErrorNotice error={query.error || mutation.error}/>{feedback && <p role="status" className="success-note">{feedback}</p>}
 {query.isPending ? <Loading /> : <div className="collection-layout"><aside className="config-list" aria-label="关键词配置列表">{configs.map(c => <article key={c.id} className={selected === c.id ? 'config-card selected' : 'config-card'}><Link onClick={async event=>{event.preventDefault();if(!await discard())return;setEditor(null);navigate(`/work?module=settings&config=${c.id}`);}} to={`/work?module=settings&config=${c.id}`}><strong>{c.name}</strong><span>{platformLabel[c.platform]} · {c.enabled ? '已启用' : '已暂停'} · {modeLabels[c.mode]}</span><p>{c.keywords.join(' / ')}</p></Link><small>最多 {c.batchLimit} 帖/轮</small><div className="action-row"><Button size="sm" variant="ghost" disabled={!!c.activeRunId} onClick={async () => {if(await discard())setEditor(c);}}>编辑</Button><Button size="sm" variant="outline" disabled={mutation.isPending} onClick={() => action(c)}>{c.enabled ? '暂停' : '启用'}</Button><Button size="sm" variant="ghost" disabled={mutation.isPending} onClick={() => action(c, true)}>归档</Button></div></article>)}</aside><SoftSwap identity={editor ? (editor==='new'?'new':editor.id) : `view-${selected||'empty'}`} >{editor ? <ConfigEditor availableMode={readiness.data?.enabled ? readiness.data.mode : null} onDirty={setDirty} key={editor==='new'?'new':editor.id} config={editor==='new'?undefined:editor} onClose={()=>setEditor(null)} onSaved={saved=>{setEditor(null);setFeedback(`配置已保存：${saved.name}`);navigate(`/work?module=settings&config=${saved.id}`);}}/> : <section className="config-summary"><h2>{selectedConfig?.name||'尚无关键词配置'}</h2>{selectedConfig?<><dl><dt>来源平台</dt><dd>{platformLabel[selectedConfig.platform]}</dd><dt>搜索关键词</dt><dd>{selectedConfig.keywords.join(' / ')||'未设置'}</dd><dt>排除词</dt><dd>{selectedConfig.excludeWords?.join(' / ')||'未设置'}</dd><dt>采集范围</dt><dd>每轮最多 {selectedConfig.batchLimit} 篇</dd><dt>运行模式</dt><dd>{modeLabels[selectedConfig.mode]}</dd><dt>配置状态</dt><dd>{selectedConfig.enabled?'已启用':'已暂停'}</dd></dl><div className="action-row"><Button variant="outline" disabled={!!selectedConfig.activeRunId} onClick={()=>setEditor(selectedConfig)}>编辑配置</Button><Button asChild variant="ghost"><Link to={`/automation?config=${selectedConfig.id}`}>前往自动化任务</Link></Button></div></>:<p>添加关键词配置后，在自动化任务开始采集。</p>}{readiness.data?.loginOnly&&<p className="helper-text">当前环境仅支持登录验证，采集执行未开放。</p>}</section>}</SoftSwap></div>}
 </>;
}
