import {useRef,useState} from 'react';
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import type {CaptureDisplay} from '@crm/contracts';
import {api,send} from '@/lib/api';
export type PendingReply=CaptureDisplay&{id:string;version:string;runId:string|null;channel?:'COMMENT'|'DM';postTitle:string;comment:string;score:number|null;content:string;reason:string|null;createdAt:string};
export type PendingAccount={id:string;label:string;limit:number;occupied:number;remaining:number;available:boolean;reason:string|null};
type Options={jobId:string;version:string;status:string;reason:string|null;channel:string;accounts:PendingAccount[]};
type Preview={previewId:string;token:string;expiresAt:string;accountLabel:string;notice:string;items:{id:string;channel?:'COMMENT'|'DM';content:string;comment:string;postTitle:string}[]};
const active=['MANUAL_READY','QUEUED','WAITING_ACCOUNT','WAITING_QUOTA','RESERVED','ATTEMPTED'];
export function usePendingReplies(enabled:boolean){
 const client=useQueryClient(),[offset,setPage]=useState(0),[selected,setSelected]=useState<PendingReply|null>(null),[accountId,setAccount]=useState(''),[preview,setPreview]=useState<(Preview&{requestKey:string})|null>(null),[submitted,setSubmitted]=useState<string|null>(null),lock=useRef(false);
 const list=useQuery({queryKey:['pending-replies',offset],queryFn:({signal})=>api<{items:PendingReply[];total:number}>(`/auto-contact/pending?offset=${offset}`,{signal}),enabled,refetchInterval:5000});
 const options=useQuery({queryKey:['pending-reply-accounts',selected?.id,selected?.version],queryFn:({signal})=>api<Options>(`/auto-contact/pending/${encodeURIComponent(selected!.id)}/accounts`,{signal}),enabled:enabled&&!!selected,refetchInterval:5000});
 const result=useQuery({queryKey:['pending-reply-result',submitted],queryFn:({signal})=>api<{id:string;status:string;reason:string|null}>(`/auto-contact/pending/${encodeURIComponent(submitted!)}/result`,{signal}),enabled:enabled&&!!submitted,refetchInterval:q=>!q.state.data||active.includes(q.state.data.status)?3000:false});
 const selectedCurrent=!!selected&&options.data?.status==='PENDING_ACTION'&&options.data.version===selected.version;
 const account=options.data?.accounts.find(a=>a.id===accountId);
 const prepare=useMutation({mutationFn:()=>{if(!selected||!selectedCurrent||!account?.available)throw Error('请选择有效的待处理回复和账号');return send<Preview>('/auto-contact/pending/preview','POST',{accountId,jobs:[{id:selected.id,version:selected.version}]});},retry:false,onSuccess:r=>{setPreview({...r,requestKey:crypto.randomUUID()});setSubmitted(null);}});
 const confirm=useMutation({mutationFn:async()=>{if(!preview||lock.current)throw Error('请勿重复提交');lock.current=true;try{await send('/auto-contact/pending/confirm','POST',{previewId:preview.previewId,token:preview.token,requestKey:preview.requestKey});return preview.items[0].id;}finally{lock.current=false;}},retry:false,onSuccess:async id=>{setPreview(null);setSelected(null);setAccount('');setSubmitted(id);await Promise.all([client.invalidateQueries({queryKey:['pending-replies']}),client.invalidateQueries({queryKey:['auto-contact-jobs']}),client.invalidateQueries({queryKey:['journey']})]);}});
 const busy=prepare.isPending||confirm.isPending;
 const clear=()=>{if(busy)return;setSelected(null);setAccount('');setPreview(null);prepare.reset();confirm.reset();};
 const toggle=(j:PendingReply)=>{if(busy)return;setSubmitted(null);setAccount('');setPreview(null);prepare.reset();confirm.reset();setSelected(s=>s?.id===j.id?null:j);};
 const changeAccount=(id:string)=>{if(busy)return;setAccount(id);setPreview(null);prepare.reset();confirm.reset();};
 return {list,options,result,submitted,offset,setOffset:(n:number)=>{clear();setPage(n);},selected,toggle,selectedCurrent,account,accountId,changeAccount,preview,closePreview:()=>{if(!confirm.isPending){setPreview(null);confirm.reset();}},prepare,confirm,busy,clear};
}
