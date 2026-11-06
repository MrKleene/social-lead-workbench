import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {useLocalEvidence} from './use-local-evidence';
const evidenceMessage=(code:string)=>({
 EVIDENCE_ACCOUNT_LOGIN_REQUIRED:'请先重新登录这条记录绑定的原小红书账号，再核对发送证据。',
 UNKNOWN_ATTEMPT_REQUIRED:'这条记录已不再是未知状态，请刷新后查看结果。',
 CANDIDATE_REPLY_ID_REQUIRED:'请填写要核对的候选回复 ID；它必须与原笔记、原评论和账号 ID 不同。',
 COMMENT_REFERENCE_UNAVAILABLE:'本机缺少这篇笔记的访问凭据，请先通过新采集找到同一笔记。',
 EVIDENCE_PREVIEW_CHANGED:'账号、记录或核对范围已变化，请重新预览后授权。',
 EVIDENCE_EXECUTOR_UNAVAILABLE:'本机专用核对组件尚未就绪。',
 EVIDENCE_REQUIRES_IDLE:'请先等待其他任务结束，或取消活动任务后再核对。',
 PLATFORM_PROCESS_RECONCILIATION_REQUIRED:'此前平台进程未确认停止，当前仍保持暂停。',
 EVIDENCE_AUTHORITY_CHANGED:'核对已取消、超时，或原账号和范围发生变化；继续保留未知结果。',
 EVIDENCE_NOT_EXACT:'未取得两次完全一致的消息证据；继续保留未知结果。',
 EVIDENCE_UNVERIFIED:'本次未能完成可靠读取；继续保留未知结果。',
 PLATFORM_PROCESS_STOP_UNCONFIRMED:'无法确认平台进程已停止，继续保留未知结果并暂停平台操作。',
} as Record<string,string>)[code]||'未能完成核对，请检查账号及任务状态后重新预览。';
export function LocalEvidence(){
 const e=useLocalEvidence(),[replyIds,setReplies]=useState<Record<string,string>>({});
 return <section className="local-panel"><h2>未知发送证据核对</h2><p>仅查看原账号、原对象和原内容；不输入、不发送。必须在两个独立会话取得相同证据并确认进程停止，才会标记为已确认。查不到不代表未发送，绝不会据此退款额度或重发。</p>{e.error&&<p role="alert">{evidenceMessage(e.error.message)}</p>}{e.notice&&<p role="status">{e.notice}</p>}<ul className="local-config-list">{e.overview.data?.attempts.map(a=><li key={a.id}><div><strong>{a.account_name} · {a.channel==='DM'?'私信':'评论'}</strong><small>目标：{a.recipient_id}</small><p>{a.content}</p>{a.channel==='COMMENT'&&<label>候选回复 ID<Input value={replyIds[a.id]??''} maxLength={24} onChange={ev=>setReplies(old=>({...old,[a.id]:ev.target.value}))}/><small>只作为查找线索，必须由平台返回证据核对；填写 ID 不会直接确认结果。</small></label>}<Button variant="outline" disabled={e.verify.isPending} pending={e.preview.isPending} onClick={()=>e.preview.mutate({attemptId:a.id,...(a.channel==='COMMENT'?{replyId:replyIds[a.id]}:{})})}>预览证据核对</Button></div></li>)}</ul>{!e.overview.data?.attempts.length&&<p>没有可核对的本地未知发送记录。旧档案缺少完整账号、内容或目标绑定的记录继续保留限制。</p>}
 {e.plan&&<div className="local-editor"><h3>核对范围</h3><p>{e.plan.accountName}：{e.plan.content}</p><label className="local-check"><input type="checkbox" checked={e.consent} disabled={e.verify.isPending} onChange={ev=>e.setConsent(ev.target.checked)}/>授权两次独立读取以上原消息。{e.plan.mayMarkRead?'打开私信会话可能将平台消息标记已读。':'只查看指定笔记和候选回复。'}不会发送或清除账号限制。</label><Button disabled={!e.consent||!e.plan.available} pending={e.verify.isPending} onClick={()=>e.verify.mutate()}>开始只读核对</Button>{!e.plan.available&&<p>本机专用核对组件尚未就绪。</p>}{e.verify.isPending&&<Button variant="outline" pending={e.cancel.isPending} onClick={()=>e.cancel.mutate()}>取消核对</Button>}</div>}
 {!!e.overview.data?.checks.length&&<ul>{e.overview.data.checks.map(c=><li key={c.id}>{new Date(c.started_at).toLocaleString()} · {({RUNNING:'正在读取证据',CONFIRMED:'原消息已确认',UNVERIFIED:'证据不足，保持未知',INTERRUPTED:'已中断，未自动重试'} as Record<string,string>)[c.state]||c.state}{c.details.reason?` · ${evidenceMessage(c.details.reason)}`:''}</li>)}</ul>}</section>;
}
