import {useState,useEffect,useRef} from 'react';
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {localApi,type LoginAttempt,type InboxPreview} from './local-api';
/** `onVerified` 用 ref 转发：调用方通常写内联箭头函数，直接进依赖会让轮询 effect 每帧重跑。 */
export function useLocalPlatform(options?:{onVerified?:()=>void}){
 const verified=useRef(options?.onVerified);verified.current=options?.onVerified;
 const client=useQueryClient(),[login,setLogin]=useState<LoginAttempt|null>(null),[notice,setNotice]=useState(''),[inboxPlan,setInboxPlan]=useState<(InboxPreview&{requestKey:string})|null>(null);
 const refresh=()=>client.invalidateQueries({queryKey:['local']});
 const accounts=useQuery({queryKey:['local','platform-accounts'],queryFn:()=>localApi('accountOverview')});
 const workflow=useQuery({queryKey:['local','workflow'],queryFn:()=>localApi('workflowOverview')});
 const configurations=useQuery({queryKey:['local','configurations'],queryFn:()=>localApi('configurations')});
 const rules=useQuery({queryKey:['local','automation-rules'],queryFn:()=>localApi('automationRules')});
 const receivers=useQuery({queryKey:['local','receivers'],queryFn:()=>localApi('inboxReceivers'),refetchInterval:5000});
 const begin=useMutation({mutationFn:(input:unknown)=>localApi('beginLogin',input),onSuccess:r=>{setLogin(r);setNotice('请使用对应小红书账号扫码。');void refresh();}});
 const poll=useQuery({queryKey:['local','login',login?.id],queryFn:()=>localApi('pollLogin',{id:login!.id}),enabled:!!login,refetchInterval:2000,retry:false});
 useEffect(()=>{if(poll.data?.state==='VERIFIED'){setLogin(null);setNotice('账号身份已核验，登录凭据已加密保存在本机。');void client.invalidateQueries({queryKey:['local']});verified.current?.();}},[poll.data,client]);
 useEffect(()=>{if(poll.error&&login){setLogin(null);setNotice('登录核验未完成，尝试已结束。请检查平台状态后重新获取二维码。');void client.invalidateQueries({queryKey:['local']});}},[poll.error,login,client]);
 const cancel=useMutation({mutationFn:()=>localApi('cancelLogin',{id:login?.id??accounts.data?.login?.id}),onSuccess:r=>{setLogin(null);setNotice(r.stopped?'已取消登录并清理临时文件。':'停止尚未确认，平台操作已暂停。');void refresh();}});
 const previewInbox=useMutation({mutationFn:(accountId:string)=>localApi('previewInbox',{accountId}),onSuccess:r=>setInboxPlan({...r,requestKey:crypto.randomUUID()})});
 const receive=useMutation({mutationFn:()=>localApi('authorizeInbox',{...inboxPlan,consent:'receive-inbox-may-mark-read-v1'}),onSuccess:()=>{setInboxPlan(null);setNotice('已授权接收 15 分钟，可在任务列表取消。');void refresh();}});
 return {rules,receivers,inboxPlan,setInboxPlan,previewInbox,receive,accounts,workflow,configurations,login,begin,poll,cancel,notice,error:accounts.error||workflow.error||begin.error||poll.error||cancel.error||previewInbox.error||receive.error};
}
