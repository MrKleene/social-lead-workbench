import {useRef,useState} from 'react';
import {useConfig,useMcpReadiness,useWorkspaceMutation} from './use-collection';
import type {Config} from './types';
export function useSavedPostRead(config:Config,savedPostId:string,open:boolean,onAccepted:(id:string)=>void){
 const readiness=useMcpReadiness(open),current=useConfig(open?config.id:undefined),mutation=useWorkspaceMutation<{id:string}>();
 const [restartCheckpoint,setRestartCheckpoint]=useState(false);
 const [account,setAccount]=useState(''),[consent,setConsent]=useState(false),[uncertain,setUncertain]=useState(false),[accepted,setAccepted]=useState(false);
 const submitting=useRef(false),key=useRef<string|undefined>(undefined);
 const selected=account||readiness.data?.accounts?.find(a=>a.eligible)?.id||'';
 const c=current.data;
 const reason=readiness.isPending||current.isPending?'正在确认账号和任务状态':readiness.isError||current.isError?'无法确认当前状态':!readiness.data?.device?.online?'执行电脑离线':!readiness.data?.accounts?.some(a=>a.id===selected&&a.eligible)?'账号尚未核验，请先到账号中心检查登录':!c?.enabled?'配置已暂停':c.activeRunId||c.runs.some(r=>['RUNNING','QUEUED'].includes(r.status))?'已有任务正在运行':Date.parse(c.nextAllowedAt||'')>Date.now()?'请等待当前退避结束':null;
 const reset=()=>{if(uncertain)return;setConsent(false);setRestartCheckpoint(false);setUncertain(false);setAccepted(false);key.current=undefined;mutation.reset();};
 const submit=()=>{
  if(submitting.current||accepted||uncertain||reason||!consent)return;submitting.current=true;key.current??=crypto.randomUUID();
  mutation.mutate({path:`/collection/configs/${config.id}/runs`,body:{scenario:'READ_WINDOW',mode:'XHS_MCP',accountId:selected,consent:'account-read-window-v1',requestKey:key.current,readPlan:{rounds:1,postsPerRound:1,commentPages:1,savedPostId,...(restartCheckpoint?{restartCheckpoint:true}:{})}},onResponse:result=>{
   if(!result||typeof result.id!=='string'||!result.id||result.id.length>200){setUncertain(true);setConsent(false);return;}
   setAccepted(true);setConsent(false);onAccepted(result.id);
  }},{onError:()=>{setUncertain(true);setConsent(false);},onSettled:()=>{submitting.current=false;}});
 };
 return {restartCheckpoint,setRestartCheckpoint,readiness,current,mutation,selected,setAccount:(id:string)=>{setAccount(id);setConsent(false);},consent,setConsent,uncertain,accepted,reason,submit,reset};
}
