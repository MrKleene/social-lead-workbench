import {Link} from 'react-router-dom';
import {Button} from '@/components/ui/button';
import {Spinner} from '@/components/ui/spinner';
import {ErrorNotice} from '@/components/feedback';
import {accountName,accountRemark,hasSavedLogin,canRecover} from './account-presentation';
import {accountStatusView} from './account-status';
import {useAccountScreen} from './use-account-screen';

type Screen = ReturnType<typeof useAccountScreen>;
export function AccountWorkspace({screen:s}:{screen:Screen}) {
 const a=s.state.account,ready=s.availability==='ready';
 const context={admin:s.admin,readiness:s.readiness.data,contact:s.contact.data,readError:s.readiness.isError,replyError:s.contact.isError,loading:s.readiness.isPending||s.contact.isPending};
 const status=a?accountStatusView(a,context):null;
 const count=s.state.query.isPending?'正在读取账号':s.state.query.isError?'账号列表读取失败':`${s.rows.length} 个账号`;
 return <>
  <header className="candidate-heading"><div><h1>账号中心</h1><p>{count} · {s.admin?'在自动化设置中选择采集和回复账号':'仅显示分配给你的账号'}</p></div>{s.admin&&<Button className="candidate-primary" disabled={s.adding||s.caps.isPending} onClick={()=>void s.add()}>{s.adding?'添加中…':'＋ 添加账号'}</Button>}</header>
  {!s.admin&&<p className="candidate-notice">登录与恢复由管理员处理。</p>}
  {s.admin&&!ready&&<div className="candidate-notice" role="status"><span>{s.availability==='loading'?'正在检查登录服务…':s.availability==='error'?'暂时无法读取登录服务':s.availability==='device-required'?'首次使用，请先绑定执行电脑':s.availability==='device-unavailable'?'执行电脑离线或尚未认证':'扫码登录暂不可用'}</span><Button variant="outline" onClick={()=>s.availability==='error'?void s.caps.refetch():s.open('device')}>{s.availability==='error'?'重试':'查看设置'}</Button></div>}
  <ErrorNotice error={s.state.query.error||s.state.mutation.error}/>
  {s.state.query.isError&&<Button variant="outline" onClick={()=>void s.state.query.refetch()}>重新读取账号</Button>}
  {s.error&&<p className="candidate-notice" role="alert">{s.error}</p>}
  {s.state.query.isPending?<div className="candidate-empty" role="status" aria-label="正在读取账号"><Spinner className="size-9"/><p>正在读取账号…</p></div>:s.state.query.isError&&!s.rows.length?null:!s.rows.length?<div className="candidate-empty"><h2>{s.admin?'添加你的第一个账号':'暂无分配给你的账号'}</h2><p>{s.admin?'扫码确认后，登录信息保留在执行电脑。':'请联系管理员分配账号；登录和用途设置由管理员管理。'}</p>{s.admin&&<p>账号用途在自动化设置中选择。</p>}</div>:<div className="candidate-columns">
   <aside className="candidate-list" aria-label="账号列表">
    <p className="candidate-section-label">全部账号 <span>{s.rows.length}</span></p>
    <div className="candidate-mobile-select"><label htmlFor="candidate-account-select">当前账号</label><select id="candidate-account-select" value={a?.id||''} onChange={e=>void s.select(e.target.value)}>{s.rows.map(row=><option key={row.id} value={row.id}>{accountName(row)}</option>)}</select></div>
    <div className="candidate-desktop-list">{s.rows.map(row=>{const v=accountStatusView(row,context);return <button type="button" className="candidate-card" key={row.id} aria-pressed={a?.id===row.id} onClick={()=>void s.select(row.id)}>
     <span className="candidate-card-top">{row.platform==='XHS'?'小红书':'抖音'}{row.isDemo?' · 模拟账号':''}{a?.id===row.id&&<span>当前查看</span>}</span><strong>{accountName(row)}</strong>
     {accountRemark(row)&&accountRemark(row)!==accountName(row)&&<small>备注：{accountRemark(row)}</small>}
     <span className="candidate-card-status">{v.issue?'平台风险待处理':v.login}</span>
     <span className="candidate-quota">今日已占用 / 日上限 <b>{row.occupied} / {row.dailyLimit}</b></span>
    </button>;})}</div>
   </aside>
   {a&&status&&<section className="candidate-detail" aria-label="账号详情">
    <header><div><p className="candidate-eyebrow">当前账号 · {a.platform==='XHS'?'小红书':'抖音'}</p><h2>{accountName(a)}</h2></div><Button variant="outline" onClick={()=>s.open('details',a)}>查看详情</Button></header>
    <p className="candidate-summary">登录、平台风险与任务资格分别核验，不能相互替代。</p>
    <dl className="candidate-status-grid"><div><dt>登录状态</dt><dd>{status.login}</dd></div><div><dt>平台风险</dt><dd>{status.risk}</dd></div><div><dt>采集用途</dt><dd>{status.collection}</dd></div><div><dt>评论回复用途</dt><dd>{status.reply}</dd></div></dl>
    {status.issue&&<div className="candidate-warning" role="alert"><strong>{status.issue}</strong><p>需先核查平台限制。重新扫码不能解除此记录。</p></div>}
    {status.unknown>0&&<div className="candidate-warning" role="alert"><strong>{status.unknown} 条回复结果待核查</strong><p>仍占用额度与去重锁；先核查记录，不能直接重发。</p><Link to="/reply-history">查看回复记录 →</Link></div>}
    {!status.issue&&<p className="candidate-help">{a.loginProvider==='offline'?'此账号仅用于离线演示，不计入真实可用账号。':hasSavedLogin(a)?'采集与回复会在执行前核验。登录有效不代表平台允许回复。':a.platform==='XHS'?'用小红书扫码确认，无需填写密码。':'抖音扫码接入尚未开放。'}</p>}
    {s.admin&&(s.readiness.isError||s.contact.isError)&&<Button variant="outline" onClick={()=>{void s.readiness.refetch();void s.contact.refetch();}}>重试读取资格</Button>}
    {s.admin&&ready&&!status.issue&&a.status!=='RESTRICTED'&&<div className="candidate-actions">{hasSavedLogin(a)?canRecover(a)?<Button variant={['VERIFIED','PREVIOUSLY_VERIFIED'].includes(a.loginStatus||'')?'outline':'default'} onClick={()=>s.open('recover',a)}>检查登录状态</Button>:<Button variant="outline" onClick={()=>s.open('settings',a)}>查看恢复信息</Button>:a.platform==='XHS'&&<Button onClick={()=>s.open('login',a)}>扫码登录</Button>}{hasSavedLogin(a)&&a.platform==='XHS'&&a.loginStatus!=='DEVICE_MISMATCH'&&s.caps.data?.sessionReplacement&&<Button variant={['EXPIRED','MISSING'].includes(a.loginStatus||'')?'default':'outline'} onClick={()=>s.open('login',a)}>重新扫码</Button>}</div>}
    <footer><span>账号用途由任务配置决定，无需手动暂停。</span>{s.admin&&<Button variant="ghost" onClick={()=>s.open('settings',a)}>账号设置</Button>}</footer>
   </section>}
  </div>}
  {s.admin&&<footer className="candidate-page-footer"><span>额度包含待核查记录，以业务账本为准。</span><div><Link to="/auto-contact">回复任务</Link><Button variant="ghost" onClick={()=>s.open('device')}>账号与设备设置</Button></div></footer>}
 </>;
}
