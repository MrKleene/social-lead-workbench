import {SelectedReplyAccounts,ContactResultsTable,ContactResultsPagination} from './contact-results';
import {useSearchParams} from 'react-router-dom';
import {PendingReplies} from './pending-replies';
import {PageState} from '@/components/page-state';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {Field,FieldLabel} from '@/components/ui/field';
import {useId} from 'react';
import { SelectField, SelectOption } from '@/components/select-field';
import { Link } from 'react-router-dom';
import { contactStatuses, contactStatusLabel } from '@crm/contracts';
import { Button } from '@/components/ui/button';
import { ErrorNotice, Loading } from '@/components/feedback';
import { useAuth } from '@/features/auth/use-auth';
import { useAutoContact } from './use-auto-contact';
import { ContactJobDetail } from './contact-job-detail';
import './auto-contact.css';
export function AutoContactPage({scope,onSettings,readOnly=false}:{readOnly?:boolean;scope?:{runId:string;configId:string;platform?:string};onSettings?:()=>void}={}) {
    const [params]=useSearchParams(),filterId=useId();
    const { user } = useAuth(), s = useAutoContact(user?.role === 'ADMIN',scope?.runId), d = s.overview.data, r = scope?.platform ? d?.rules.find(rule=>rule.platform===scope.platform) : s.rule;
    if (user?.role !== 'ADMIN')
        return <p>自动回复仅由管理员管理。<Link to="/work">返回工作台</Link></p>;
    if(!scope&&params.get('view')==='pending')return <PendingReplies/>;
    if (s.overview.isPending)
        return <PageState title="自动回复" loading/>;
    if (!d)
        return <PageState title="自动回复" error={s.overview.error} onRetry={()=>void s.overview.refetch()}/>;
    return <section className="auto-contact-page contact-results-page"><header className="contact-heading"><div>{scope?<h2>自动回复</h2>:<h1>自动回复</h1>}</div></header>
 {!readOnly&&!d.capability.available&&d.capability.reason&&<Alert role="status"><AlertDescription>{d.capability.reason}</AlertDescription></Alert>}
 {!readOnly&&r?.pauseReason&&<Alert role="alert"><AlertDescription>平台发送已暂停：{r.pauseReason}。核查限制前不换号。</AlertDescription></Alert>}
 {!readOnly&&<><ErrorNotice error={s.overview.error||s.cancel.error}/><SelectedReplyAccounts data={d} rule={r}/></>}
 <section className="contact-panel contact-results-panel"><div className="contact-results-toolbar"><h2>{scope?'本轮回复结果':'回复任务'}</h2><div className="contact-results-controls"><Field className="contact-status-filter"><FieldLabel className="sr-only" htmlFor={filterId}>任务状态</FieldLabel><SelectField id={filterId} aria-label="联系任务状态" value={s.status} onValueChange={e=>s.setStatus(e)}><SelectOption value="">全部状态</SelectOption>{contactStatuses.map(x=><SelectOption key={x} value={x}>{contactStatusLabel[x]}</SelectOption>)}</SelectField></Field>{!readOnly&&<Button asChild variant="outline" size="sm"><Link to="/auto-contact?view=pending">待处理回复</Link></Button>}</div></div>
 <ErrorNotice error={s.jobs.error}/>{s.jobs.isError?<Button variant="outline" size="sm" onClick={()=>void s.jobs.refetch()}>重试读取结果</Button>:s.jobs.isPending?<Loading/>:!s.jobs.data?.items.length?<p className="contact-results-empty">{s.status?'没有符合此状态的回复任务':'暂无回复任务'}</p>:<ContactResultsTable items={s.jobs.data.items} onOpen={j=>{s.trigger.current=document.activeElement as HTMLElement;s.setDetail(j);}}/>}
 <ContactResultsPagination total={s.jobs.isError?undefined:s.jobs.data?.total} offset={s.offset} pending={s.jobs.isFetching} onChange={s.setOffset}/></section>
 <ContactJobDetail job={s.detail} onReturnFocus={() => s.trigger.current?.focus()} onClose={() => s.setDetail(null)} onCancel={readOnly?undefined:id => s.cancel.mutate(id)} busy={s.busy}/>
 </section>;
}
