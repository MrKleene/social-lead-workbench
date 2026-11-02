import {Button} from '@/components/ui/button';
import {ErrorNotice} from '@/components/feedback';
import type {DmRequest} from './use-dm-preview';
import {useDmSend,dmOutcomeText} from './use-dm-send';
export function DmSendConfirmation({input}:{input:DmRequest}){
 const s=useDmSend(input),g=s.grant.data;
 return <section className="dm-send-confirmation" aria-label="确认私信"><ErrorNotice error={s.grant.error||s.confirm.error||s.status.error||s.verification.error}/>
 {!g?<Button variant="outline" disabled={s.grant.isPending} onClick={s.prepare}>{s.grant.isPending?'正在核对…':'核对发送信息'}</Button>:<><dl><div><dt>发送账号</dt><dd>{g.accountLabel}</dd></div><div><dt>收件人</dt><dd>{g.recipientNickname||'昵称未记录'}</dd></div></dl><pre>{g.content}</pre>
 {!s.submitted?<Button disabled={Date.parse(g.expiresAt)<=Date.now()} onClick={s.submit}>确认发送 1 条私信</Button>:<div role="status"><strong>{s.confirm.isPending?'正在发送并确认…':s.outcome?dmOutcomeText(s.outcome.outcome):'提交结果尚未确认，请先查询，勿再次发送'}</strong>{s.outcome?.reason&&<p>{s.outcome.reason}</p>}{s.outcome?.outcome==='UNKNOWN'&&<Button variant="outline" disabled={s.verification.isPending} onClick={s.verify}>{s.verification.isPending?'核查中…':'核查发送结果'}</Button>}{!s.confirm.isPending&&(!s.outcome||['RESERVED','ATTEMPTED'].includes(s.outcome.outcome))&&<Button variant="outline" disabled={s.status.isPending} onClick={s.check}>{s.status.isPending?'查询中…':'查询本次结果'}</Button>}</div>}
 </>}
 </section>;
}
