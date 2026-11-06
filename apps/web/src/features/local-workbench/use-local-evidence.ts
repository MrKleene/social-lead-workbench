import {useState} from 'react';
import {useQuery,useMutation,useQueryClient} from '@tanstack/react-query';
import {localApi,type EvidencePreview} from './local-api';
export function useLocalEvidence(){
 const client=useQueryClient(),[plan,setPlan]=useState<EvidencePreview|null>(null),[consent,setConsent]=useState(false),[notice,setNotice]=useState('');
 const overview=useQuery({queryKey:['local','evidence'],queryFn:()=>localApi('evidenceOverview'),refetchInterval:5000});
 const preview=useMutation({mutationFn:(input:unknown)=>localApi('previewEvidence',input),onSuccess:p=>{setPlan(p);setConsent(false);}});
 const verify=useMutation({mutationFn:()=>localApi('verifyEvidence',{...plan,consent:'inspect-unknown-twice-no-send-v1'}),onSuccess:r=>{setPlan(null);setNotice(r.state==='CONFIRMED'?'两次独立回读已确认原消息存在。额度保持占用，暂停仍需在恢复核对中明确处理。':'未取得一致可靠证据；保留未知结果、额度和禁止重发。');void client.invalidateQueries({queryKey:['local']});}});
 const cancel=useMutation({mutationFn:()=>localApi('cancelEvidence')});
 return {overview,preview,verify,cancel,plan,consent,setConsent,notice,error:overview.error||preview.error||verify.error||cancel.error};
}
