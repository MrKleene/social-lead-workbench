import {useState} from 'react';
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {localApi,type DataCopy,type RecoveryPreview} from './local-api';
export function useLocalData(){
 const client=useQueryClient(),[selected,setSelected]=useState<DataCopy|null>(null),[consent,setConsent]=useState(false),[entity,setEntity]=useState(''),[page,setPage]=useState(1),[notice,setNotice]=useState('');
 const [recoveryConsent,setRecoveryConsent]=useState(false),[recoveryPlan,setRecoveryPlan]=useState<RecoveryPreview|null>(null);
 const recovery=useQuery({queryKey:['local','recovery'],queryFn:()=>localApi('recoveryPreview')});
 const inspectRecovery=useMutation({mutationFn:()=>localApi('recoveryPreview'),onSuccess:p=>{setRecoveryPlan(p);setRecoveryConsent(false);}});
 const resume=useMutation({mutationFn:()=>localApi('resumeReviewedCopy',{previewHash:recoveryPlan!.previewHash,consent:'resume-reviewed-copy-for-new-work-v1'}),onSuccess:()=>{setRecoveryPlan(null);setRecoveryConsent(false);setNotice('已解除副本核对暂停。历史限制继续保留，新任务仍需重新授权。');void refresh();}});
 const copies=useQuery({queryKey:['local','copies'],queryFn:()=>localApi('dataCopies')});
 const overview=useQuery({queryKey:['local','legacy'],queryFn:()=>localApi('legacyOverview')});
 const rows=useQuery({queryKey:['local','legacy',entity,page],queryFn:()=>localApi('legacyPage',{entity,page}),enabled:!!entity});
 const refresh=()=>client.invalidateQueries({queryKey:['local']});
 const importFile=useMutation({mutationFn:()=>localApi('importLegacy'),onSuccess:r=>{if(r.preview){setSelected(r.preview);setConsent(false);setNotice('已生成独立副本。请核对摘要后再切换。');void refresh();}}});
 const activate=useMutation({mutationFn:()=>{if(!selected||!consent)throw Error('请先核对并确认切换。');return localApi('activateDataCopy',{id:selected.id,sha256:selected.sha256,consent:'activate-reviewed-local-copy-v1'});},onSuccess:r=>{setSelected(null);setConsent(false);setEntity('');setPage(1);setNotice('已切换到选定副本。原数据库保留；切换前备份：'+(r.previousBackup??'已保存'));void refresh();}});
 return {recovery,recoveryPlan,recoveryConsent,setRecoveryConsent,inspectRecovery,resume,copies,overview,rows,selected,consent,setConsent,entity,page,setPage,notice,importFile,activate,selectCopy:(copy:DataCopy)=>{setSelected(copy);setConsent(false);},selectEntity:(value:string)=>{setEntity(value);setPage(1);},error:recovery.error||inspectRecovery.error||resume.error||copies.error||overview.error||rows.error||importFile.error||activate.error};
}
