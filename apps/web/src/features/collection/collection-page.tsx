import {useConfirmDiscard,useDraftGuard} from '@/features/work/draft-guard';
import {Empty} from '@/components/ui/empty';
import {Badge} from '@/components/ui/badge';
import {useRef,useState} from 'react';
import {Link,useNavigate,useSearchParams} from 'react-router-dom';
import {Plus} from 'lucide-react';
import {useAuth} from '@/features/auth/use-auth';
import {Button} from '@/components/ui/button';
import {ErrorNotice,Loading} from '@/components/feedback';
import {useConfigs,useMcpReadiness} from './use-collection';
import {ConfigEditor} from './config-editor';
import '@/components/configuration-browser.css';
import {keywordDefaults} from './config-draft';
import type {Config,ConfigDraft} from './types';

type Editor = {kind:'new';defaults:Pick<ConfigDraft,'platform'|'mode'>}|{kind:'edit';config:Config};
export function CollectionPage() {
    const {user}=useAuth(),admin=user?.role==='ADMIN';
    const query=useConfigs(admin),readiness=useMcpReadiness(admin);
    const [params]=useSearchParams(),navigate=useNavigate();
    const editTrigger=useRef<HTMLButtonElement>(null),addTrigger=useRef<HTMLButtonElement>(null);
    const focusActions=()=>requestAnimationFrame(()=>(editTrigger.current||addTrigger.current)?.focus());
    const [editor,setEditor]=useState<Editor|null>(null);
    const [dirty,setDirty]=useState(false),[busy,setBusy]=useState(false),[feedback,setFeedback]=useState('');
    useDraftGuard(busy,'pending');
    const confirmDiscard=useConfirmDiscard();
    const discard=async()=>!busy&&(!dirty||await confirmDiscard('当前配置尚未保存，确定放弃修改并切换吗？'));
    if(!admin)return <Empty className="empty-state"><h1>仅管理员可管理采集配置</h1><Link to="/work">返回工作台</Link></Empty>;
    const configs=query.data||[],selectedConfig=configs.find(c=>c.id===params.get('config'))||configs[0],selected=selectedConfig?.id;
    const select=async(c:Config)=>{if(await discard()){setEditor(null);navigate(`/configuration?tab=keywords&config=${c.id}`);}};
    const add=async()=>{if(await discard())setEditor({kind:'new',defaults:keywordDefaults(selectedConfig,readiness.data?.enabled?readiness.data.mode:null)});};
    return <><div className="page-heading"><h1>关键词配置</h1><div className="action-row configuration-actions"><Button ref={addTrigger} disabled={query.isPending||readiness.isPending||!!readiness.error||busy||!!(readiness.data?.loginOnly&&!readiness.data?.configurationOnly)} onClick={add}><Plus/>新增关键词配置</Button></div></div>
        <ErrorNotice error={query.error||readiness.error}/>{feedback&&<p role="status" className="success-note">{feedback}</p>}
        {query.isPending?<Loading/>:<div className="configuration-browser"><aside className="configuration-items" aria-label="关键词配置列表"><h2>已有配置 · {configs.length}</h2>{configs.map(c=><Button key={c.id} variant="ghost" className="configuration-item" aria-pressed={!editor&&selected===c.id} disabled={busy} onClick={()=>void select(c)}><span>{c.name}</span><small>{c.keywords.join(' / ')}</small>{(!c.enabled||c.mode!=='XHS_MCP')&&<span className="flex flex-wrap gap-1">{!c.enabled&&<Badge variant="secondary">已暂停</Badge>}{c.mode!=='XHS_MCP'&&<Badge variant="secondary">{c.mode==='MOCK'?'模拟配置':'离线配置'}</Badge>}</span>}</Button>)}</aside>
        <section className="configuration-detail" aria-label="关键词内容">
            {editor?<ConfigEditor key={editor.kind==='new'?'new':editor.config.id} config={editor.kind==='edit'?editor.config:undefined} defaults={editor.kind==='new'?editor.defaults:undefined} onDirty={setDirty} onBusy={setBusy} onClose={()=>{setDirty(false);setEditor(null);focusActions();}} onSaved={saved=>{setDirty(false);setBusy(false);setEditor(null);setFeedback('配置已保存');requestAnimationFrame(()=>{navigate(`/configuration?tab=keywords&config=${saved.id}`);focusActions();});}}/>:
            <>{selectedConfig?<><header><h2>{selectedConfig.name}</h2><Button ref={editTrigger} variant="outline" size="sm" disabled={!!selectedConfig.activeRunId} onClick={()=>setEditor({kind:'edit',config:selectedConfig})}>编辑配置</Button></header><dl><div><dt>描述</dt><dd>{selectedConfig.name}</dd></div><div><dt>关键词内容</dt><dd>{selectedConfig.keywords.join('\n')||'未设置'}</dd></div></dl></>:<Empty><h2>尚无关键词配置</h2></Empty>}</>}
        </section></div>}
    </>;
}
