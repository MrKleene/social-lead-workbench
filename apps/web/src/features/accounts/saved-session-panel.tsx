import {useSavedSession} from './use-saved-session';
import {Button} from '@/components/ui/button';
import type {Account} from './types';
const results:Record<string,string>={VERIFIED:'本机会话已核验，可用于单次只读采集',EXPIRED:'登录已失效；原会话保留，当前不能采集',MISSING:'本机会话文件缺失，未恢复登录',NEEDS_REVIEW:'身份或保存状态不一致，未恢复登录',UNVERIFIED:'暂未完成核验，请稍后手动检查',DEVICE_MISMATCH:'需在原执行电脑恢复'};
export function SavedSessionPanel({account}:{account:Account}){
 const {consent,setConsent,verify}=useSavedSession(account.id),ref=account.sessionReference;
 return <section className="account-login-panel" aria-label="本地会话恢复">
  {ref?<><p>使用已保存的本机会话，不要求重新扫码。</p><label className="login-consent"><input type="checkbox" checked={consent} disabled={verify.isPending} onChange={e=>setConsent(e.target.checked)}/>同意检查此账号的登录状态和账号身份</label><Button disabled={!consent||verify.isPending||ref.state==='DEVICE_MISMATCH'} onClick={()=>verify.mutate()}>{verify.isPending?'正在检查…':'确认检查'}</Button></>:<p>没有可恢复的本机会话引用，需管理员核查。</p>}
  {verify.data&&<p role="status">{verify.data.provider==='offline'?'【离线模拟】':''}{results[verify.data.state]||'核验结果未知，未确认可用'}</p>}
  {verify.error&&<p role="alert">{verify.error.message}</p>}
  <details><summary>为什么要检查？</summary><p>登录信息由执行电脑保存，正常重启不会删除。重启后不会自动连接平台；这次检查会核对本地文件和实际登录身份。检查不会自动采集或发送。</p></details>
 </section>;
}
