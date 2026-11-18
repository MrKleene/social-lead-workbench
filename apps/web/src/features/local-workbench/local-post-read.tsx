import {useState} from 'react';
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {Button} from '@/components/ui/button';
import {SELECT_EMPTY,Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select';
import {CheckboxField} from '@/components/patterns/checkbox-field';
import {FormField} from '@/components/patterns/form-field';
import {SectionCard} from '@/components/patterns/section-card';
import {ErrorNotice} from '@/components/feedback';
import {localApi,type CollectionPreview} from './local-api';

export function LocalPostRead({savedPostId,resume,onClose}:{savedPostId:string;resume:boolean;onClose:()=>void}){
 const client=useQueryClient(),[configId,setConfig]=useState(''),[accountId,setAccount]=useState(''),[policyIds,setPolicies]=useState<string[]>([]),[plan,setPlan]=useState<(CollectionPreview&{title:string;requestKey:string})|null>(null),[consent,setConsent]=useState(false),[notice,setNotice]=useState('');
 const accounts=useQuery({queryKey:['local','platform-accounts'],queryFn:()=>localApi('accountOverview')});
 const configs=useQuery({queryKey:['local','configurations'],queryFn:()=>localApi('configurations')});
 const workflow=useQuery({queryKey:['local','workflow'],queryFn:()=>localApi('workflowOverview')});
 const reset=()=>{setPlan(null);setConsent(false);};
 const preview=useMutation({mutationFn:()=>localApi('previewSavedPost',{savedPostId,configId,accountId,policyIds,resume}),onSuccess:value=>{setPlan({...value,requestKey:crypto.randomUUID()});setConsent(false);}});
 const read=useMutation({mutationFn:()=>localApi('authorizeSavedPost',{...plan,consent:resume?'resume-exact-checkpoint-in-new-run-v1':'reread-exact-saved-post-once-v1'}),onSuccess:()=>{setPlan(null);setNotice('已创建新的单笔记读取任务。');void client.invalidateQueries({queryKey:['local']});}});
 return <SectionCard title={resume?'补读这篇笔记':'重新读取这篇笔记'} actions={<Button variant="ghost" size="sm" onClick={onClose}>关闭</Button>}>
  {accounts.error||configs.error||workflow.error||preview.error||read.error?<ErrorNotice error={accounts.error||configs.error||workflow.error||preview.error||read.error}/>:null}
  {notice?<p role="status" className="text-body text-muted-foreground">{notice}</p>:null}
  <FormField label="本次配置">
   <Select value={configId} onValueChange={value=>{setConfig(value);reset();}}>
    <SelectTrigger aria-label="单笔记配置"><SelectValue/></SelectTrigger>
    <SelectContent>
     <SelectItem value={SELECT_EMPTY}>选择配置</SelectItem>
     {configs.data?.filter(config=>config.kind==='KEYWORDS').map(config=><SelectItem key={config.id} value={config.id}>{config.name}</SelectItem>)}
    </SelectContent>
   </Select>
  </FormField>
  <FormField label="读取账号">
   <Select value={accountId} onValueChange={value=>{setAccount(value);reset();}}>
    <SelectTrigger aria-label="单笔记读取账号"><SelectValue/></SelectTrigger>
    <SelectContent>
     <SelectItem value={SELECT_EMPTY}>选择已登录账号</SelectItem>
     {accounts.data?.accounts.filter(item=>item.state==='VERIFIED'&&item.hasSession).map(item=><SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}
    </SelectContent>
   </Select>
  </FormField>
  {workflow.data?.policies.filter(rule=>rule.enabled).map(rule=><CheckboxField key={rule.id} checked={policyIds.includes(rule.id)} onCheckedChange={checked=>{setPolicies(previous=>checked?[...previous,rule.id]:previous.filter(id=>id!==rule.id));reset();}}>{rule.name}</CheckboxField>)}
  <div className="flex flex-wrap gap-3">
   <Button variant="outline" disabled={!configId||!accountId} pending={preview.isPending} onClick={()=>preview.mutate()}>{resume?'预览补读范围':'预览读取范围'}</Button>
  </div>
  {plan?<div className="flex flex-col gap-3 border-t pt-4">
   <p className="text-body leading-relaxed break-words">{plan.title} · {plan.accountName} · {plan.reviewTargets} 个评论匹配规则</p>
   <CheckboxField checked={consent} onCheckedChange={setConsent}>{resume?'授权在新轮次补读此检查点，保留原轮次。':'授权读取这篇笔记一次，保留原历史。'}</CheckboxField>
   <div className="flex flex-wrap gap-3"><Button disabled={!consent} pending={read.isPending} onClick={()=>read.mutate()}>{resume?'授权补读':'授权重新读取'}</Button></div>
  </div>:null}
 </SectionCard>;
}
