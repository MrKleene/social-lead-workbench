import { Alert, AlertDescription } from '@/components/ui/alert';
import { Empty } from '@/components/ui/empty';
import {Link} from 'react-router-dom';
import {InfoSection} from '@/components/information-panel';
import {Button} from '@/components/ui/button';
import {ErrorNotice} from '@/components/feedback';
import {Sheet,SheetContent,SheetHeader,SheetTitle,SheetDescription} from '@/components/ui/sheet';
import {AccountLoginPanel} from './account-login-panel';
import {SavedSessionPanel} from './saved-session-panel';
import {DeviceSettings} from './device-settings';
import {AccountEditor} from './account-editor';
import {useAccountScreen} from './use-account-screen';
import {accountName,accountRemark,accountTag,accountState,hasSavedLogin,canRecover} from './account-presentation';
import {loginAvailabilityText} from './login-availability';
import './accounts.css';
const titles={login:'扫码登录',recover:'检查登录状态',settings:'账号设置',device:'账号与设备设置',simulation:'添加模拟账号'};
export function AccountsPage(){
 const s=useAccountScreen(),a=s.state.account,dialog=s.account;
 const ready=s.availability==='ready';
 return <section className="account-center account-simple">
  <header className="account-heading"><div><h2>账号中心</h2><p>{s.rows.length} 个账号{s.admin?` · ${s.ready} 个可用于只读采集`:''}</p></div><div className="action-row">{s.admin&&<><Link to="/auto-contact">自动联系与账号矩阵</Link><Button variant="ghost" size="content" onClick={()=>s.open('device')}>更多设置</Button><Button disabled={s.adding||s.caps.isPending} onClick={()=>void s.add()}>{s.adding?'添加中…':'添加账号'}</Button></>}</div></header>
  {!s.admin&&<p className="account-hint">登录与恢复由管理员处理。</p>}
  {s.admin&&!ready&&<div className="account-issue" role="status"><span>{s.availability==='loading'?'正在检查登录服务…':s.availability==='error'?'暂时无法读取登录服务':s.availability==='device-required'?'首次使用，请先绑定执行电脑':s.availability==='device-unavailable'?'执行电脑离线或尚未认证':'扫码登录暂不可用'}</span><Button variant="ghost" size="content" onClick={()=>s.availability==='error'?void s.caps.refetch():s.open('device')}>{s.availability==='error'?'重试':'查看设置'}</Button></div>}
  <ErrorNotice error={s.state.query.error||s.state.mutation.error}/>{s.error&&<Alert role="alert"><AlertDescription>{s.error}</AlertDescription></Alert>}
  {s.state.query.isPending?<p role="status">加载账号…</p>:!s.rows.length?<Empty className="account-empty"><h3>添加你的第一个账号</h3><p>扫码确认后，登录信息保留在执行电脑。</p></Empty>:<div className="account-columns">
   <div className="account-list" aria-label="账号列表">{s.rows.map(row=><Button variant="ghost" size="content" className="account-card" key={row.id} aria-pressed={a?.id===row.id} onClick={()=>s.select(row.id)}><span>{row.platform==='XHS'?'小红书':'抖音'}</span><strong>{accountName(row)}</strong>{accountRemark(row)&&accountRemark(row)!==accountName(row)&&<small>{accountRemark(row)}</small>}<small>{accountTag(row)}</small><span>{accountState(row)}</span></Button>)}</div>
   {a&&<section className="account-detail" aria-label="账号详情"><div className="account-detail-heading"><div><h3>{accountName(a)}</h3><p className="account-current-status">{accountState(a)}</p></div>{s.admin&&<Button variant="ghost" size="content" onClick={()=>s.open('settings',a)}>账号设置</Button>}</div>
    {a.status==='RESTRICTED'?<Alert role="alert"><AlertDescription>平台限制尚未解除，请先处理；不会自动重试或换号。</AlertDescription></Alert>:a.loginProvider==='offline'?<p>此账号仅用于离线演示，不计入真实可用账号。</p>:['VERIFIED','PREVIOUSLY_VERIFIED'].includes(a.loginStatus||'')?<p>每项采集任务启动时自动核验登录；无需先手动检查。评论与私信发送关闭。</p>:hasSavedLogin(a)?<p>{a.loginStatus==='DEVICE_MISMATCH'?'请在原执行电脑恢复，不会搬运登录信息。':a.loginStatus==='EXPIRED'?s.caps.data?.sessionReplacement?'登录已失效，请重新扫码。':'登录已失效。可再次检查原会话；后台更新后才能重新扫码。':a.loginStatus==='MISSING'?s.caps.data?.sessionReplacement?'未找到本机会话，请在原执行电脑重新扫码。':'未找到本机会话，请检查原执行电脑。':a.loginStatus==='NEEDS_REVIEW'?'身份或本地保存状态不一致，请核查后再恢复。':'已保留本机会话引用；采集任务启动时会自动核验，无需先手动检查。'}</p>:<p>{a.platform==='XHS'?'用小红书扫码确认，无需填写密码。':'抖音扫码接入尚未开放。'}</p>}
    {s.admin&&ready&&a.status!=='RESTRICTED'&&<div className="action-row">{hasSavedLogin(a)?canRecover(a)?<Button variant={['VERIFIED','PREVIOUSLY_VERIFIED'].includes(a.loginStatus||'')?'outline':'default'} onClick={()=>s.open('recover',a)}>检查登录状态</Button>:<Button variant="outline" onClick={()=>s.open('settings',a)}>查看恢复信息</Button>:a.platform==='XHS'&&<Button onClick={()=>s.open('login',a)}>扫码登录</Button>}{hasSavedLogin(a)&&a.platform==='XHS'&&a.loginStatus!=='DEVICE_MISMATCH'&&s.caps.data?.sessionReplacement&&<Button variant={['EXPIRED','MISSING'].includes(a.loginStatus||'')?'default':'outline'} onClick={()=>s.open('login',a)}>重新扫码</Button>}</div>}
   </section>}
  </div>}
  <Sheet open={!!s.panel} onOpenChange={v=>{if(!v)s.close();}}><SheetContent className="account-sheet" onCloseAutoFocus={e=>{e.preventDefault();s.returnFocus.current?.focus();}}><SheetHeader><SheetTitle>{s.panel?titles[s.panel]:''}</SheetTitle><SheetDescription>{s.panel==='login'?'本人扫码确认，不自动采集或发送。':s.panel==='recover'?'仅检查此账号，不自动开始采集。':'按需设置，不影响已保存的业务记录。'}</SheetDescription></SheetHeader><div className="account-sheet-body">
   {s.admin&&s.panel==='login'&&dialog&&(ready&&s.caps.data?<AccountLoginPanel key={dialog.id} accountId={dialog.id} replacement={hasSavedLogin(dialog)} capabilities={s.caps.data} onDone={s.finish}/>:<Alert role="alert"><AlertDescription>{loginAvailabilityText[s.availability]}</AlertDescription></Alert>)}
   {s.admin&&s.panel==='recover'&&dialog&&(ready?<SavedSessionPanel key={dialog.id} account={dialog}/>:<Alert role="alert"><AlertDescription>{loginAvailabilityText[s.availability]}</AlertDescription></Alert>)}
   {s.admin&&s.panel==='device'&&<><p>{loginAvailabilityText[s.availability]}</p>{s.availability==='error'&&<Button onClick={()=>void s.caps.refetch()}>重试读取扫码能力</Button>}<DeviceSettings/><InfoSection  title={<>离线演示与模拟账号</>}><p>不连接平台，不计入真实可用账号。</p><Button variant="outline" onClick={()=>s.open('simulation')}>添加模拟账号</Button></InfoSection></>}
   {s.admin&&s.panel==='settings'&&dialog&&<><InfoSection  title={<>技术状态与历史记录</>}><dl><dt>当前登录状态</dt><dd>{accountState(dialog)}</dd><dt>历史确认时间（不代表当前在线）</dt><dd>{dialog.loginVerifiedAt?new Date(dialog.loginVerifiedAt).toLocaleString():'无'}</dd><dt>会话引用</dt><dd>{dialog.sessionReference?'已登记；检查登录状态可核验本机会话':'未登记'}</dd><dt>模拟任务额度</dt><dd>{dialog.occupied} / {dialog.dailyLimit}</dd><dt>内部暂停说明（非当前登录状态）</dt><dd>{dialog.pauseReason||'无'}</dd></dl></InfoSection><AccountEditor key={`${dialog.id}:${s.saved}`} account={dialog} pending={s.state.mutation.isPending} onSave={body=>s.state.mutation.mutate({path:`/accounts/${dialog.id}`,method:'PATCH',body},{onSuccess:s.savedEditor})} onArchive={s.archive}/>{s.state.mutation.isSuccess&&<p role="status">设置已保存</p>}</>}
   {s.admin&&s.panel==='simulation'&&<AccountEditor pending={s.state.mutation.isPending} onSave={body=>s.state.mutation.mutate({path:'/accounts',body},{onSuccess:s.finish})}/>}
   <ErrorNotice error={s.state.mutation.error}/>
  </div></SheetContent></Sheet>
 </section>;
}
