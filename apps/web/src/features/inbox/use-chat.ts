import {useState} from 'react';
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {useSearchParams} from 'react-router-dom';
import {chatApi,type ChatPreview,type ChatResult,type ChatThread} from './chat-api';
import {useDraftGuard} from '@/features/work/draft-guard';
export function useChat(){const [params,setParams]=useSearchParams();const account=params.get('chatAccount')||'',peer=params.get('peer')||'',filter=params.get('accountId')||'',unread=params.get('unread')==='1',page=Math.max(1,Math.floor(Number(params.get('chatPage'))||1)),messagePage=Math.max(1,Math.floor(Number(params.get('messagePage'))||1));
 const q=new URLSearchParams({page:String(page)});if(filter)q.set('accountId',filter);if(unread)q.set('unread','1');
 const list=useQuery({queryKey:['inbox','conversations',q.toString()],queryFn:()=>chatApi.conversations(q.toString())});
 const query=new URLSearchParams({accountId:account,senderId:peer,page:String(messagePage)}).toString();
 const thread=useQuery({queryKey:['inbox','chat',query],queryFn:()=>chatApi.thread(query),enabled:!!account&&!!peer});
 const capability=useQuery({queryKey:['inbox','chat-capability'],queryFn:chatApi.capability});
 const update=(values:Record<string,string>)=>{const p=new URLSearchParams(params);for(const[k,v]of Object.entries(values))v?p.set(k,v):p.delete(k);setParams(p)};
 return {account,peer,filter,page,messagePage,unread,list,thread,capability,update};
}
export function useChatComposer(thread:ChatThread){const client=useQueryClient(),[content,setContent]=useState(''),[preview,setPreview]=useState<(ChatPreview&{requestKey:string})|null>(null),[result,setResult]=useState<ChatResult|null>(null);
 const refresh=()=>void client.invalidateQueries({queryKey:['inbox']});
 const prepare=useMutation({mutationFn:()=>chatApi.prepare({accountId:thread.account.id,senderId:thread.senderId,messageId:thread.anchorId,content:content.trim()}),onSuccess:p=>{setPreview({...p,requestKey:crypto.randomUUID()});setResult(null)}});
 const complete=(r:ChatResult)=>{setResult(r);refresh();if(r.outcome==='CONFIRMED'){setContent('');setPreview(null)}};
 const confirm=useMutation({mutationFn:()=>{if(!preview)throw Error('请先预览');return chatApi.confirm({previewId:preview.previewId,token:preview.token,requestKey:preview.requestKey})},onSuccess:complete,onError:refresh});
 const status=useMutation({mutationFn:()=>{if(!preview)throw Error('没有已提交预览');return chatApi.status(preview.previewId)},onSuccess:complete});
 const busy=prepare.isPending||confirm.isPending||status.isPending;useDraftGuard(!!content||busy,busy?'pending':'modal');
 const unresolved=confirm.isError&&!result;
 const reset=()=>{if(busy||unresolved)return;setPreview(null);setResult(null);confirm.reset();prepare.reset();status.reset()};
 return {content,setContent,preview,result,prepare,confirm,status,busy,unresolved,reset};
}
