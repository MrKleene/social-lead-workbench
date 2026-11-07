import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {useState} from 'react';
import {localApi,type LocalConfiguration} from './local-api';
export function useLocalWorkbench(){
 const client=useQueryClient(),[notice,setNotice]=useState('');
 const status=useQuery({queryKey:['local','status'],queryFn:()=>localApi('status')});
 const configs=useQuery({queryKey:['local','configurations'],queryFn:()=>localApi('configurations'),enabled:!!status.data});
 const jobs=useQuery({queryKey:['local','jobs'],queryFn:()=>localApi('jobs'),refetchInterval:2000,enabled:!!status.data});
 const refresh=()=>client.invalidateQueries({queryKey:['local']});
 const initialize=useMutation({mutationFn:()=>localApi('initialize'),onSuccess:refresh});
 const save=useMutation({mutationFn:(input:Partial<LocalConfiguration>)=>localApi('saveConfiguration',input),onSuccess:()=>{setNotice('配置已保存在本机。');void refresh();}});
 const archive=useMutation({mutationFn:(input:{id:string;revision:number})=>localApi('archiveConfiguration',input),onSuccess:refresh});
 const key=useMutation({mutationFn:(value:string)=>localApi('saveModelKey',{key:value}),onSuccess:()=>{setNotice('模型密钥已由系统保护后保存。');void refresh();}});
 const cancel=useMutation({mutationFn:(id:string)=>localApi('cancelJob',{id}),onSuccess:()=>{setNotice('已请求取消；已提交的请求仍会保留额度和未知结果保护。');void refresh();}});
 const backup=useMutation({mutationFn:()=>localApi('backup'),onSuccess:r=>setNotice('备份已保存：'+r.name)});
 const restore=useMutation({mutationFn:()=>localApi('restore'),onSuccess:r=>{if(r.restored){setNotice('备份已校验并恢复到独立副本，请在下方核对后切换：'+r.name);void refresh();}}});
 return {status,configs,jobs,initialize,save,archive,key,backup,restore,cancel,notice,error:status.error||configs.error||jobs.error||initialize.error||save.error||archive.error||key.error||backup.error||restore.error||cancel.error};
}
