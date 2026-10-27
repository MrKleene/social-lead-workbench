import type {ContactAccount} from '@crm/contracts';
const labels:Record<string,string>={RESTRICTED:'账号受限',VERIFY_REQUIRED:'平台要求验证',RATE_LIMITED:'平台频率限制',REPLY_DISABLED:'评论权限受限',UNKNOWN:'账号待核验'};
export function SendReadiness(){return <div className="send-readiness" role="status"><span>识别已测 · 离线规则</span><span>发送未验收</span><span>账号受限或待核验</span><p>登录有效不等于允许发送。平台回执映射和发送资格尚未验收，自动联系保持关闭。模拟结果不代表真实送达。</p></div>;}
export function AccountSendEvidence({account}:{account:ContactAccount}){
 const e=account.sendEligibility;
 if(account.isDemo)return <p>模拟账号 · 不向平台发送</p>;
 return <div><p>{labels[e?.state??'UNKNOWN']} · 工作台 {account.workbenchStatus==='PAUSED'?'已暂停':account.workbenchStatus??'未记录'}</p><details><summary>发送资格与限制证据</summary><p>{e?.reason??'未检查发送权限，不能显示可发送。'}</p><p>检查时间：{e?.checkedAt?new Date(e.checkedAt).toLocaleString():'未检查'}{e?.stale?' · 证据过期或待核验':''}</p><p>截图未保存；限制文本与阶段记录不替代截图。未见限制提示不表示恢复正常。</p>{e?.evidence!=null&&<pre>{JSON.stringify(e.evidence,null,2)}</pre>}</details></div>;
}

export function RecentSendAttempts({attempts}:{attempts:import('@crm/contracts').RecentSendAttempt[]}){
 if(!attempts.length)return null;
 return <section className="contact-panel"><h2>最近发送尝试 · 含单次测试</h2><p>结果未知继续占用原日额度与收件人，不自动重试、不换号补发。历史不因新检查而改写。</p>{attempts.map(a=><details key={a.id}><summary>{a.accountLabel} · {a.outcome==='UNKNOWN'?'结果未知 · 保留占用':a.outcome==='CONFIRMED'?'平台已确认':a.outcome==='FAILED'?'历史失败 · 查看原证据':a.outcome} · {new Date(a.createdAt).toLocaleString()}</summary><p>{a.resolutionNote??'没有补充说明'}</p><p>原额度桶：{a.day}</p><p>截图未保存。没有阶段日志时不能推断实际提交次数。</p>{a.executionEvidence.length?<pre>{JSON.stringify(a.executionEvidence,null,2)}</pre>:<p>没有持久阶段证据；历史 UNKNOWN 保持未知。</p>}</details>)}</section>;
}
