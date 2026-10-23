import {useRef,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {api,send} from '@/lib/api';
import {singlePostError} from './single-post-error';
import type {ImageDiagnostics} from '@crm/contracts';
import type {McpReadiness} from './types';
export type SinglePostResult={status:'CHECKED'|'FAILED'|'LOGIN_NOT_READY';reason?:string;coverage?:'WINDOW_ONLY';roots?:{count:number;displayableAvatars:number};replies?:{count:number;displayableAvatars:number};imageDiagnostics?:ImageDiagnostics|null};
export function useSinglePostCheck(){
 const readiness=useQuery({queryKey:['mcp-readiness'],queryFn:()=>api<McpReadiness>('/collection/mcp/readiness'),retry:false});
 const [url,setUrl]=useState(''),[accountId,setAccountId]=useState(''),[consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[submitted,setSubmitted]=useState(false),[result,setResult]=useState<SinglePostResult|null>(null),[error,setError]=useState('');
 const inFlight=useRef(false),key=useRef(crypto.randomUUID());
 const accounts=(readiness.data?.accounts||[]).filter(a=>['VERIFIED','UNVERIFIED'].includes(a.reason)),selected=accountId||accounts[0]?.id||'';
 async function check(){
  if(inFlight.current||submitted||!consent||!selected||!url.trim()||!readiness.data?.device?.online)return;
  inFlight.current=true;setBusy(true);setSubmitted(true);setError('');const reference=url.trim();setUrl('');
  try{setResult(await send<SinglePostResult>('/collection/single-post-check','POST',{accountId:selected,url:reference,requestKey:key.current,consent:'single-post-read-v1'}));}
  catch(error){setError(singlePostError(error));}
  finally{inFlight.current=false;setBusy(false);setConsent(false);void readiness.refetch();}
 }
 return {url,setUrl,accountId:selected,setAccountId,consent,setConsent,busy,submitted,result,error,accounts,readiness,check};
}
