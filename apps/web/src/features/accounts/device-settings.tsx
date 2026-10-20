import { useState, type Ref } from 'react';
import { Button } from '@/components/ui/button';
import { useDeviceSettings, type DeviceState } from './use-device-settings';
type Submit=(path:string,body:unknown,method?:'POST'|'PATCH')=>void;
function Enrollment({state,pending,submit}:{state:DeviceState;pending:boolean;submit:Submit}){
  const [name,setName]=useState('我的专用 Mac'),[root,setRoot]=useState(state.suggestedRoot||''),[consent,setConsent]=useState(false);
  return <div className="device-form"><label>设备名称<input value={name} maxLength={80} onChange={e=>setName(e.target.value)}/></label><label>执行机凭证根目录<input value={root} onChange={e=>setRoot(e.target.value)} spellCheck={false}/></label><p>允许区域：{state.allowedBase}/独立目录名。路径由执行机验证，不是浏览器所在电脑的目录。首版只支持本地 APFS 私有目录。</p><label className="login-consent"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>我批准此专用电脑，并同意在执行机保存可撤销的设备认证私钥</label><Button disabled={!consent||pending||!name.trim()||!state.capability.supported} onClick={()=>submit('/devices/approve',{candidateId:state.candidateId,name,credentialRoot:root,consent:'approve-local-device-v1'})}>批准注册专用电脑</Button></div>;
}
function Registered({device,pending,submit}:{device:NonNullable<DeviceState['device']>;pending:boolean;submit:Submit}){
  const [path,setPath]=useState(device.credentialRoot),[revoke,setRevoke]=useState(false);
  return <><dl><dt>执行设备</dt><dd>{device.name} · {device.os}</dd><dt>认证状态</dt><dd>{!device.enabled?'已撤销':device.online?'在线 · 签名已验证':'离线或尚未认证'}</dd><dt>账号数</dt><dd>{device.accountCount}</dd><dt>凭证目录</dt><dd className="login-storage">{device.credentialRoot}</dd><dt>公钥指纹</dt><dd className="login-storage">{device.keyFingerprint}</dd></dl>
    {device.enabled&&<div className="device-form"><label>新的执行机凭证根目录<input value={path} onChange={e=>setPath(e.target.value)} spellCheck={false}/></label><p>{device.accountCount?'已有会话：目录变更被阻止，需要另行明确迁移或重新登录；不会读取、搬运 Cookie。':'仅允许空私有目录；执行任务进行中不能修改。'}</p><Button variant="outline" disabled={pending||!device.online||device.accountCount>0||path===device.credentialRoot} onClick={()=>submit(`/devices/${device.id}/directory`,{version:device.version,path},'PATCH')}>验证并保存执行机目录</Button>{device.accountCount>0&&<p>撤销后，本版不会自动恢复已有账号绑定；再次使用需另行确认迁移或重新登录。</p>}<label className="login-consent"><input type="checkbox" checked={revoke} onChange={e=>setRevoke(e.target.checked)}/>我确认撤销此设备授权并停止其执行任务，保留业务数据与本地文件</label><Button variant="outline" disabled={!revoke||pending} onClick={()=>submit(`/devices/${device.id}/revoke`,{version:device.version,consent:'revoke-local-device-v1'})}>撤销设备授权</Button></div>}
    {!device.enabled&&<p>设备已撤销，无法执行扫码或会话核验。已有会话不会自动迁移、重新绑定或删除。</p>}
  </>;
}
export function DeviceSettings({ref}:{ref?:Ref<HTMLDetailsElement>}){
  const {query,mutation}=useDeviceSettings(),state=query.data;
  const submit:Submit=(path,body,method)=>mutation.mutate({path,body,method});
  return <details ref={ref} id="execution-device-settings" className="device-settings"><summary>专用电脑设置 · 仅管理员</summary><p>首版只启用一台专用电脑。登录工作台不等于授权此电脑执行；批准后本机保存独立设备密钥，可随时撤销。只读采集须逐次确认，评论和私信关闭。</p><p>Windows：未支持 / 未验证。远程设备接入未启用。</p>{query.isPending&&<p>读取执行机信息…</p>}{state&&!state.enabled&&<p>此临时环境未启用设备设置，请使用持久工作台。</p>}{state?.enabled&&<><p>{state.provider==='offline'?'离线验收：虚构设备密钥，不连接平台。':'本机执行适配器：批准前不生成长期设备密钥。'}</p>{state.device?.enabled||state.device?.accountCount?<Registered key={`${state.device!.id}:${state.device!.version}`} device={state.device!} pending={mutation.isPending} submit={submit}/>:<Enrollment state={state} pending={mutation.isPending} submit={submit}/>}</>}{(query.error||mutation.error)&&<p role="alert">{(query.error||mutation.error)?.message}</p>}</details>;
}
