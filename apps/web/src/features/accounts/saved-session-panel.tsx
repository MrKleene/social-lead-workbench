import { useSavedSession } from './use-saved-session';
import { Button } from '@/components/ui/button';
import type { Account } from './types';
export function SavedSessionPanel({account}:{account:Account}){
  const {consent,setConsent,verify}=useSavedSession(account.id);
  const ref=account.sessionReference;
  return <section className="account-login-panel" aria-label="本地会话恢复">
    <h3>{ref?.provider==='offline'?'离线模拟会话恢复':'本地会话恢复'}</h3>
    <p>业务记录与本机会话引用已保留。重启不自动连接平台，历史验证不代表当前在线。采集和发送仍禁用。</p>
    {ref?<><p className="login-storage">执行设备：{ref.deviceId}</p><p>最近确认：{ref.verifiedAt?new Date(ref.verifiedAt).toLocaleString():'尚无确认'}（历史记录）</p>
      <label className="login-consent"><input type="checkbox" checked={consent} disabled={verify.isPending} onChange={e=>setConsent(e.target.checked)}/>我同意使用此设备已保存的会话，仅核验登录状态和稳定账号 ID</label>
      <Button disabled={!consent||verify.isPending||ref.state==='DEVICE_MISMATCH'} onClick={()=>verify.mutate()}>{verify.isPending?'正在核验…':'验证本机已保存会话'}</Button>
      {['MISSING','EXPIRED','NEEDS_REVIEW'].includes(ref.state)&&<p>请先人工检查会话保存情况；本版本不会导入、复制或自动替换凭据。</p>}
    </>:<p>旧记录没有可信设备引用；本版本不自动关联遗留目录，需要单独迁移确认。</p>}
    {verify.error&&<p role="alert">{verify.error instanceof Error?verify.error.message:'核验未完成'}</p>}
  </section>;
}
