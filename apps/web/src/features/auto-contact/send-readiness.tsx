import { Disclosure } from '@/components/disclosure';
import type {ContactAccount} from '@crm/contracts';
const labels:Record<string,string>={RESTRICTED:'账号受限',VERIFY_REQUIRED:'平台要求验证',RATE_LIMITED:'平台频率限制',REPLY_DISABLED:'评论权限受限',UNKNOWN:'账号待核验'};
export function SendReadiness(){return <div className="send-readiness" role="status"><span>规则开关</span><span>账号资格</span><span>执行结果</span><p>分别查看下方当前规则与账号证据；登录有效不等于允许发送。已执行结果以“回复记录”为准，模拟结果不代表真实送达。</p></div>;}
export function AccountSendEvidence({account}:{account:ContactAccount}){
 const e=account.sendEligibility;
 if(account.isDemo)return <p>模拟账号 · 不向平台发送</p>;
 return <div><p>{labels[e?.state??'UNKNOWN']} · 工作台 {account.workbenchStatus==='PAUSED'?'已暂停':account.workbenchStatus??'未记录'}</p><Disclosure title={<> 发送资格与限制证据 </>}><p>{e?.reason??'未检查发送权限，不能显示可发送。'}</p><p>检查时间：{e?.checkedAt?new Date(e.checkedAt).toLocaleString():'未检查'}{e?.stale?' · 证据过期或待核验':''}</p><p>截图未保存；限制文本与阶段记录不替代截图。未见限制提示不表示恢复正常。</p>{e?.evidence!=null&&<pre>{JSON.stringify(e.evidence,null,2)}</pre>}</Disclosure></div>;
}
