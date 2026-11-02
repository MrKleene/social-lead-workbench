import {useRef,useState} from 'react';
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import type {AutoContactOverview,CaptureDisplay} from '@crm/contracts';
import {api,send} from '@/lib/api';
export type PendingReply=CaptureDisplay&{id:string;version:string;runId:string|null;postTitle:string;comment:string;score:number|null;content:string;reason:string|null;createdAt:string};
type Preview={previewId:string;token:string;expiresAt:string;accountLabel:string;notice:string;items:{id:string;content:string;comment:string;postTitle:string}[]};
export function usePendingReplies(enabled:boolean){
 const client=useQueryClient(),[offset,setOffset]=useState(0),[selected,setSelected]=useState<PendingReply[]>([]),[accountId,setAccount]=useState(''),[preview,setPreview]=useState<(Preview&{requestKey:string})|null>(null),[accepted,setAccepted]=useState(false),lock=useRef(false);
 const list=useQuery({queryKey:['pending-replies',offset],queryFn:()=>api<{items:PendingReply[];total:number}>(`/auto-contact/pending?offset=${offset}`),enabled,refetchInterval:5000});
 const overview=useQuery({queryKey:['auto-contact'],queryFn:()=>api<AutoContactOverview>('/auto-contact'),enabled,refetchInterval:5000});
 const prepare=useMutation({mutationFn:()=>send<Preview>('/auto-contact/pending/preview','POST',{accountId,jobs:selected.map(({id,version})=>({id,version}))}),retry:false,onSuccess:r=>{setPreview({...r,requestKey:crypto.randomUUID()});setAccepted(false);}});
 const confirm=useMutation({mutationFn:async()=>{if(!preview||lock.current)throw Error('请勿重复提交');lock.current=true;try{return await send('/auto-contact/pending/confirm','POST',{previewId:preview.previewId,token:preview.token,requestKey:preview.requestKey});}finally{lock.current=false;}},retry:false,onSuccess:async()=>{setPreview(null);setSelected([]);setAccepted(true);await Promise.all([client.invalidateQueries({queryKey:['pending-replies']}),client.invalidateQueries({queryKey:['auto-contact-jobs']}),client.invalidateQueries({queryKey:['journey']})]);}});
 const busy=prepare.isPending||confirm.isPending;
 const toggle=(j:PendingReply)=>{if(busy)return;setAccepted(false);prepare.reset();setSelected(s=>s.some(x=>x.id===j.id)?s.filter(x=>x.id!==j.id):s.length<20?[...s,j]:s);};
 const changeAccount=(id:string)=>{setAccount(id);setPreview(null);prepare.reset();confirm.reset();setAccepted(false);};
 return {list,overview,offset,setOffset,selected,toggle,accountId,changeAccount,preview,closePreview:()=>{if(!confirm.isPending){setPreview(null);confirm.reset();}},prepare,confirm,busy,accepted,clear:()=>setSelected([])};
}
