import {useRef,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {api,send,ApiError} from '@/lib/api';
export type ModelSettings={configured:boolean;note:string;updatedAt:string|null;version:number;model:string;endpoint:'beijing-standard';dailyLimit:number;vault:{state:string;message:string};priceVersion:string;models:{id:string;priceDescription:string;priceVersion?:string}[];automaticTest:false};
export function credentialTransportAllowed(){return location.protocol==='https:'||(location.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(location.hostname));}
export function useModelSettings(){return useQuery({queryKey:['model-settings'],queryFn:()=>api<ModelSettings>('/model-settings'),retry:false});}
export function useModelForm(value:ModelSettings,onComplete:()=>void){
 const client=useQueryClient(),keyInput=useRef<HTMLInputElement>(null);
 const [model,setModel]=useState(value.model),[note,setNote]=useState(value.note),[dailyLimit,setDailyLimit]=useState(value.dailyLimit),[pricing,setPricing]=useState(false),[consent,setConsent]=useState(false),[deleting,setDeleting]=useState(false),[deleteConfirmed,setDeleteConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState<Error|null>(null);
 const clear=()=>{if(keyInput.current)keyInput.current.value='';};
 // Credentials never enter React Query variables/cache, localStorage, sessionStorage or URLs.
 const save=async()=>{
  if(busy||!pricing||!consent||!Number.isInteger(dailyLimit)||dailyLimit<1||dailyLimit>100)return;if(!credentialTransportAllowed()){clear();setError(new Error('请通过本机loopback或HTTPS配置Key'));return;}setBusy(true);setError(null);const key=keyInput.current?.value||'';clear();
  try{const result=await send<ModelSettings>('/model-settings','PUT',{version:value.version,model,endpoint:'beijing-standard',dailyLimit,note,...(key?{key}:{}),priceVersion:value.models.find(m=>m.id===model)?.priceVersion??value.priceVersion,confirmPricing:pricing,consent});client.setQueryData(['model-settings'],result);await client.invalidateQueries({queryKey:['collection']});onComplete();}
  catch(e){setError(new Error(e instanceof ApiError?e.message:'保存失败；原配置保留，请重新输入待替换的Key'));}finally{setBusy(false);}
 };
 const remove=async()=>{
  if(busy||!deleteConfirmed)return;clear();setBusy(true);setError(null);
  try{const result=await send<ModelSettings>('/model-settings','DELETE',{version:value.version,confirmation:'DELETE_MODEL_KEY'});client.setQueryData(['model-settings'],result);await client.invalidateQueries({queryKey:['collection']});onComplete();}
  catch(e){setError(new Error(e instanceof ApiError?e.message:'删除未确认，请刷新配置状态'));}finally{setBusy(false);}
 };
 const reset=()=>{clear();setModel(value.model);setNote(value.note);setDailyLimit(value.dailyLimit);setPricing(false);setConsent(false);setError(null);};
 return {reset,keyInput,model,setModel:(v:string)=>{setModel(v);setPricing(false);},note,setNote,dailyLimit,setDailyLimit:(v:number)=>{setDailyLimit(v);setPricing(false);},pricing,setPricing,consent,setConsent,deleting,setDeleting,deleteConfirmed,setDeleteConfirmed,busy,error,save,remove,clear};
}
