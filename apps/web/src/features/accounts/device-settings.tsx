import { Alert, AlertDescription } from '@/components/ui/alert';
import { FormField } from '@/components/form-field';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {InfoSection} from '@/components/information-panel';
import { useState, type Ref } from 'react';
import { Button } from '@/components/ui/button';
import { useDeviceSettings, type DeviceState } from './use-device-settings';
type Submit=(path:string,body:unknown,method?:'POST'|'PATCH')=>void;
function Enrollment({state,pending,submit}:{state:DeviceState;pending:boolean;submit:Submit}){
  const supported=state.capability.supported&&state.binding?.version===1;
  return <div className="device-form">
    <h3>专用电脑用途</h3>
    <p>绑定的是运行工作台执行程序的电脑，不一定是打开浏览器的电脑。系统由执行程序自动检测。</p>
    <dl><dt>实际执行电脑</dt><dd>{state.binding?.executionHost||'等待后端更新'} · {state.capability.os}</dd><dt>绑定后的权限</dt><dd>在这台执行机保管各账号的独立登录态。账号管理、采集、消息接收和发送仍分别受角色、配置与授权检查；设备绑定不会自动开始业务。</dd><dt>设备密钥</dt><dd>{state.provider==='offline'?'虚构离线测试密钥，不连接平台。':state.capability.os==='Windows'?'新绑定的认证私钥使用 Windows 当前用户 DPAPI 加密；换系统用户或解密失败时停止，不回退明文。':'新绑定的认证私钥由本机当前用户的 macOS 钥匙串保护；钥匙串锁定或不可访问时停止执行，不回退明文。'}</dd></dl>
    <p>点击下方按钮即批准这台执行电脑保存设备认证密钥并使用默认私有目录。平台账号仍需另行本人扫码，点击开始采集授权本轮读取；绑定不会自动扫码或采集。</p>
    {state.device&&!state.device.enabled&&<p>旧授权已撤销。再次绑定将建立新设备密钥；不会搬运或删除旧文件。</p>}
    {!state.binding&&<p role="status">一键绑定需要加载新版后端。请按升级说明在原终端重启同一持久实例，保留原数据库和端口。</p>}
    {state.capability.os==='Windows'&&<p>Windows 11 x64 适配代码已提供，实机验收待完成。真实平台执行还需要受信的 MCP 与浏览器构建；缺少依赖审阅时停止，不自动下载。</p>}{!state.capability.supported&&<p>此执行系统尚未支持；需要 macOS ARM64 或 Windows 11 x64 本机环境，远程设备接入未启用。</p>}
    <Button disabled={!supported||pending} onClick={()=>submit('/devices/bind',{candidateId:state.candidateId,consent:'bind-local-device-v1'})}>{pending?'正在绑定…':state.provider==='offline'?'一键绑定离线测试电脑':'一键绑定这台电脑'}</Button>
    <InfoSection  title={<>查看自动配置与存储边界</>}><p className="login-storage">平台会话默认目录：{state.suggestedRoot}</p><p>平台会话与设备密钥分开。MCP 当前需要本地会话文件，目录仅执行机用户可访问；平台会话本轮未增加应用层加密，也不会迁移旧会话。操作系统磁盘加密状态不由本应用保证。</p></InfoSection>
  </div>;
}
function Registered({device,state,pending,submit}:{device:NonNullable<DeviceState['device']>;state:DeviceState;pending:boolean;submit:Submit}){
  const [path,setPath]=useState(device.credentialRoot),[revoke,setRevoke]=useState(false);
  return <><dl><dt>执行设备</dt><dd>{device.name} · {device.os}</dd><dt>认证状态</dt><dd>{!device.enabled?'已撤销':device.online?'在线 · 签名已验证':'离线或尚未认证'}</dd><dt>账号数</dt><dd>{device.accountCount}</dd><dt>设备密钥保护</dt><dd>{device.keyProtection==='windows-dpapi-current-user'?'Windows 当前用户 DPAPI':device.keyProtection==='macos-login-keychain'?'macOS 当前用户钥匙串':state.provider==='offline'?'离线测试文件':device.keyProtection==='legacy-private-file'?'既有私有文件（未自动迁移）':'暂不可验证'}</dd></dl>
    {device.enabled&&!device.online&&state.binding&&<><p>请确认原系统用户的安全存储可访问、原工作台正在运行。重新检查会复用原绑定，不会重建密钥。</p><Button disabled={pending} onClick={()=>submit('/devices/bind',{candidateId:state.candidateId,consent:'bind-local-device-v1'})}>重新检查设备绑定</Button></>}
    <InfoSection  title={<>高级设置与撤销</>}><p className="login-storage">凭证目录：{device.credentialRoot}</p><p className="login-storage">公钥指纹：{device.keyFingerprint}</p>
    {device.enabled&&<div className="device-form"><FormField>新的执行机凭证根目录<Input value={path} onChange={e=>setPath(e.target.value)} spellCheck={false}/></FormField><p>{device.accountCount?'已有会话：目录变更被阻止，需要另行明确迁移或重新登录；不会读取、搬运 Cookie。':'仅允许空私有目录；执行任务进行中不能修改。'}</p><Button variant="outline" disabled={pending||!device.online||device.accountCount>0||path===device.credentialRoot} onClick={()=>submit(`/devices/${device.id}/directory`,{version:device.version,path},'PATCH')}>验证并保存执行机目录</Button>{device.accountCount>0&&<p>撤销后，本版不会自动恢复已有账号绑定；再次使用需另行确认迁移或重新登录。</p>}<FormField className="login-consent"><Checkbox  checked={revoke} onCheckedChange={e=>setRevoke((e === true))}/>我确认撤销此设备授权并停止其执行任务，保留业务数据与本地文件</FormField><Button variant="outline" disabled={!revoke||pending} onClick={()=>submit(`/devices/${device.id}/revoke`,{version:device.version,consent:'revoke-local-device-v1'})}>撤销设备授权</Button></div>}
    </InfoSection>
    {!device.enabled&&<p>设备已撤销，无法执行扫码或会话核验。已有会话不会自动迁移、重新绑定或删除。</p>}
  </>;
}
export function DeviceSettings({ref}:{ref?:Ref<HTMLElement>}){
  const {query,mutation}=useDeviceSettings(),state=query.data;
  const submit:Submit=(path,body,method)=>mutation.mutate({path,body,method});
  return <InfoSection ref={ref} id="execution-device-settings" className="device-settings" title={<>专用电脑设置 · 仅管理员</>}>{query.isPending&&<p>读取执行机信息…</p>}{state&&!state.enabled&&<p>此临时环境未启用设备设置，请使用持久工作台。</p>}{state?.enabled&&(state.device?.enabled||state.device?.accountCount?<Registered key={`${state.device!.id}:${state.device!.version}`} state={state} device={state.device!} pending={mutation.isPending} submit={submit}/>:<Enrollment state={state} pending={mutation.isPending} submit={submit}/>)}{mutation.isSuccess&&<p role="status">设备设置已更新。</p>}{(query.error||mutation.error)&&<Alert role="alert"><AlertDescription>{(query.error||mutation.error)?.message}</AlertDescription></Alert>}</InfoSection>;
}
