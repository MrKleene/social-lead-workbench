import {useJourneyPolling} from '@/lib/use-events';
import {useState} from 'react';
import {useQuery,useMutation,useQueryClient} from '@tanstack/react-query';
import {reviewAutoConsent,type ReviewPolicy,type ReviewOverview,type ReviewResults} from '@crm/contracts';
import {api,send} from '@/lib/api';
import {useDraftGuard} from '@/features/work/draft-guard';
export function useReviewOverview(enabled:boolean){const poll=useJourneyPolling();return useQuery({queryKey:['comment-review'],queryFn:()=>api<ReviewOverview>('/comment-review'),enabled,retry:false,refetchInterval:poll});}
export function useReviewWorkspace(policy:ReviewPolicy|undefined,overview:ReviewOverview){
 const client=useQueryClient(),id=policy?.id||'workspace',base=`/comment-review/policies/${id}`;
 const [draft,setDraft]=useState<{target:string;version:number}|null>(null),[authorization,setAuthorization]=useState(false);
 const target=draft?.target??policy?.target??'',dirty=target!==(policy?.target??'');useDraftGuard(dirty,'modal');
 const refresh=()=>Promise.all([client.invalidateQueries({queryKey:['comment-review']}),client.invalidateQueries({queryKey:['auto-contact']})]);
 const save=useMutation({mutationFn:()=>send<ReviewPolicy>(base,'PUT',{version:draft?.version??policy?.version??0,target}),retry:false,onSuccess:async()=>{setDraft(null);await refresh();}});
 const toggle=useMutation({mutationFn:({enabled,consent=false}:{enabled:boolean;consent?:boolean})=>send(base+'/automatic','PATCH',{version:policy?.version,enabled,...(consent?{consent:reviewAutoConsent,modelVersion:overview.modelVersion,priceVersion:overview.connection.priceVersion}:{})}),retry:false,onSuccess:async()=>{setAuthorization(false);await refresh();}});
 const busy=save.isPending||toggle.isPending;
 return {target,setTarget:(target:string)=>setDraft({target,version:draft?.version??policy?.version??0}),dirty,authorization,setAuthorization,save,toggle,busy,enable:()=>setAuthorization(true),refresh};
}
export function useLegacyReviewHistory(open:boolean){return useQuery({queryKey:['comment-review','legacy'],queryFn:()=>api<ReviewResults>('/comment-review/history'),enabled:open,retry:false});}
