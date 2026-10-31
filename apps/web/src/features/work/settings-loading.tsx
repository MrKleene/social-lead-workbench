import {useEffect,useState} from 'react';
import {Spinner} from '@/components/ui/spinner';
/** Feedback stays in the existing dialog; no second focus trap or scroll lock. */
export function SettingsLoading({busy}:{busy:boolean}){
 const [visible,setVisible]=useState(false);
 useEffect(()=>{if(!busy){setVisible(false);return;}const timer=setTimeout(()=>setVisible(true),180);return()=>clearTimeout(timer);},[busy]);
 return <><span className="sr-only" role="status">{busy?'正在保存设置':''}</span>{busy&&visible&&<div className="settings-loading-overlay" aria-hidden="true"><div className="settings-loading-indicator"><Spinner className="size-9" aria-hidden="true"/></div></div>}</>;
}
