import {useState} from 'react';
import {Link} from 'react-router-dom';
import {useAuth} from '@/features/auth/use-auth';
import {Button} from '@/components/ui/button';
import {Empty,EmptyHeader,EmptyTitle} from '@/components/ui/empty';
import {ErrorNotice} from '@/components/feedback';
import {PageState} from '@/components/page-state';
import {useConfigurationEditor} from '@/features/work/use-configuration-editor';
import {useReplyTemplates,useReplyMutation} from './use-replies';
import {TemplateEditor} from './template-editor';
import '@/components/configuration-browser.css';
export function RepliesPage(){
 const {user}=useAuth(),admin=user?.role==='ADMIN',query=useReplyTemplates(admin),mutation=useReplyMutation();
 const state=useConfigurationEditor(query.data||[]),[feedback,setFeedback]=useState(''),item=state.selected;
 if(!admin)return <p>仅管理员可管理发送模板。<Link to="/work">返回工作台</Link></p>;
 if(query.isPending)return <PageState title="发送模板配置" loading/>;
 if(query.isError)return <PageState title="发送模板配置" error={query.error} onRetry={()=>void query.refetch()}/>;
 const busy=state.busy||mutation.isPending;
 return <><header className="page-heading"><h1>发送模板配置</h1><Button disabled={busy} onClick={()=>void state.create()}>新增模板</Button></header><ErrorNotice error={mutation.error}/>{feedback&&<p role="status">{feedback}</p>}<div className="configuration-browser"><aside className="configuration-items" aria-label="已有发送模板"><h2>已有模板 · {query.data.length}</h2>{query.data.map(t=><Button key={t.id} className="configuration-item" variant="ghost" aria-pressed={!state.editor&&item?.id===t.id} disabled={busy} onClick={()=>void state.select(t)}><span>{t.name}</span><small>{t.channel==='COMMENT'?'评论':'私信'} · {t._count?.configs||0} 份设置关联</small></Button>)}</aside><section className="configuration-detail" aria-label="模板内容">{state.editor?<TemplateEditor key={state.editor.key} item={state.editor.item} onDirty={state.setDirty} onBusy={state.setBusy} onCancel={()=>void state.cancel()} onSaved={id=>{state.saved(id);setFeedback('模板已保存');}}/>:item?<><header><h2>{item.name}</h2><div className="action-row"><Button variant="outline" size="sm" disabled={busy} onClick={()=>void state.edit()}>编辑模板</Button><Button variant="ghost" size="sm" disabled={busy} onClick={()=>mutation.mutate({path:`/reply-templates/${item.id}`,method:'DELETE',body:{version:item.version}},{onSuccess:()=>{state.saved();setFeedback('模板已删除，审计保留');}})}>删除</Button></div></header><dl><div><dt>使用渠道</dt><dd>{item.channel==='COMMENT'?'评论':'私信'}</dd></div><div><dt>模板内容</dt><dd>{item.body}</dd></div></dl></>:<Empty><EmptyHeader><EmptyTitle>暂无发送模板</EmptyTitle></EmptyHeader></Empty>}</section></div></>;
}
