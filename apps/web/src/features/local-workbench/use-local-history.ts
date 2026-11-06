import {useState} from 'react';
import {useSearchParams} from 'react-router-dom';
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {localApi,type LocalThread,type LocalReview} from './local-api';
export function useLocalHistory(initialTab:'conversations'|'reviews'|'runs'='conversations'){
 const [params,setParams]=useSearchParams(),filters={runId:params.get('run')||'',policyId:params.get('policy')||'',status:params.get('status')||'',minScore:Number(params.get('score'))||0,query:params.get('query')||'',accountId:params.get('account')||'',unread:params.get('unread')==='1'};
 const client=useQueryClient(),[tab,setTab]=useState<'conversations'|'reviews'|'runs'>(initialTab),[thread,setThread]=useState<LocalThread|null>(null),[threadPage,setThreadPage]=useState(1);
 const page=Math.max(1,Number(params.get('page'))||1),setPage=(page:number)=>setParams(p=>{p.set('page',String(page));return p;}),filter=(key:string,value:string)=>setParams(p=>{p.set(key,value);p.delete('page');return p;});
 const conversations=useQuery({queryKey:['local','conversations',page,filters.accountId,filters.unread,filters.query],queryFn:()=>localApi('conversations',{page,accountId:filters.accountId||undefined,unread:filters.unread,query:filters.query}),enabled:tab==='conversations'});
 const runs=useQuery({queryKey:['local','runs',page],queryFn:()=>localApi('runs',{page}),enabled:tab==='runs'});
 const reviews=useQuery({queryKey:['local','reviews',page,filters],queryFn:()=>localApi('reviews',{page,...filters}),enabled:tab==='reviews'});
 const conversation=useQuery({queryKey:['local','conversation',thread?.account_id,thread?.sender_id,threadPage],queryFn:()=>localApi('conversation',{accountId:thread!.account_id,senderId:thread!.sender_id,page:threadPage}),enabled:tab==='conversations'&&!!thread});
 const refresh=()=>client.invalidateQueries({queryKey:['local']});
 const read=useMutation({mutationFn:(id:string)=>localApi('markRead',{id}),onSuccess:refresh});
 const decide=useMutation({mutationFn:({row,status}:{row:LocalReview;status:LocalReview['review_status']})=>localApi('decideReview',{id:row.id,version:row.version,status}),onSuccess:refresh});
 return {filters,filter,tab,selectTab:(value:typeof tab)=>{setTab(value);setPage(1);setThread(null);},page,setPage,thread,selectThread:(value:LocalThread|null)=>{setThread(value);setThreadPage(1);},threadPage,setThreadPage,conversations,runs,reviews,conversation,read,decide,error:conversations.error||runs.error||reviews.error||conversation.error||read.error||decide.error};
}
