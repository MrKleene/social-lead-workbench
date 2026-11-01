import { Alert, AlertDescription } from '@/components/ui/alert';
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
import {SettingsLoading} from '@/features/work/settings-loading';
import {accountStatusView} from './account-status';
import {hasSavedLogin,canRecover,accountName} from './account-presentation';
import {loginAvailabilityText} from './login-availability';
import './accounts.css';
import {AccountWorkspace} from './account-workspace';
import './account-candidate.css';
const titles={details:'账号详情',login:'扫码登录',recover:'手动检查登录',settings:'账号设置',device:'账号与设备设置',simulation:'添加模拟账号'};
export function AccountsPage(){
 const s=useAccountScreen(),dialog=s.account;
 const ready=s.availability==='ready';
 const status=dialog?accountStatusView(dialog,{admin:s.admin,readiness:s.readiness.data,contact:s.contact.data,readError:s.readiness.isError,replyError:s.contact.isError,loading:s.readiness.isPending||s.contact.isPending}):null;
 return <section className="account-center account-candidate">
  <AccountWorkspace screen={s}/>
  <Sheet open={!!s.panel} onOpenChange={v=>{if(!v)s.close();}}><SheetContent className="account-sheet" closeDisabled={s.state.mutation.isPending} onCloseAutoFocus={e=>{e.preventDefault();s.returnFocus.current?.focus();}}><SheetHeader><SheetTitle>{s.panel?titles[s.panel]:''}</SheetTitle><SheetDescription className={s.panel==='login'||s.panel==='recover'?undefined:'sr-only'}>{s.panel==='login'?'本人扫码确认，不自动采集或发送。':s.panel==='recover'?'可选检查，仅核对登录与身份，不采集、不发送。':s.panel==='details'?'历史核验与额度说明。':'按需设置，不影响已保存的业务记录。'}</SheetDescription></SheetHeader><div className="account-sheet-body" aria-busy={s.state.mutation.isPending}><SettingsLoading busy={s.state.mutation.isPending}/>
   {dialog&&s.panel!=='device'&&s.panel!=='simulation'&&<div className="account-dialog-identity"><strong>{accountName(dialog)}</strong><span>{dialog.platform==='XHS'?'小红书':'抖音'}{dialog.isDemo?' · 模拟账号':''}</span></div>}
   {s.panel==='details'&&dialog&&<><AccountDetails account={dialog} status={status} admin={s.admin}/>{s.admin&&ready&&!status?.issue&&dialog.status!=='RESTRICTED'&&<div className="account-login-actions">{hasSavedLogin(dialog)?canRecover(dialog)?<Button variant="outline" onClick={()=>s.open('recover',dialog)}>手动检查登录</Button>:<Button variant="outline" onClick={()=>s.open('settings',dialog)}>查看恢复信息</Button>:dialog.platform==='XHS'&&<Button onClick={()=>s.open('login',dialog)}>扫码登录</Button>}{hasSavedLogin(dialog)&&dialog.platform==='XHS'&&dialog.loginStatus!=='DEVICE_MISMATCH'&&s.caps.data?.sessionReplacement&&<Button variant="outline" onClick={()=>s.open('login',dialog)}>重新扫码</Button>}</div>}</>}
   {s.admin&&s.panel==='login'&&dialog&&(ready&&s.caps.data?<AccountLoginPanel key={dialog.id} accountId={dialog.id} replacement={hasSavedLogin(dialog)} capabilities={s.caps.data} onDone={s.finish}/>:<Alert role="alert"><AlertDescription>{loginAvailabilityText[s.availability]}</AlertDescription></Alert>)}
   {s.admin&&s.panel==='recover'&&dialog&&(ready?<SavedSessionPanel key={dialog.id} account={dialog}/>:<Alert role="alert"><AlertDescription>{loginAvailabilityText[s.availability]}</AlertDescription></Alert>)}
   {s.admin&&s.panel==='device'&&<><p>{loginAvailabilityText[s.availability]}</p>{s.availability==='error'&&<Button onClick={()=>void s.caps.refetch()}>重试读取扫码能力</Button>}<DeviceSettings/><InfoSection  title={<>离线演示与模拟账号</>}><p>不连接平台，不计入真实可用账号。</p><Button variant="outline" onClick={()=>s.open('simulation')}>添加模拟账号</Button></InfoSection></>}
   {s.admin&&s.panel==='settings'&&dialog&&<><AccountEditor key={`${dialog.id}:${s.saved}`} account={dialog} pending={s.state.mutation.isPending} onSave={body=>s.state.mutation.mutate({path:`/accounts/${dialog.id}`,method:'PATCH',body},{onSuccess:s.savedEditor})} onArchive={s.archive}/>{s.state.mutation.isSuccess&&<p role="status">设置已保存</p>}</>}
   {s.admin&&s.panel==='simulation'&&<AccountEditor pending={s.state.mutation.isPending} onSave={body=>s.state.mutation.mutate({path:'/accounts',body},{onSuccess:s.finish})}/>}
   <ErrorNotice error={s.state.mutation.error}/>
  </div></SheetContent></Sheet>
 </section>;
}
