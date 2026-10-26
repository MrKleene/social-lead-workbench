import {useEffect,useRef,useState} from 'react';
import {useMutation,useQueryClient} from '@tanstack/react-query';
import {send} from '@/lib/api';
import type {McpReadiness} from '@/features/collection/types';
export const sessionCheckLabels:Record<string,string>={VERIFIED:'登录可用',CHECKING:'正在检查登录状态…',UNVERIFIED:'等待检查登录状态',CONNECTION_ERROR:'连接异常，暂时无法确认登录；请稍后重试',EXPIRED:'登录已失效，请重新扫码',MISSING:'本机会话缺失，请到账号中心处理',NEEDS_REVIEW:'账号身份或会话需人工核查',DEVICE_MISMATCH:'请在原执行设备检查',RESTRICTED:'平台限制，请先人工处理',RATE_LIMITED:'平台限流，请等待后重试',BUSY:'该账号正在执行任务，暂不重复检查',BUSY_OR_DEVICE_UNAVAILABLE:'账号正忙或设备不可用，请稍后重试',LOGIN_REQUIRED:'请先在账号中心扫码登录',DEVICE_UNAVAILABLE:'执行设备离线，请恢复连接'};
type CheckResult={state:string;cached?:boolean;retryAt?:string|null};
/** Check once per visit/account, never a background platform polling loop. */
export function useSessionPreflight(readiness:McpReadiness|undefined,enabled:boolean){
 const client=useQueryClient(),[chosen,setChosen]=useState(''),attempted=useRef(new Set<string>());
 const supported=readiness?.sessionCheckVersion===1;
 const candidate=readiness?.accounts?.find(a=>a.id===chosen)||(!chosen?readiness?.accounts?.find(a=>a.eligible||a.canCheck)||readiness?.accounts?.[0]:undefined);
 const mutation=useMutation({mutationFn:(id:string)=>send<CheckResult>(`/accounts/${id}/session/check`,'POST',{purpose:'collection-preflight'}),onSettled:async()=>{await Promise.all(['mcp-readiness','accounts'].map(key=>client.invalidateQueries({queryKey:[key]})));}});
 const check=async(id=candidate?.id)=>{if(!id)return null;attempted.current.add(id);setChosen(id);return mutation.mutateAsync(id);};
 useEffect(()=>{if(!enabled){attempted.current.clear();return;}if(!supported||!candidate||!readiness?.device?.online||mutation.isPending)return;if(!chosen)setChosen(candidate.id);if(candidate.eligible)attempted.current.add(candidate.id);if(candidate.canCheck&&!attempted.current.has(candidate.id)){attempted.current.add(candidate.id);void mutation.mutateAsync(candidate.id).catch(()=>{});}},[enabled,supported,candidate?.id,candidate?.canCheck,candidate?.eligible,readiness?.device?.online,mutation.isPending,chosen]);
 const currentResult=mutation.variables===candidate?.id?mutation.data:undefined;
 const state=mutation.isPending?'CHECKING':readiness?.device?.online===false?'DEVICE_UNAVAILABLE':candidate?.eligible?'VERIFIED':currentResult&&currentResult.state!=='VERIFIED'?currentResult.state:candidate?.reason;
 // A successful proof may carry the server's manual-check cooldown. It is not a retry warning.
 const retryAt=state&&['UNVERIFIED','CONNECTION_ERROR','RATE_LIMITED','BUSY','BUSY_OR_DEVICE_UNAVAILABLE'].includes(state)&&candidate?.retryAt&&Date.parse(candidate.retryAt)>Date.now()?candidate.retryAt:null;
 return {supported,candidate,working:mutation.isPending,error:candidate?.eligible||mutation.variables!==candidate?.id?null:mutation.error,message:state?sessionCheckLabels[state]||'登录状态暂未确认':'',retryAt,check,choose:(id:string)=>{setChosen(id);mutation.reset();}};
}
