import {useState} from 'react';
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {localApi,type CollectionPreview} from './local-api';
export function useLocalPosts(runId:string){
 const client=useQueryClient(),[plan,setPlan]=useState<(CollectionPreview&{title:string;requestKey:string})|null>(null),[consent,setConsent]=useState(false),[notice,setNotice]=useState('');
 const [historyId,setHistoryId]=useState<string|null>(null),[historyPage,setHistoryPage]=useState(1);
 const history=useQuery({queryKey:['local','post-history',historyId,historyPage],queryFn:()=>localApi('postHistory',{postId:historyId,page:historyPage}),enabled:!!historyId});
 const posts=useQuery({queryKey:['local','saved-posts',runId],queryFn:()=>localApi('savedPosts',{runId})});
 const progress=useQuery({queryKey:['local','run-progress',runId],queryFn:()=>localApi('runProgress',{runId}),enabled:!!runId});
 const accounts=useQuery({queryKey:['local','platform-accounts'],queryFn:()=>localApi('accountOverview')});
 const configs=useQuery({queryKey:['local','configurations'],queryFn:()=>localApi('configurations')});
 const workflow=useQuery({queryKey:['local','workflow'],queryFn:()=>localApi('workflowOverview')});
 const preview=useMutation({mutationFn:(input:unknown)=>localApi('previewSavedPost',input),onSuccess:p=>{setPlan({...p,requestKey:crypto.randomUUID()});setConsent(false);}});
 const read=useMutation({mutationFn:()=>localApi('authorizeSavedPost',{...plan,consent:(plan!.scope.readPlan as {resume?:unknown})?.resume?'resume-exact-checkpoint-in-new-run-v1':'reread-exact-saved-post-once-v1'}),onSuccess:()=>{setPlan(null);setNotice('已创建新的单笔记读取任务。');void client.invalidateQueries({queryKey:['local']});}});
 return {historyId,selectHistory:(id:string|null)=>{setHistoryId(id);setHistoryPage(1);},historyPage,setHistoryPage,history,posts,progress,accounts,configs,workflow,plan,setPlan,consent,setConsent,notice,preview,read,error:history.error||posts.error||progress.error||accounts.error||configs.error||workflow.error||preview.error||read.error};
}
