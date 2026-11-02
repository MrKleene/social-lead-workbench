import {useState} from 'react';
import {Link} from 'react-router-dom';
import {useAuth} from '@/features/auth/use-auth';
import {ModelSettingsBody} from './model-settings-panel';
export function ModelConfigurationPage(){
 const {user}=useAuth(),[busy,setBusy]=useState(false);
 if(user?.role!=='ADMIN')return <p>仅管理员可管理模型配置。<Link to="/work">返回工作台</Link></p>;
 return <><header className="page-heading"><h1>模型配置</h1></header><div className="model-configuration-content" aria-busy={busy}><ModelSettingsBody onBusyChange={setBusy}/></div></>;
}
