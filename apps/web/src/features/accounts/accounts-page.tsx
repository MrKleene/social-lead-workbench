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
import {AccountDetails} from './account-details';
import {accountStatusView} from './account-status';
import {Spinner} from '@/components/ui/spinner';
import {SettingsLoading} from '@/features/work/settings-loading';
import {accountName,accountRemark,hasSavedLogin,canRecover} from './account-presentation';
import {loginAvailabilityText} from './login-availability';
import './accounts.css';
const titles={details:'账号详情',login:'扫码登录',recover:'检查登录状态',settings:'账号设置',device:'账号与设备设置',simulation:'添加模拟账号'};
export function AccountsPage(){
 const s=useAccountScreen(),a=s.state.account,dialog=s.account;
 const ready=s.availability==='ready';
 const context={admin:s.admin,readiness:s.readiness.data,contact:s.contact.data,readError:s.readiness.isError,replyError:s.contact.isError,loading:s.readiness.isPending||s.contact.isPending};
 const status=a?accountStatusView(a,context):null;
 return <section className="account-center account-simple">
  <header className="account-heading"><div><h2>账号中心</h2><p>{s.rows.length} 个账号 · 在自动化设置中选择采集和回复账号</p></div><div className="action-row">{s.admin&&<><Link to="/auto-contact">回复任务</Link><Button variant="ghost" size="content" onClick={()=>s.open('device')}>更多设置</Button><Button disabled={s.adding||s.caps.isPending} onClick={()=>void s.add()}>{s.adding?'添加中…':'添加账号'}</Button></>}</div></header>
  {!s.admin&&<p className="account-hint">登录与恢复由管理员处理。</p>}
  {s.admin&&!ready&&<div className="account-issue" role="status"><span>{s.availability==='loading'?'正在检查登录服务…':s.availability==='error'?'暂时无法读取登录服务':s.availability==='device-required'?'首次使用，请先绑定执行电脑':s.availability==='device-unavailable'?'执行电脑离线或尚未认证':'扫码登录暂不可用'}</span><Button variant="ghost" size="content" onClick={()=>s.availability==='error'?void s.caps.refetch():s.open('device')}>{s.availability==='error'?'重试':'查看设置'}</Button></div>}
  <ErrorNotice error={s.state.query.error||s.state.mutation.error}/>{s.state.query.isError&&<Button variant="outline" onClick={()=>void s.state.query.refetch()}>重新读取账号</Button>}{s.error&&<Alert role="alert"><AlertDescription>{s.error}</AlertDescription></Alert>}
  {s.state.query.isPending?<div className="account-loading" role="status" aria-label="正在读取账号"><Spinner className="size-9"/></div>:s.state.query.isError&&!s.rows.length?null:!s.rows.length?<Empty className="account-empty"><h3>添加你的第一个账号</h3><p>扫码确认后，登录信息保留在执行电脑。</p></Empty>:<div className="account-columns">
   <div className="account-list" aria-label="账号列表">{s.rows.map(row=>{const v=accountStatusView(row,context);return <Button variant="ghost" size="content" className="account-card" key={row.id} aria-pressed={a?.id===row.id} onClick={()=>s.select(row.id)}>
    <span className="account-card-platform">{row.platform==='XHS'?'小红书':'抖音'}{row.isDemo?' · 模拟账号':''}</span><strong>{accountName(row)}</strong>
    {accountRemark(row)&&accountRemark(row)!==accountName(row)&&<small>备注：{accountRemark(row)}</small>}
    <span className="account-card-line"><span>登录</span><span>{v.login}</span></span>
    {v.issue&&<span className="account-risk-flag">平台风险待处理</span>}
    <span className="account-card-line"><span>今日回复额度</span><span>已用 {row.occupied} / {row.dailyLimit} 条</span></span>
   </Button>;})}</div>
   {a&&status&&<section className="account-detail" aria-label="账号详情"><div className="account-detail-heading"><h3>{accountName(a)}</h3><div className="action-row"><Button variant="ghost" size="content" onClick={()=>s.open('details',a)}>查看详情</Button>{s.admin&&<Button variant="ghost" size="content" onClick={()=>s.open('settings',a)}>账号设置</Button>}</div></div>
    <dl className="account-status-grid"><div><dt>登录</dt><dd>{status.login}</dd></div><div><dt>平台风险</dt><dd>{status.risk}</dd></div><div><dt>采集</dt><dd>{status.collection}</dd></div><div><dt>评论回复</dt><dd>{status.reply}</dd></div></dl>
    {status.issue&&<Alert className="account-risk" role="alert"><AlertDescription><strong>{status.issue}</strong><p>需先核查平台限制。重新扫码不能解除此记录。</p></AlertDescription></Alert>}
    {status.unknown>0&&<Alert role="alert"><AlertDescription>今日 {status.unknown} 条回复结果待核查，保留额度与收件人锁。<Link to="/reply-history">查看回复记录</Link></AlertDescription></Alert>}
    {!status.issue&&<p className="account-task-hint">{a.loginProvider==='offline'?'此账号仅用于离线演示，不计入真实可用账号。':hasSavedLogin(a)?'采集与回复会在执行前核验。登录有效不代表平台允许回复。':a.platform==='XHS'?'用小红书扫码确认，无需填写密码。':'抖音扫码接入尚未开放。'}</p>}
    {s.admin&&(s.readiness.isError||s.contact.isError)&&<Button variant="outline" onClick={()=>{void s.readiness.refetch();void s.contact.refetch();}}>重试读取资格</Button>}
    {s.admin&&ready&&!status.issue&&a.status!=='RESTRICTED'&&<div className="action-row">{hasSavedLogin(a)?canRecover(a)?<Button variant={['VERIFIED','PREVIOUSLY_VERIFIED'].includes(a.loginStatus||'')?'outline':'default'} onClick={()=>s.open('recover',a)}>检查登录状态</Button>:<Button variant="outline" onClick={()=>s.open('settings',a)}>查看恢复信息</Button>:a.platform==='XHS'&&<Button onClick={()=>s.open('login',a)}>扫码登录</Button>}{hasSavedLogin(a)&&a.platform==='XHS'&&a.loginStatus!=='DEVICE_MISMATCH'&&s.caps.data?.sessionReplacement&&<Button variant={['EXPIRED','MISSING'].includes(a.loginStatus||'')?'default':'outline'} onClick={()=>s.open('login',a)}>重新扫码</Button>}</div>}
   </section>}
  </div>}
  <Sheet open={!!s.panel} onOpenChange={v=>{if(!v)s.close();}}><SheetContent className="account-sheet" closeDisabled={s.state.mutation.isPending} onCloseAutoFocus={e=>{e.preventDefault();s.returnFocus.current?.focus();}}><SheetHeader><SheetTitle>{s.panel?titles[s.panel]:''}</SheetTitle><SheetDescription>{s.panel==='login'?'本人扫码确认，不自动采集或发送。':s.panel==='recover'?'仅检查此账号，不自动开始采集。':s.panel==='details'?'历史核验与额度说明。':'按需设置，不影响已保存的业务记录。'}</SheetDescription></SheetHeader><div className="account-sheet-body" aria-busy={s.state.mutation.isPending}><SettingsLoading busy={s.state.mutation.isPending}/>
   {s.panel==='details'&&dialog&&<AccountDetails account={dialog}/>}
   {s.admin&&s.panel==='login'&&dialog&&(ready&&s.caps.data?<AccountLoginPanel key={dialog.id} accountId={dialog.id} replacement={hasSavedLogin(dialog)} capabilities={s.caps.data} onDone={s.finish}/>:<Alert role="alert"><AlertDescription>{loginAvailabilityText[s.availability]}</AlertDescription></Alert>)}
   {s.admin&&s.panel==='recover'&&dialog&&(ready?<SavedSessionPanel key={dialog.id} account={dialog}/>:<Alert role="alert"><AlertDescription>{loginAvailabilityText[s.availability]}</AlertDescription></Alert>)}
   {s.admin&&s.panel==='device'&&<><p>{loginAvailabilityText[s.availability]}</p>{s.availability==='error'&&<Button onClick={()=>void s.caps.refetch()}>重试读取扫码能力</Button>}<DeviceSettings/><InfoSection  title={<>离线演示与模拟账号</>}><p>不连接平台，不计入真实可用账号。</p><Button variant="outline" onClick={()=>s.open('simulation')}>添加模拟账号</Button></InfoSection></>}
   {s.admin&&s.panel==='settings'&&dialog&&<><AccountEditor key={`${dialog.id}:${s.saved}`} account={dialog} pending={s.state.mutation.isPending} onSave={body=>s.state.mutation.mutate({path:`/accounts/${dialog.id}`,method:'PATCH',body},{onSuccess:s.savedEditor})} onArchive={s.archive}/>{s.state.mutation.isSuccess&&<p role="status">设置已保存</p>}</>}
   {s.admin&&s.panel==='simulation'&&<AccountEditor pending={s.state.mutation.isPending} onSave={body=>s.state.mutation.mutate({path:'/accounts',body},{onSuccess:s.finish})}/>}
   <ErrorNotice error={s.state.mutation.error}/>
  </div></SheetContent></Sheet>
 </section>;
}
