import { Link } from 'react-router-dom';
import { ErrorNotice } from '@/components/feedback';
import { useMcpReadiness } from './use-collection';
export function AccountReadChoice({accountId,onAccount,consent,onConsent}:{accountId:string;onAccount:(id:string)=>void;consent:boolean;onConsent:(yes:boolean)=>void}){
 const query=useMcpReadiness(),state=query.data;
 return <section className="account-login-panel" aria-label="本次只读账号授权">
  <h3>{state?.mode==='XHS_FIXTURE'?'离线虚构采集验收':'真实只读采集 · 单次授权'}</h3>
  <p>最多 3 篇帖子，仅已读评论窗口，不保证全量。关键词命中仅代表可能有需求，未同意营销；不评论、不私信、不自动换号或重复运行。</p>
  <label>本次执行账号<select aria-label="本次执行账号" value={accountId} onChange={e=>{onAccount(e.target.value);onConsent(false);}}><option value="">请选择已核验账号</option>{state?.accounts?.map(a=><option key={a.id} value={a.id} disabled={!a.eligible}>{a.label} · {a.platformUserId||'缺少稳定 ID'}{a.eligible?'':' · 需登录或核验'}</option>)}</select></label>
  <p>执行设备：{state?.device?`${state.device.name} · ${state.device.online?'在线且已认证':'离线，不投递'}`:'尚未批准'}。<Link to="/work?module=accounts">前往账号中心批准设备、扫码或核验</Link></p>
  <label className="check-label"><input type="checkbox" checked={consent} disabled={!accountId||!state?.device?.online} onChange={e=>onConsent(e.target.checked)}/>我确认使用所选账号的本机已保存会话，仅执行当前配置的一轮只读采集</label>
  <ErrorNotice error={query.error}/>
 </section>;
}
