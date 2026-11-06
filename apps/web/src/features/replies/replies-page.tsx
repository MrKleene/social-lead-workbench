import {useState} from 'react';
import {Link} from 'react-router-dom';
import {useAuth} from '@/features/auth/use-auth';
import {Button} from '@/components/ui/button';
import {Empty,EmptyHeader,EmptyTitle} from '@/components/ui/empty';
import {PageState} from '@/components/page-state';
import {useConfigurationEditor} from '@/features/work/use-configuration-editor';
import {useReplyTemplates} from './use-replies';
import {DmPreviewButton} from '@/features/direct-messages/dm-preview-dialog';
import {TemplateEditor} from './template-editor';
import '@/components/configuration-browser.css';
export function RepliesPage({channel='COMMENT'}:{channel?:'COMMENT'|'DM'}){
 const title=channel==='DM'?'私信模板配置':'评论回复模板配置';
 const {user}=useAuth(),admin=user?.role==='ADMIN',query=useReplyTemplates(admin);
 const items=(query.data||[]).filter(t=>t.channel===channel),state=useConfigurationEditor(items),[feedback,setFeedback]=useState(''),item=state.selected;
 if(!admin)return <p>仅管理员可管理评论回复模板。<Link to="/work">返回工作台</Link></p>;
 if(query.isPending)return <PageState title={title} loading/>;
 if(query.isError)return <PageState title={title} error={query.error} onRetry={()=>void query.refetch()}/>;
 const busy=state.busy;
 return <><header className="page-heading"><h1>{title}</h1><Button disabled={busy} onClick={()=>void state.create()}>新增模板</Button></header>{feedback&&<p role="status">{feedback}</p>}<div className="configuration-browser"><aside className="configuration-items" aria-label="已有评论回复模板"><h2>已有配置 · {items.length}</h2>{items.map(t=><Button key={t.id} className="configuration-item" variant="ghost" aria-pressed={!state.editor&&item?.id===t.id} disabled={busy} onClick={()=>void state.select(t)}><span>{t.name}</span><small>{t.body}</small></Button>)}</aside><section className="configuration-detail" aria-label="模板内容">{state.editor?<TemplateEditor channel={channel} key={state.editor.key} item={state.editor.item} onDirty={state.setDirty} onBusy={state.setBusy} onCancel={()=>void state.cancel()} onSaved={id=>{state.saved(id);setFeedback('模板已保存');}}/>:item?<><header><h2>{item.name}</h2><div className="action-row"><DmPreviewButton template={item}/><Button variant="outline" size="sm" disabled={busy} onClick={()=>void state.edit()}>编辑模板</Button></div></header><dl><div><dt>描述</dt><dd>{item.name}</dd></div><div><dt>模板内容</dt><dd>{item.body}</dd></div></dl></>:<Empty><EmptyHeader><EmptyTitle>暂无评论回复模板</EmptyTitle></EmptyHeader></Empty>}</section></div></>;
}
