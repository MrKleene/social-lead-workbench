import type { ReplyHistoryItem } from '@crm/contracts';
import { Button } from '@/components/ui/button';
import { ErrorNotice, Loading } from '@/components/feedback';
import { useReplyHistory } from './use-reply-history';
const labels: Record<string,string> = {CONFIRMED:'回复成功 · 平台已确认',NOT_ATTEMPTED:'未发送 · 提交前停止',UNKNOWN:'结果未知 · 保留占用',FAILED:'历史失败 · 未提交情况见原因',RESERVED:'已预占 · 等待执行',ATTEMPTED:'执行中 · 待确认',CANCELLED:'已取消',SIMULATED_SUCCESS:'模拟完成 · 未真实发送'};
const time = (value: string | null) => value ? new Date(value).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}) : '未记录';
function HistoryCard({item:a}:{item:ReplyHistoryItem}) {
    return <article className="reply-history-card" aria-label={`回复记录 ${a.id}`}>
        <div className="contact-heading"><strong className={`reply-outcome reply-outcome-${a.displayStatus.toLowerCase()}`}>{labels[a.displayStatus] ?? a.displayStatus}</strong><small>{a.origin==='RULE'?'规则自动任务':'单条受控测试'} · {a.channel==='COMMENT'?'评论回复':a.channel==='DM'?'私信':'渠道未保存'}</small></div>
        <div className="reply-participants"><strong>{a.senderName ?? '发送昵称未保存'}</strong><span>回复</span><strong>{a.recipientName ?? (a.recipientId ? `用户 ${a.recipientId}` : '收件人未保存')}</strong></div>
        <p className="reply-source">帖子：{a.postTitle ?? '标题未保存'}{a.postUrl && <> · <a href={a.postUrl} target="_blank" rel="noreferrer">查看原帖</a></>}</p>
        <p className="reply-original">原评论：{a.originalComment ?? '原评论未保存'}</p>
        <div className="contact-body"><small>回复正文</small><p>{a.content || '正文未保存'}</p></div>
        <p className="reply-time">{a.confirmedAt ? `确认时间：${time(a.confirmedAt)}` : `记录时间：${time(a.createdAt)}`}（北京时间）</p>
        <p className="reply-reason">{a.reason ?? '没有补充原因；不能根据日志缺失推断是否提交。'}</p>
        <details className="reply-details"><summary>查看记录详情与执行证据</summary><dl>
            <dt>记录 ID</dt><dd>{a.id}</dd><dt>发送身份</dt><dd>{a.senderId ?? '未保存'} · {a.senderNameSource}</dd>
            <dt>收件人 ID</dt><dd>{a.recipientId ?? '未保存'}</dd><dt>帖子 ID</dt><dd>{a.postId ?? '未保存'}</dd><dt>原评论 ID</dt><dd>{a.commentId ?? '未保存'}</dd>
            <dt>新回复 ID / 回执</dt><dd>{a.platformReceipt ?? '尚无可靠回执'}</dd><dt>记录建立</dt><dd>{time(a.createdAt)}</dd><dt>执行开始</dt><dd>{time(a.attemptedAt)}（不等于提交时间）</dd><dt>确认时间</dt><dd>{time(a.confirmedAt)}</dd><dt>原额度日</dt><dd>{a.day}</dd>
        </dl><p>截图未保存。结果未知保留额度与去重锁，不自动重发或换号补发。</p>
        <details><summary>阶段日志（{a.executionEvidence.length} 条）</summary>{a.executionEvidence.length ? <pre>{JSON.stringify(a.executionEvidence,null,2)}</pre> : <p>没有持久阶段证据，不能推断实际提交次数。</p>}</details></details>
    </article>;
}
export function ReplyHistory({enabled}:{enabled:boolean}) {
    const s=useReplyHistory(enabled),d=s.query.data;
    return <section id="reply-history" className="contact-panel reply-history" aria-labelledby="reply-history-title">
        <div className="contact-heading"><div><h2 id="reply-history-title">发送结果</h2><p>常规任务与单条测试统一记录；不受规则任务队列筛选影响。</p></div><Button variant="outline" onClick={()=>void s.query.refetch()} disabled={s.query.isFetching}>刷新回复历史</Button></div>
        <div className="contact-heading"><p>{d ? `${d.mode==='REAL'?'真实发送':'模拟记录'}累计 ${d.allTotal} 次尝试 · 平台已确认 ${d.confirmedTotal} 条` : '正在读取历史统计'}</p><label>历史结果<select aria-label="回复历史结果" value={s.outcome} onChange={e=>s.filter(e.target.value)}><option value="">全部结果</option><option value="CONFIRMED">回复成功</option><option value="NOT_ATTEMPTED">未发送（有明确证据）</option><option value="FAILED">全部历史失败</option><option value="UNKNOWN">结果未知</option><option value="RESERVED">已预占</option><option value="ATTEMPTED">执行中</option><option value="CANCELLED">已取消</option><option value="SIMULATED_SUCCESS">模拟完成</option></select></label></div>
        <ErrorNotice error={s.query.error}/>{s.query.isError && <p role="alert">历史读取失败，不能据此判断没有回复记录。{d?'下方保留上次成功读取的数据。':''}</p>}
        {s.query.isPending ? <Loading/> : d && <>
            {d.items.length ? <div className="reply-history-list">{d.items.map(a=><HistoryCard key={a.id} item={a}/>)}</div> : <p role="status">{s.outcome?'当前筛选没有记录。可切换“全部结果”查看其他历史。':'尚无发送尝试记录。'}</p>}
            <div className="contact-heading"><small>符合筛选 {d.total} 条 · 第 {Math.floor(s.offset/20)+1} 页 · 每页20条</small><div className="action-row"><Button variant="ghost" disabled={!s.offset||s.query.isFetching} onClick={()=>s.setOffset(Math.max(0,s.offset-20))}>上一页回复历史</Button><Button variant="ghost" disabled={s.offset+20>=d.total||s.query.isFetching} onClick={()=>s.setOffset(s.offset+20)}>下一页回复历史</Button></div></div>
        </>}
    </section>;
}
