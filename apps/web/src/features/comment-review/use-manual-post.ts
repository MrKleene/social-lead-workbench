import {useState,useRef} from 'react';
import {useQuery,useMutation,useQueryClient} from '@tanstack/react-query';
import {manualPostConsent,reviewUseConsent,type ManualReviewTask,type ManualReviewPreview,type ReviewPolicy} from '@crm/contracts';
import {api,send} from '@/lib/api';
export function useManualPost(policy:ReviewPolicy|undefined){
 const client=useQueryClient(),[open,setOpen]=useState(false),[preview,setPreview]=useState<ManualReviewTask|null>(null),[offset,setOffset]=useState(0),[confirmed,setConfirmed]=useState(false),[lastJobId,setLastJobId]=useState(''),key=useRef(''),base=`/comment-review/policies/${policy?.id}`;
 const refresh=()=>client.invalidateQueries({queryKey:['comment-review']});
 const jobs=useQuery({queryKey:['comment-review','manual-jobs',policy?.id],queryFn:()=>api<ManualReviewTask[]>(base+'/manual-jobs'),enabled:!!policy,refetchInterval:3000,retry:false});
 const texts=useQuery({queryKey:['comment-review','manual-preview',preview?.id,offset],queryFn:()=>api<ManualReviewPreview>(`/comment-review/manual-jobs/${preview?.id}/preview?offset=${offset}`),enabled:open&&!!preview,retry:false,notifyOnChangeProps:'all'});
 const prepare=useMutation({mutationFn:(postId:string)=>send<ManualReviewTask>(base+'/manual-post','POST',{postId,revision:policy?.revision}),retry:false,onSuccess:async p=>{setOffset(0);setConfirmed(false);key.current=crypto.randomUUID();setLastJobId(p.id);if(p.status==='PREVIEW')setPreview(p);else{setPreview(null);setOpen(false);}await refresh();}});
 const confirm=useMutation({mutationFn:()=>send(`/comment-review/manual-jobs/${preview!.id}/confirm`,'POST',{hash:preview!.scopeHash,requestKey:key.current,consent:manualPostConsent,providerConsent:reviewUseConsent}),retry:false,onSuccess:async()=>{setPreview(null);setOpen(false);await refresh();}});
 const cancel=useMutation({mutationFn:(id:string)=>send(`/comment-review/manual-jobs/${id}/cancel`,'POST',{}),retry:false,onSuccess:refresh});
 const busy=prepare.isPending||confirm.isPending;
 const clearPreview=()=>{setPreview(null);setConfirmed(false);setOffset(0);confirm.reset();};
 return {open,preview,offset,setOffset,confirmed,setConfirmed,lastJobId,jobs,texts,prepare,confirm,cancel,busy,start:()=>{if(!busy){clearPreview();prepare.reset();setOpen(true);}},back:()=>{if(!busy){clearPreview();prepare.reset();}},close:()=>{if(!busy){clearPreview();setOpen(false);}},refresh};
}
