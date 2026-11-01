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
import {hasSavedLogin} from './account-presentation';
import {loginAvailabilityText} from './login-availability';
import './accounts.css';
import {AccountWorkspace} from './account-workspace';
import './account-candidate.css';
const titles={details:'账号详情',login:'扫码登录',recover:'检查登录状态',settings:'账号设置',device:'账号与设备设置',simulation:'添加模拟账号'};
export function AccountsPage(){
 const s=useAccountScreen(),dialog=s.account;
 const ready=s.availability==='ready';
 return <section className="account-center account-candidate">
  <AccountWorkspace screen={s}/>
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
