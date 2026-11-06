import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {useState} from 'react';
import {localApi,type LocalConfiguration} from './local-api';
export function useLocalWorkbench(){
 const client=useQueryClient(),[notice,setNotice]=useState('');
 const status=useQuery({queryKey:['local','status'],queryFn:()=>localApi('status')});
 const configs=useQuery({queryKey:['local','configurations'],queryFn:()=>localApi('configurations'),enabled:status.data?.initialized===true});
 const jobs=useQuery({queryKey:['local','jobs'],queryFn:()=>localApi('jobs'),enabled:status.data?.initialized===true});
 const refresh=()=>client.invalidateQueries({queryKey:['local']});
 const initialize=useMutation({mutationFn:()=>localApi('initialize'),onSuccess:refresh});
 const save=useMutation({mutationFn:(input:Partial<LocalConfiguration>)=>localApi('saveConfiguration',input),onSuccess:()=>{setNotice('配置已保存在本机。');void refresh();}});
 const archive=useMutation({mutationFn:(input:{id:string;revision:number})=>localApi('archiveConfiguration',input),onSuccess:refresh});
 const key=useMutation({mutationFn:(value:string)=>localApi('saveModelKey',{key:value}),onSuccess:()=>{setNotice('模型密钥已由系统保护后保存。');void refresh();}});
 const backup=useMutation({mutationFn:()=>localApi('backup'),onSuccess:r=>setNotice('备份已保存：'+r.name)});
 const restore=useMutation({mutationFn:()=>localApi('restore'),onSuccess:r=>{if(r.restored)setNotice('备份已校验并恢复到独立副本，当前数据库未切换：'+r.name);}});
 return {status,configs,jobs,initialize,save,archive,key,backup,restore,notice,error:status.error||configs.error||jobs.error||initialize.error||save.error||archive.error||key.error||backup.error||restore.error};
}
