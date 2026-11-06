import {useState} from 'react';
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {localApi,type LocalThread,type LocalReview} from './local-api';
export function useLocalHistory(){
 const client=useQueryClient(),[tab,setTab]=useState<'conversations'|'reviews'|'runs'>('conversations'),[page,setPage]=useState(1),[thread,setThread]=useState<LocalThread|null>(null),[threadPage,setThreadPage]=useState(1);
 const conversations=useQuery({queryKey:['local','conversations',page],queryFn:()=>localApi('conversations',{page}),enabled:tab==='conversations'});
 const runs=useQuery({queryKey:['local','runs',page],queryFn:()=>localApi('runs',{page}),enabled:tab==='runs'});
 const reviews=useQuery({queryKey:['local','reviews',page],queryFn:()=>localApi('reviews',{page}),enabled:tab==='reviews'});
 const conversation=useQuery({queryKey:['local','conversation',thread?.account_id,thread?.sender_id,threadPage],queryFn:()=>localApi('conversation',{accountId:thread!.account_id,senderId:thread!.sender_id,page:threadPage}),enabled:tab==='conversations'&&!!thread});
 const refresh=()=>client.invalidateQueries({queryKey:['local']});
 const read=useMutation({mutationFn:(id:string)=>localApi('markRead',{id}),onSuccess:refresh});
 const decide=useMutation({mutationFn:({row,status}:{row:LocalReview;status:LocalReview['review_status']})=>localApi('decideReview',{id:row.id,version:row.version,status}),onSuccess:refresh});
 return {tab,selectTab:(value:typeof tab)=>{setTab(value);setPage(1);setThread(null);},page,setPage,thread,selectThread:(value:LocalThread|null)=>{setThread(value);setThreadPage(1);},threadPage,setThreadPage,conversations,runs,reviews,conversation,read,decide,error:conversations.error||runs.error||reviews.error||conversation.error||read.error||decide.error};
}
