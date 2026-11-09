import {useState} from 'react';
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {Button} from '@/components/ui/button';
import {localApi,type LocalConversation,type ReplyPreview} from './local-api';
export function LocalReply({conversation}:{conversation:LocalConversation}){
 const client=useQueryClient(),[content,setContent]=useState(''),[plan,setPlan]=useState<(ReplyPreview&{requestKey:string})|null>(null),[consent,setConsent]=useState(false),[notice,setNotice]=useState('');
 const capabilities=useQuery({queryKey:['local','workflow'],queryFn:()=>localApi('workflowOverview')});
 const preview=useMutation({mutationFn:()=>localApi('previewReply',{accountId:conversation.account.id,senderId:conversation.senderId,messageId:conversation.anchorId,content:content.trim()}),onSuccess:p=>{setPlan({...p,requestKey:crypto.randomUUID()});setConsent(false);}});
 const send=useMutation({mutationFn:()=>localApi('authorizeReply',{...plan,consent:'send-exact-inbox-reply-once-v1'}),onSuccess:()=>{setPlan(null);setContent('');setConsent(false);setNotice('已加入发送队列。请在任务记录确认结果；未知结果不会自动重发。');void client.invalidateQueries({queryKey:['local']});}});
 const error=preview.error||send.error;
 return <div className="local-editor"><h4>回复这条私信</h4><p>发送账号：{conversation.account.name}。回复对象：{conversation.senderId}。正在收件时，请先在任务列表取消收件。</p>{notice&&<p role="status">{notice}</p>}{error&&<p role="alert">{error.message}</p>}<label>本次回复<input value={content} maxLength={1000} onChange={e=>{setContent(e.target.value);setPlan(null);setConsent(false);}}/></label><Button variant="outline" disabled={!content.trim()||!capabilities.data?.capabilities.send} pending={preview.isPending} onClick={()=>preview.mutate()}>预览单次回复</Button>{plan&&<><p>{plan.accountName}：{plan.content}</p><label className="local-check"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>确认发送以上内容。</label><Button disabled={!consent} pending={send.isPending} onClick={()=>send.mutate()}>授权并发送一次</Button></>}</div>;
}
