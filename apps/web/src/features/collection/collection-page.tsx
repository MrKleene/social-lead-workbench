import {useConfirmDiscard,useDraftGuard} from '@/features/work/draft-guard';
import {Empty} from '@/components/ui/empty';
import {Badge} from '@/components/ui/badge';
import {useRef,useState} from 'react';
import {Link,useNavigate,useSearchParams} from 'react-router-dom';
import {Plus} from 'lucide-react';
import {useAuth} from '@/features/auth/use-auth';
import {Button} from '@/components/ui/button';
import {ErrorNotice,Loading} from '@/components/feedback';
import {useConfigs,useWorkspaceMutation,useMcpReadiness} from './use-collection';
import {ConfigEditor} from './config-editor';
import {ConfigActions} from './config-actions';
import {keywordDefaults} from './config-draft';
import type {Config,ConfigDraft} from './types';

type Editor = {kind:'new';defaults:Pick<ConfigDraft,'platform'|'mode'>}|{kind:'edit';config:Config};
export function CollectionPage() {
    const {user}=useAuth(),admin=user?.role==='ADMIN';
    const query=useConfigs(admin),readiness=useMcpReadiness(admin),mutation=useWorkspaceMutation();
    const [params]=useSearchParams(),navigate=useNavigate();
    const editTrigger=useRef<HTMLButtonElement>(null),addTrigger=useRef<HTMLButtonElement>(null);
    const focusActions=()=>requestAnimationFrame(()=>(editTrigger.current||addTrigger.current)?.focus());
    const [editor,setEditor]=useState<Editor|null>(null);
    const [dirty,setDirty]=useState(false),[busy,setBusy]=useState(false),[feedback,setFeedback]=useState('');
    useDraftGuard(busy||mutation.isPending,'pending');
    const confirmDiscard=useConfirmDiscard();
    const discard=async()=>!busy&&!mutation.isPending&&(!dirty||await confirmDiscard('当前配置尚未保存，确定放弃修改并切换吗？'));
    if(!admin)return <Empty className="empty-state"><h1>仅管理员可管理采集配置</h1><Link to="/work">返回工作台</Link></Empty>;
    const configs=query.data||[],selectedConfig=configs.find(c=>c.id===params.get('config'))||configs[0],selected=selectedConfig?.id;
    const select=async(c:Config)=>{if(await discard()){setEditor(null);navigate(`/configuration?tab=keywords&config=${c.id}`);}};
    const action=(c:Config,archive=false)=>mutation.mutate({path:`/collection/configs/${c.id}${archive?'':'/enabled'}`,method:archive?'DELETE':'PATCH',body:{revision:c.revision,...(!archive?{enabled:!c.enabled}:{})}},{onSuccess:()=>{setFeedback(archive?'配置已归档':c.enabled?'配置已暂停':'配置已启用');if(archive&&c.id===selected)navigate('/configuration?tab=keywords',{replace:true});}});
    const add=async()=>{if(await discard())setEditor({kind:'new',defaults:keywordDefaults(selectedConfig,readiness.data?.enabled?readiness.data.mode:null)});};
    return <><div className="page-heading"><h1>关键词配置</h1><div className="action-row configuration-actions"><Button ref={addTrigger} disabled={query.isPending||readiness.isPending||!!readiness.error||busy||mutation.isPending||!!(readiness.data?.loginOnly&&!readiness.data?.configurationOnly)} onClick={add}><Plus/>新增关键词配置</Button></div></div>
        <ErrorNotice error={query.error||mutation.error||readiness.error}/>{feedback&&<p role="status" className="success-note">{feedback}</p>}
        {query.isPending?<Loading/>:<div className="collection-layout"><aside className="config-list" aria-label="关键词配置列表">{configs.map(c=><article key={c.id} className={selected===c.id?'config-card selected':'config-card'}><Link onClick={event=>{event.preventDefault();void select(c);}} to={`/configuration?tab=keywords&config=${c.id}`}><strong>{c.name}</strong><p>{c.keywords.join(' / ')}</p></Link><div className="flex items-center justify-between gap-2"><div className="flex flex-wrap gap-1">{!c.enabled&&<Badge variant="secondary">已暂停</Badge>}{c.mode!=='XHS_MCP'&&<Badge variant="secondary">{c.mode==='MOCK'?'模拟配置':'离线配置'}</Badge>}</div><ConfigActions config={c} disabled={!!editor||mutation.isPending} onToggle={()=>action(c)} onArchive={()=>action(c,true)}/></div></article>)}</aside>
        <div className="space-soft-swap">
            {editor?<ConfigEditor key={editor.kind==='new'?'new':editor.config.id} config={editor.kind==='edit'?editor.config:undefined} defaults={editor.kind==='new'?editor.defaults:undefined} onDirty={setDirty} onBusy={setBusy} onClose={()=>{setDirty(false);setEditor(null);focusActions();}} onSaved={saved=>{setDirty(false);setBusy(false);setEditor(null);setFeedback('配置已保存');requestAnimationFrame(()=>{navigate(`/configuration?tab=keywords&config=${saved.id}`);focusActions();});}}/>:
            <section className="config-summary">{selectedConfig?<><dl><dt>描述</dt><dd>{selectedConfig.name}</dd><dt>关键词内容</dt><dd className="whitespace-pre-wrap">{selectedConfig.keywords.join('\n')||'未设置'}</dd></dl><div className="action-row"><Button ref={editTrigger} variant="outline" disabled={!!selectedConfig.activeRunId||mutation.isPending} onClick={()=>setEditor({kind:'edit',config:selectedConfig})}>编辑配置</Button></div></>:<h2>尚无关键词配置</h2>}</section>}
        </div></div>}
    </>;
}
