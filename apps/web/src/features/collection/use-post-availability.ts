import {useState} from 'react';
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {api,send} from '@/lib/api';
import {availabilityInput,type PostAvailabilityView} from '@crm/contracts';
type AvailabilityResponse={current:PostAvailabilityView;events:PostAvailabilityView[];recheck:{available:boolean;reason:string}};
export function usePostAvailability(id:string,open:boolean){
 const client=useQueryClient(),path=`/collection/captured-posts/${id}/availability`;
 const [reason,setReason]=useState('HTTP_404'),[evidence,setEvidence]=useState(''),[confirmDeleted,setConfirmDeleted]=useState(false);
 const query=useQuery({queryKey:['post-availability',id],queryFn:()=>api<AvailabilityResponse>(path),enabled:open,retry:false,staleTime:0});
 const refresh=()=>Promise.all(['collection','auto-contact','auto-contact-jobs','comment-review','post-availability'].map(key=>client.invalidateQueries({queryKey:[key]})));
 const recheck=useMutation({mutationFn:()=>send<AvailabilityResponse>(path+'/recheck','POST',{}),onSuccess:refresh,retry:false});
 const body={version:query.data?.current.version??0,reason,evidence,confirmDeleted};
 const save=useMutation({mutationFn:()=>send(path,'PATCH',availabilityInput.parse(body)),onSuccess:async()=>{setEvidence('');setConfirmDeleted(false);await refresh();},onError:()=>{void refresh();},retry:false});
 return {query,recheck,save,reason,setReason:(s:string)=>{setReason(s);setConfirmDeleted(false);},evidence,setEvidence,confirmDeleted,setConfirmDeleted,valid:query.isSuccess&&!query.isFetching&&availabilityInput.safeParse(body).success};
}
