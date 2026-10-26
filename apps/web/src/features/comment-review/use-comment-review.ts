import {useState} from 'react';
import {useQuery,useMutation,useQueryClient} from '@tanstack/react-query';
import {reviewUseConsent,semanticBatchConsent,type ReviewPolicy,type ReviewOverview,type ReviewPosts,type ReviewResults,type SemanticPreview,type ReviewScope} from '@crm/contracts';
import {api,send} from '@/lib/api';
import {useDraftGuard} from '@/features/work/draft-guard';
export function useReviewOverview(enabled:boolean){return useQuery({queryKey:['comment-review'],queryFn:()=>api<ReviewOverview>('/comment-review'),enabled,retry:false});}
export function useReviewWorkspace(policy:ReviewPolicy|undefined,overview:ReviewOverview){
 const client=useQueryClient(),id=policy?.id||'workspace',base=`/comment-review/policies/${id}`;
 const [draft,setDraft]=useState<{target:string;version:number}|null>(null),[scope,setScope]=useState<'ALL'|'POSTS'>('ALL'),[postIds,setPostIds]=useState<string[]>([]),[postOffset,setPostOffset]=useState(0),[resultOffset,setResultOffset]=useState(0),[authorization,setAuthorization]=useState(false),[preview,setPreview]=useState<SemanticPreview|null>(null),[confirmed,setConfirmed]=useState(false),[requestKey,setRequestKey]=useState('');
 const target=draft?.target??policy?.target??'',dirty=target!==(policy?.target??'');const discard=useDraftGuard(dirty,'lead');
 const refresh=()=>client.invalidateQueries({queryKey:['comment-review']});
 const posts=useQuery({queryKey:['comment-review','posts',postOffset],queryFn:()=>api<ReviewPosts>(`/comment-review/posts?offset=${postOffset}`),enabled:scope==='POSTS',retry:false});
 const results=useQuery({queryKey:['comment-review','results',id,resultOffset],queryFn:()=>api<ReviewResults>(`${base}/results?offset=${resultOffset}`),enabled:!!policy,retry:false});
 const save=useMutation({mutationFn:()=>send<ReviewPolicy>(base,'PUT',{version:draft?.version??policy?.version??0,target}),retry:false,onSuccess:async()=>{setDraft(null);setPreview(null);await refresh();}});
 const toggle=useMutation({mutationFn:({enabled,consent=false}:{enabled:boolean;consent?:boolean})=>send(base+'/control','PATCH',{version:policy?.version,enabled,...(consent?{consent:reviewUseConsent,modelVersion:overview.modelVersion,priceVersion:overview.connection.priceVersion}:{})}),retry:false,onSuccess:async()=>{setAuthorization(false);setPreview(null);await refresh();}});
 const prepare=useMutation({mutationFn:async()=>{setPreview(null);setConfirmed(false);const selection:ReviewScope=scope==='ALL'?{kind:'ALL'}:{kind:'POSTS',postIds};const batch=await send<{reviewIds:string[];count:number}>(base+'/prepare','POST',{version:policy?.version,scope:selection});if(!batch.count)return null;return send<SemanticPreview>(base+'/preview','POST',{reviewIds:batch.reviewIds});},retry:false,onSuccess:async p=>{setPreview(p);setRequestKey(crypto.randomUUID());await refresh();}});
 const evaluate=useMutation({mutationFn:()=>send<{status:string;errorCode?:string}>(base+'/evaluate','POST',{requestKey,previewHash:preview?.hash,reviewIds:preview?.reviewIds,priceVersion:preview?.connection.priceVersion,consent:semanticBatchConsent}),retry:false,onSuccess:async()=>{setPreview(null);setConfirmed(false);await refresh();}});
 const busy=save.isPending||toggle.isPending||prepare.isPending||evaluate.isPending;
 const enable=()=>{if(!overview.connection.authorized)setAuthorization(true);else toggle.mutate({enabled:true});};
 return {target,setTarget:(target:string)=>setDraft({target,version:draft?.version??policy?.version??0}),dirty,discard,scope,setScope,postIds,setPostIds,postOffset,setPostOffset,resultOffset,setResultOffset,authorization,setAuthorization,preview,confirmed,setConfirmed,posts,results,save,toggle,prepare,evaluate,busy,enable,refresh,closePreview:()=>{setPreview(null);setConfirmed(false);evaluate.reset();},error:save.error||toggle.error||prepare.error||evaluate.error};
}
export function useLegacyReviewHistory(open:boolean){return useQuery({queryKey:['comment-review','legacy'],queryFn:()=>api<ReviewResults>('/comment-review/history'),enabled:open,retry:false});}
