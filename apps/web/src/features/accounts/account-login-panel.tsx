import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useAccountLogin } from './use-account-login';
export type LoginCapabilities={enabled:boolean;mode:'real'|'offline'|'disabled';storageRoot:string;persistent?:boolean;deviceId?:string|null;deviceRequired?:boolean;device?:{name:string;os:string;online:boolean}|null};
const labels:Record<string,string>={STARTING:'正在申请二维码…',WAITING:'等待本人扫码确认',VERIFIED:'平台登录状态与稳定账号 ID 已验证',CANCELLED:'等待已取消',EXPIRED:'二维码已过期',NEEDS_REVIEW:'平台显示已登录，但缺少稳定 ID，未绑定',FAILED:'登录尝试失败，未绑定'};
const reasons:Record<string,string>={DEVICE_UNAVAILABLE:'专用电脑未批准、离线或认证失败，未执行平台请求。',DEVICE_AUTHORIZATION_ENDED:'设备授权已撤销或失效，已停止等待。',QR_FORMAT_UNSUPPORTED:'平台未返回支持的内嵌图片，未展示二维码。',ACCOUNT_ALREADY_BOUND:'此平台账号已绑定，不能重复绑定。',RATE_LIMITED:'平台限流，已停止。',RESTRICTED:'平台限制，已停止。',RUNTIME_RESTARTED:'工作台运行已结束，请重新确认授权。',LOGIN_UNAVAILABLE:'平台响应异常或超时，已停止等待。'};
export function AccountLoginPanel({accountId,capabilities}:{accountId:string;capabilities:LoginCapabilities}){
  const [consent,setConsent]=useState(false),login=useAccountLogin(accountId);
  return <section className="account-login-panel" aria-label="账号扫码登录">
    <h3>{capabilities.mode==='offline'?'离线扫码流程演示 · 不连接平台':'小红书扫码登录'}</h3>
    <p>{capabilities.mode==='offline'?'当前使用虚构离线状态，不打开平台、不保存真实平台会话。持久模式仅保存可恢复的离线验收文件。':'确认后会为此账号创建独立本地会话。扫码授权后，上游程序会保存可重复使用的登录会话；只读采集另需逐次选择账号并确认用途；评论和私信发送禁用。'}</p>
    {capabilities.device&&<p>实际执行设备：{capabilities.device.name} · {capabilities.device.os} · {capabilities.device.online?"在线且已认证":"未在线，不投递"}</p>}
    <p className="login-storage">保存位置：{capabilities.mode==='offline'?capabilities.storageRoot:`${capabilities.storageRoot}/${accountId}/新尝试ID/`}</p>
    <p>取消、离开或隐藏页面会停止等待。可能已写入的本地会话会保留，但文件存在不代表登录成功。{capabilities.persistent?'正常停止后业务记录与本地引用保留；重启后需主动核验，文件存在不等于在线。':'关闭工作台后临时 CRM 记录消失，会话目录保留。'}</p>
    {!login.busy&&login.view?.state!=='VERIFIED'&&<><label className="login-consent"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>我同意为此账号在上述本地目录保存登录会话，用于本人扫码和登录状态验证；只读采集须另行逐次确认</label><Button disabled={!consent} onClick={()=>void login.start()}>{login.view?'重新确认并获取新二维码':'确认并生成二维码'}</Button></>}
    {login.view&&<p role="status">{capabilities.mode==='offline'?'【离线模拟】':''}{labels[login.view.state]||login.view.state}{login.view.reason&&reasons[login.view.reason]?`：${reasons[login.view.reason]}`:''}</p>}
    {login.image&&<div className="login-qr">{capabilities.mode==='offline'?<div className="offline-qr-placeholder" role="img" aria-label="离线演示图案，不可扫码">离线演示<br/>不可扫码</div>:<img src={login.image} alt="本次小红书登录二维码" referrerPolicy="no-referrer"/>}<p>本次二维码剩余 {login.seconds} 秒；过期后需手动重新确认。</p></div>}
    {login.busy&&<Button variant="outline" onClick={()=>void login.cancel()}>取消等待</Button>}
    {capabilities.mode==='offline'&&login.view?.state==='WAITING'&&<div className="action-row"><Button onClick={()=>void login.simulate('SUCCESS')}>模拟扫码成功（离线）</Button><Button variant="outline" onClick={()=>void login.simulate('EXPIRED')}>模拟过期（离线）</Button></div>}
    {login.error&&<p role="alert">{login.error}</p>}
  </section>;
}
