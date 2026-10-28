import { Alert, AlertDescription } from '@/components/ui/alert';
import { FormField } from '@/components/form-field';
import { Checkbox } from '@/components/ui/checkbox';
import {InfoDialog} from '@/components/information-panel';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useAccountLogin } from './use-account-login';
export type LoginCapabilities={enabled:boolean;saveConfirmationVersion?:number;sessionReplacement?:boolean;mode:'real'|'offline'|'disabled';storageRoot:string;persistent?:boolean;deviceId?:string|null;deviceRequired?:boolean;device?:{name:string;os:string;online:boolean}|null};
const labels:Record<string,string>={STARTING:'正在申请二维码…',WAITING:'等待本人扫码确认',SAVING:'登录已确认，正在保存到本机…',VERIFIED:'平台登录已确认',CANCELLED:'等待已取消',EXPIRED:'二维码已过期',NEEDS_REVIEW:'平台显示已登录，但缺少稳定 ID，未绑定',FAILED:'登录尝试失败，未绑定'};
const reasons:Record<string,string>={SESSION_SAVE_TIMEOUT:'保存确认超时，未替换原会话，请重新扫码。',SESSION_SAVE_UNCONFIRMED:'未能确认会话完整保存，请重新扫码；原会话保持不变。',SESSION_IDENTITY_MISMATCH:'扫码账号与原账号不一致，原会话未替换。',SESSION_CHANGED:'账号设置或会话已变化，请关闭后重新打开；原会话未替换。',DEVICE_UNAVAILABLE:'专用电脑未批准、离线或认证失败，未执行平台请求。',DEVICE_AUTHORIZATION_ENDED:'设备授权已撤销或失效，已停止等待。',QR_FORMAT_UNSUPPORTED:'平台未返回支持的内嵌图片，未展示二维码。',ACCOUNT_ALREADY_BOUND:'此平台账号已绑定，不能重复绑定。',RATE_LIMITED:'平台限流，已停止。',RESTRICTED:'平台限制，已停止。',RUNTIME_RESTARTED:'工作台运行已结束，请重新确认授权。',LOGIN_UNAVAILABLE:'平台响应异常或超时，已停止等待。'};
export function AccountLoginPanel({accountId,capabilities,onDone,replacement=false}:{accountId:string;replacement?:boolean;capabilities:LoginCapabilities;onDone?:()=>void}){
  const [consent,setConsent]=useState(false),login=useAccountLogin(accountId);
  const replacementAllowed=!replacement||capabilities.sessionReplacement===true;
  const consentText=replacement?'我同意扫码更新此账号的本机会话，仅同一账号核验成功后替换':'我同意在此执行电脑保存本账号登录会话，用于扫码和身份核验';
  return <section className="account-login-panel" aria-label="账号扫码登录">
    <h3>{capabilities.mode==='offline'?'离线扫码流程演示 · 不连接平台':replacement?'重新扫码登录':'小红书扫码登录'}</h3>
    <p>{capabilities.mode==='offline'?'离线演示，不连接平台。':'扫码确认后，登录信息由平台工具保存在本机，用于下次恢复。'}</p>
    {replacementAllowed&&!login.busy&&login.view?.state!=='VERIFIED'&&<><FormField className="login-consent"><Checkbox  checked={consent} onCheckedChange={e=>setConsent((e === true))}/>{consentText}</FormField><Button disabled={!consent} onClick={()=>{setConsent(false);void login.start(replacement);}}>{login.view?'重新确认并获取新二维码':'确认并生成二维码'}</Button></>}
    {!replacementAllowed&&<Alert role="alert"><AlertDescription>后台更新后才能重新扫码，原会话保留。</AlertDescription></Alert>}
    {replacement&&<p>请使用原小红书账号。取消或保存失败不会替换原会话。</p>}
    {login.view&&<p role="status">{capabilities.mode==='offline'?'【离线模拟】':''}{labels[login.view.state]||login.view.state}{login.view.reason&&reasons[login.view.reason]?`：${reasons[login.view.reason]}`:''}</p>}
    {login.image&&<div className="login-qr">{capabilities.mode==='offline'?<div className="offline-qr-placeholder" role="img" aria-label="离线演示图案，不可扫码">离线演示<br/>不可扫码</div>:<img src={login.image} alt="本次小红书登录二维码" referrerPolicy="no-referrer"/>}<p>本次二维码剩余 {login.seconds} 秒；过期后需手动重新确认。</p></div>}
    {login.busy&&<Button variant="outline" onClick={()=>void login.cancel()}>取消等待</Button>}
    {capabilities.mode==='offline'&&login.view?.state==='WAITING'&&<div className="action-row"><Button onClick={()=>void login.simulate('SUCCESS')}>模拟扫码成功（离线）</Button><Button variant="outline" onClick={()=>void login.simulate('EXPIRED')}>模拟过期（离线）</Button></div>}
    {login.view?.state==='VERIFIED'&&<><p>{capabilities.persistent?(login.view.localSaved?'已保存到本机，下次可恢复登录。':'本机会话已登记，保存状态待检查。'):'当前环境不支持重启后恢复。'}</p>{onDone&&<Button onClick={onDone}>返回账号</Button>}</>}
    <InfoDialog  title={<>本机保存与使用范围</>}><p>登录信息保存在实际执行电脑的私有会话目录，按账号隔离；不在浏览器中保存。正常重启保留本地文件，重启后需主动检查登录状态。</p>{capabilities.device&&<p>执行电脑：{capabilities.device.name} · {capabilities.device.online?'在线':'离线'}</p>}<p>取消、关闭此窗口或隐藏页面会停止等待；已写入的本地会话可能保留。采集需另行单次授权，评论与私信发送关闭。</p></InfoDialog>
    {login.error&&<Alert role="alert"><AlertDescription>{login.error}</AlertDescription></Alert>}
  </section>;
}
