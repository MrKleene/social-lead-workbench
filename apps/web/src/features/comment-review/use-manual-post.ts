import {useState,useRef} from 'react';
import {useQuery,useMutation,useQueryClient} from '@tanstack/react-query';
import {manualPostConsent,reviewUseConsent,type ManualReviewTask,type ManualReviewPreview,type ReviewPolicy} from '@crm/contracts';
import {api,send} from '@/lib/api';
export function useManualPost(policy:ReviewPolicy|undefined){
 const client=useQueryClient(),[picker,setPicker]=useState(false),[preview,setPreview]=useState<ManualReviewTask|null>(null),[offset,setOffset]=useState(0),[confirmed,setConfirmed]=useState(false),key=useRef(''),base=`/comment-review/policies/${policy?.id}`;
 const refresh=()=>client.invalidateQueries({queryKey:['comment-review']});
 const jobs=useQuery({queryKey:['comment-review','manual-jobs',policy?.id],queryFn:()=>api<ManualReviewTask[]>(base+'/manual-jobs'),enabled:!!policy,refetchInterval:3000,retry:false});
 const texts=useQuery({queryKey:['comment-review','manual-preview',preview?.id,offset],queryFn:()=>api<ManualReviewPreview>(`/comment-review/manual-jobs/${preview?.id}/preview?offset=${offset}`),enabled:!!preview,retry:false});
 const prepare=useMutation({mutationFn:(postId:string)=>send<ManualReviewTask>(base+'/manual-post','POST',{postId,revision:policy?.revision}),retry:false,onSuccess:async p=>{setPicker(false);setOffset(0);setConfirmed(false);key.current=crypto.randomUUID();setPreview(p.status==='PREVIEW'?p:null);await refresh();}});
 const confirm=useMutation({mutationFn:()=>send(`/comment-review/manual-jobs/${preview!.id}/confirm`,'POST',{hash:preview!.scopeHash,requestKey:key.current,consent:manualPostConsent,providerConsent:reviewUseConsent}),retry:false,onSuccess:async()=>{setPreview(null);await refresh();}});
 const cancel=useMutation({mutationFn:(id:string)=>send(`/comment-review/manual-jobs/${id}/cancel`,'POST',{}),retry:false,onSuccess:refresh});
 const busy=prepare.isPending||confirm.isPending;
 return {picker,setPicker,preview,offset,setOffset,confirmed,setConfirmed,jobs,texts,prepare,confirm,cancel,busy,close:()=>{if(!busy){setPreview(null);confirm.reset();}},refresh};
}
