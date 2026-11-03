import {settingsDeadline} from './settings-request';
import {useRef,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {settingsApi as api,settingsSend as send} from './settings-request';
export type Preferences={id:string;version:number;configId:string|null;policyId:string|null};
export type Template={id:string;version:number;name:string;body:string;channel:'COMMENT'|'DM'|'GENERAL'};
let selectionQueue:Promise<unknown>=Promise.resolve();
export function useAutomationPreferences(enabled=true){return useQuery({queryKey:['automation-preferences'],queryFn:()=>api<Preferences>('/auto-contact/preferences'),enabled,retry:false});}
export function useSettingsOperation(){
 const pending=useRef(false);
 const client=useQueryClient(),[busy,setBusy]=useState(false),[error,setError]=useState<Error|null>(null),[message,setMessage]=useState('');
 const refresh=()=>settingsDeadline(()=>Promise.all(['automation-preferences','collection','comment-review','auto-contact','accounts','model-settings','reply-templates'].map(key=>client.invalidateQueries({queryKey:[key]}))));
 const run=async(action:()=>Promise<void>)=>{if(pending.current)return;pending.current=true;setBusy(true);setError(null);setMessage('');try{await action();}catch(e){setError(e instanceof Error?e:new Error('保存未完成，请检查后重试'));}finally{try{await refresh();}catch(e){setError(previous=>previous||(e instanceof Error?e:new Error('重新读取失败，请核对保存结果')));}finally{pending.current=false;setBusy(false);}}};
 const select=(patch:{configId?:string;policyId?:string})=>{
  const action=async()=>{const current=await api<Preferences>('/auto-contact/preferences');
   if(Object.entries(patch).every(([key,value])=>current[key as 'configId'|'policyId']===value))return current;
   const next=await send<Preferences>('/auto-contact/preferences','PUT',{version:current.version,...patch});client.setQueryData(['automation-preferences'],next);return next;};
  const next=selectionQueue.then(action,action);selectionQueue=next.catch(()=>undefined);return next;
 };
 return {client,busy,error,message,setMessage,run,select,refresh};
}
