import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { api } from '@/lib/api';
export type LoginView={id:string;requestKey:string;state:string;mode:string;image?:string;expiresAt:string;reason?:string|null};
const running=(s?:string)=>s==='STARTING'||s==='WAITING';
export function useAccountLogin(accountId:string){
  const client=useQueryClient(),[params]=useSearchParams(),active=params.get('module')==='accounts';
  const [view,setView]=useState<LoginView|null>(null),[error,setError]=useState(''),[now,setNow]=useState(Date.now()),[visible,setVisible]=useState(!document.hidden);
  const key=useRef<string|null>(null),generation=useRef(0),controller=useRef<AbortController|null>(null),current=useRef(view);current.current=view;
  const cancel=useCallback(async()=>{
    const requestKey=key.current;if(!requestKey)return;
    const version=++generation.current;controller.current?.abort();key.current=null;
    setView(v=>v?{...v,image:undefined,state:'CANCELLED'}:null);
    try{const result=await api<LoginView>(`/accounts/${accountId}/login/cancel`,{method:'POST',body:JSON.stringify({requestKey}),keepalive:true});if(version===generation.current)setView(result);void client.invalidateQueries({queryKey:['accounts']});}catch{if(version===generation.current)setError('取消请求未确认；服务端最迟在断联期限到达后停止等待。');}
  },[accountId,client]);
  useEffect(()=>{const change=()=>setVisible(!document.hidden);document.addEventListener('visibilitychange',change);const pagehide=()=>{void cancel();};window.addEventListener('pagehide',pagehide);return()=>{document.removeEventListener('visibilitychange',change);window.removeEventListener('pagehide',pagehide);void cancel();};},[cancel]);
  useEffect(()=>{if(!active||!visible)void cancel();},[active,visible,cancel]);
  useEffect(()=>{if(!running(view?.state)||!active||!visible)return;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[view?.state,active,visible]);
  const accept=useCallback((result:LoginView,version:number)=>{if(version!==generation.current)return;setNow(Date.now());setView(result);if(!running(result.state)){key.current=null;void client.invalidateQueries({queryKey:['accounts']});}},[client]);
  const start=async()=>{
    if(key.current||!active||!visible)return;
    const requestKey=crypto.randomUUID(),version=++generation.current;key.current=requestKey;controller.current=new AbortController();setError('');setNow(Date.now());
    setView({id:'',requestKey,state:'STARTING',mode:'',expiresAt:new Date(Date.now()+45000).toISOString()});
    try{accept(await api<LoginView>(`/accounts/${accountId}/login`,{method:'POST',body:JSON.stringify({requestKey,consent:'local-session-v1'}),signal:controller.current.signal}),version);}catch(e){if(version===generation.current){setError(e instanceof Error?e.message:'登录请求失败');await cancel();}}
  };
  useEffect(()=>{
    if(!active||!visible||!running(view?.state)||!key.current)return;
    const version=generation.current,requestKey=key.current;
    // One request at a time. Leaving the module aborts it and cancels the server lease.
    const timer=setTimeout(async()=>{controller.current=new AbortController();try{accept(await api<LoginView>(`/accounts/${accountId}/login/check`,{method:'POST',body:JSON.stringify({requestKey}),signal:controller.current.signal}),version);}catch(e){if(version===generation.current){setError(e instanceof Error?e.message:'状态检查失败');void cancel();}}},view?.state==='STARTING'?1000:Math.max(0,Math.min(10000,new Date(view!.expiresAt).getTime()-Date.now())));
    return()=>clearTimeout(timer);
  },[view,active,visible,accountId,accept,cancel]);
  const simulate=async(scenario:string)=>{if(!key.current)return;accept(await api<LoginView>(`/accounts/${accountId}/login/offline`,{method:'POST',body:JSON.stringify({requestKey:key.current,scenario})}),generation.current);};
  const seconds=view?Math.min(240,Math.max(0,Math.ceil((new Date(view.expiresAt).getTime()-now)/1000))):0;
  return {view,error,seconds,start,cancel,simulate,busy:running(view?.state),image:visible&&active&&seconds>0?view?.image:undefined};
}
