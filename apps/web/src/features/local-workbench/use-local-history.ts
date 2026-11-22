import {useState} from 'react';
import {useSearchParams} from '@/lib/router-compat';
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {localApi,type LocalThread,type LocalReview} from './local-api';
export function useLocalHistory(initialTab:'conversations'|'reviews'|'runs'='conversations'){
 const [params,setParams]=useSearchParams(),filters={runId:params.get('run')||'',policyId:params.get('policy')||'',status:params.get('status')||'',minScore:Number(params.get('score'))||0,query:params.get('query')||'',accountId:params.get('account')||'',unread:params.get('unread')==='1',configId:params.get('config')||'',state:params.get('state')||'',from:params.get('from')||'',to:params.get('to')||'',maxScore:params.has('maxScore')?Number(params.get('maxScore')):100,decision:params.get('decision')||'',context:params.get('context')||'',mode:params.get('mode')||'',sort:params.get('sort')||'newest',publication:params.get('publication')||'',evaluation:params.get('evaluation')||''};
 const client=useQueryClient(),[tab,setTab]=useState<'conversations'|'reviews'|'runs'>(initialTab),[thread,setThread]=useState<LocalThread|null>(null),[threadPage,setThreadPage]=useState(1);
 const page=Math.max(1,Number(params.get('page'))||1),setPage=(page:number)=>setParams(p=>{p.set('page',String(page));return p;}),filter=(key:string,value:string)=>setParams(p=>{p.set(key,value);p.delete('page');return p;},{replace:true,flushSync:true});
 const conversations=useQuery({queryKey:['local','conversations',page,filters.accountId,filters.unread,filters.query],queryFn:()=>localApi('conversations',{page,accountId:filters.accountId||undefined,unread:filters.unread,query:filters.query}),enabled:tab==='conversations'});
 const runs=useQuery({queryKey:['local','runs',page,filters],queryFn:()=>localApi('runs',{page,...filters}),enabled:tab==='runs'});
 const reviews=useQuery({queryKey:['local','reviews',page,filters],queryFn:()=>localApi('reviews',{page,...filters}),enabled:tab==='reviews'&&!filters.evaluation});
 const conversation=useQuery({queryKey:['local','conversation',thread?.account_id,thread?.sender_id,threadPage],queryFn:()=>localApi('conversation',{accountId:thread!.account_id,senderId:thread!.sender_id,page:threadPage}),enabled:tab==='conversations'&&!!thread});
 const refresh=()=>client.invalidateQueries({queryKey:['local']});
 const read=useMutation({mutationFn:(id:string)=>localApi('markRead',{id}),onSuccess:refresh});
 const decide=useMutation({mutationFn:({row}:{row:LocalReview;status:'APPROVED'})=>localApi('decideReview',{id:row.id,version:row.version,status:'APPROVED'}),onSuccess:refresh});
 return {filters,filter,tab,selectTab:(value:typeof tab)=>{setTab(value);setPage(1);setThread(null);},page,setPage,thread,selectThread:(value:LocalThread|null)=>{setThread(value);setThreadPage(1);},threadPage,setThreadPage,conversations,runs,reviews,conversation,read,decide,error:conversations.error||runs.error||reviews.error||conversation.error||read.error||decide.error};
}
