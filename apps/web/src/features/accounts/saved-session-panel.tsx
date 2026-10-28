import { Alert, AlertDescription } from '@/components/ui/alert';
import { FormField } from '@/components/form-field';
import { Checkbox } from '@/components/ui/checkbox';
import {InfoDialog} from '@/components/information-panel';
import {useSavedSession} from './use-saved-session';
import {Button} from '@/components/ui/button';
import type {Account} from './types';
const results:Record<string,string>={CHECKING:'登录检查正在进行',CONNECTION_ERROR:'连接异常，暂不能确认登录；不代表已退出，请稍后重试',RATE_LIMITED:'平台限流，请等待后重试',RESTRICTED:'平台限制，请先人工处理',BUSY:'账号正在执行任务，暂不重复检查',BUSY_OR_DEVICE_UNAVAILABLE:'账号正忙或执行设备不可用，请稍后重试',VERIFIED:'本次手动检查通过；采集任务启动时仍会核验',EXPIRED:'登录已失效；原会话保留，当前不能采集',MISSING:'本机会话文件缺失，未恢复登录',NEEDS_REVIEW:'身份或保存状态不一致，未恢复登录',UNVERIFIED:'暂未完成手动核验；采集任务启动时会自动核验',DEVICE_MISMATCH:'需在原执行电脑恢复'};
export function SavedSessionPanel({account}:{account:Account}){
 const {consent,setConsent,verify}=useSavedSession(account.id),ref=account.sessionReference;
 return <section className="account-login-panel" aria-label="本地会话恢复">
  {ref?<><p>使用已保存的本机会话，不要求重新扫码。</p><FormField className="login-consent"><Checkbox  checked={consent} disabled={verify.isPending} onCheckedChange={e=>setConsent((e === true))}/>同意检查此账号的登录状态和账号身份</FormField><Button disabled={!consent||verify.isPending||ref.state==='DEVICE_MISMATCH'} onClick={()=>verify.mutate()}>{verify.isPending?'正在检查…':'确认检查'}</Button></>:<p>没有可恢复的本机会话引用，需管理员核查。</p>}
  {verify.data&&<p role="status">{verify.data.provider==='offline'?'【离线模拟】':''}{results[verify.data.state]||'核验结果未知，未确认可用'}</p>}
  {verify.error&&<Alert role="alert"><AlertDescription>{verify.error.message}</AlertDescription></Alert>}
  <InfoDialog  title={<>为什么要检查？</>}><p>登录信息由执行电脑保存，正常重启不会删除。重启后不会自动连接平台；这次检查会核对本地文件和实际登录身份。检查不会自动采集或发送。</p></InfoDialog>
 </section>;
}
