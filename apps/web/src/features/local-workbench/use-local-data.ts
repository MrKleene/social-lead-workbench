import {useState} from 'react';
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {localApi,type DataCopy} from './local-api';
export function useLocalData(){
 const client=useQueryClient(),[selected,setSelected]=useState<DataCopy|null>(null),[consent,setConsent]=useState(false),[entity,setEntity]=useState(''),[page,setPage]=useState(1),[notice,setNotice]=useState('');
 const copies=useQuery({queryKey:['local','copies'],queryFn:()=>localApi('dataCopies')});
 const overview=useQuery({queryKey:['local','legacy'],queryFn:()=>localApi('legacyOverview')});
 const rows=useQuery({queryKey:['local','legacy',entity,page],queryFn:()=>localApi('legacyPage',{entity,page}),enabled:!!entity});
 const refresh=()=>client.invalidateQueries({queryKey:['local']});
 const importFile=useMutation({mutationFn:()=>localApi('importLegacy'),onSuccess:r=>{if(r.preview){setSelected(r.preview);setConsent(false);setNotice('已生成独立副本。请核对摘要后再切换。');void refresh();}}});
 const activate=useMutation({mutationFn:()=>{if(!selected||!consent)throw Error('请先核对并确认切换。');return localApi('activateDataCopy',{id:selected.id,sha256:selected.sha256,consent:'activate-reviewed-local-copy-v1'});},onSuccess:r=>{setSelected(null);setConsent(false);setEntity('');setPage(1);setNotice('已切换到选定副本。原数据库保留；切换前备份：'+(r.previousBackup??'已保存'));void refresh();}});
 return {copies,overview,rows,selected,consent,setConsent,entity,page,setPage,notice,importFile,activate,selectCopy:(copy:DataCopy)=>{setSelected(copy);setConsent(false);},selectEntity:(value:string)=>{setEntity(value);setPage(1);},error:copies.error||overview.error||rows.error||importFile.error||activate.error};
}
