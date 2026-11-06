import {useState} from 'react';
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {localApi,type AutomationPreview,type AutomationRule} from './local-api';
export function useLocalAutomation(){
 const client=useQueryClient(),[editing,setEditing]=useState<AutomationRule|'new'|null>(null),[preview,setPreview]=useState<AutomationPreview|null>(null),[consent,setConsent]=useState(false);
 const refresh=()=>client.invalidateQueries({queryKey:['local']});
 const rules=useQuery({queryKey:['local','automation-rules'],queryFn:()=>localApi('automationRules')});
 const workflow=useQuery({queryKey:['local','workflow'],queryFn:()=>localApi('workflowOverview')});
 const accounts=useQuery({queryKey:['local','platform-accounts'],queryFn:()=>localApi('accountOverview')});
 const decisions=useQuery({queryKey:['local','automation-decisions'],queryFn:()=>localApi('automationDecisions'),refetchInterval:5000});
 const save=useMutation({mutationFn:(input:unknown)=>localApi('saveAutomationRule',input),onSuccess:()=>{setEditing(null);setPreview(null);void refresh();}});
 const inspect=useMutation({mutationFn:(rule:AutomationRule)=>localApi('previewAutomationRule',{id:rule.id,version:rule.version}),onSuccess:p=>{setPreview(p);setConsent(false);}});
 const authorize=useMutation({mutationFn:()=>localApi('authorizeAutomationRule',{...preview,consent:'automatic-contact-frozen-run-v1'}),onSuccess:()=>{setPreview(null);void refresh();}});
 const revoke=useMutation({mutationFn:(id:string)=>localApi('revokeAutomationRule',{id}),onSuccess:()=>{setPreview(null);void refresh();}});
 return {editing,setEditing,preview,setPreview,consent,setConsent,rules,workflow,accounts,decisions,save,inspect,authorize,revoke,error:rules.error||workflow.error||accounts.error||decisions.error||save.error||inspect.error||authorize.error||revoke.error};
}
