import {useEffect,useState} from 'react';
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {useSearchParams} from 'react-router-dom';
import {inboxApi,filters} from './inbox-api';
export function useInboxEvents(enabled:boolean){const client=useQueryClient(),[online,setOnline]=useState(false);useEffect(()=>{if(!enabled)return;const source=new EventSource('/api/inbox/events');let fallback:ReturnType<typeof setInterval>|undefined;const refresh=()=>void client.invalidateQueries({queryKey:['inbox']});source.addEventListener('inbox',()=>{setOnline(true);clearInterval(fallback);fallback=undefined;refresh()});source.onerror=()=>{setOnline(false);if(!fallback)fallback=setInterval(refresh,30000)};return()=>{source.close();clearInterval(fallback)}},[enabled,client]);return online}
export function useInbox(admin:boolean){
 const client=useQueryClient(),[params,setParams]=useSearchParams(),f=filters(params),[account,setAccount]=useState(''),[consent,setConsent]=useState(false);
 const query=new URLSearchParams({page:String(f.page)});if(f.channel!=='all')query.set('channel',f.channel);if(f.unread)query.set('unread','1');if(f.accountId)query.set('accountId',f.accountId);
 const accounts=useQuery({queryKey:['inbox','accounts'],queryFn:inboxApi.accounts,enabled:admin});const receivers=useQuery({queryKey:['inbox','receivers'],queryFn:inboxApi.receivers,enabled:admin});
 const messages=useQuery({queryKey:['inbox','messages',query.toString()],queryFn:()=>inboxApi.messages(query.toString()),enabled:admin});
 const invalidate=()=>client.invalidateQueries({queryKey:['inbox']});const start=useMutation({mutationFn:inboxApi.start,onSuccess:()=>{setConsent(false);void invalidate()}}),stop=useMutation({mutationFn:inboxApi.stop,onSuccess:invalidate}),read=useMutation({mutationFn:inboxApi.read,onSuccess:invalidate});
 const update=(key:string,value:string)=>{const p=new URLSearchParams(params);value?p.set(key,value):p.delete(key);if(key!=='page')p.delete('page');setParams(p)};
 return{f,accounts,receivers,messages,start,stop,read,update,account,setAccount,consent,setConsent};
}
