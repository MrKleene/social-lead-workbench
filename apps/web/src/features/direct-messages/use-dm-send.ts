import {useRef,useState} from 'react';
import {useMutation,useQueryClient} from '@tanstack/react-query';
import {api,send} from '@/lib/api';
import type {DmRequest} from './use-dm-preview';
export type DmGrant={previewId:string;token:string;expiresAt:string;accountLabel:string;recipientNickname:string|null;recipientId:string;content:string;remaining:number;channel:'DM'};
export type DmOutcome={outcome:string;attemptId:string|null;reason?:string|null};
export const dmOutcomeText=(s:string)=>({CONFIRMED:'私信已发送',UNKNOWN:'发送结果未知，请勿重发',FAILED:'私信未发送',RESERVED:'正在核验',ATTEMPTED:'正在发送并确认',NOT_SUBMITTED:'尚未提交'}[s]||'等待结果确认');
/** Closing/unmounting never retries. A failed HTTP confirmation only allows status reads. */
export function useDmSend(input:DmRequest){
 const client=useQueryClient(),verifyFlight=useRef(false),flight=useRef(false),key=useRef<string|null>(null),[submitted,setSubmitted]=useState(false),[outcome,setOutcome]=useState<DmOutcome|null>(null);
 const grant=useMutation({mutationFn:()=>send<DmGrant>('/direct-messages/prepare-send','POST',input),retry:false});
 const confirm=useMutation({mutationFn:(g:DmGrant)=>send<DmOutcome>('/direct-messages/confirm-send','POST',{previewId:g.previewId,token:g.token,requestKey:key.current}),retry:false,onSuccess:r=>{setOutcome(r);for(const q of ['accounts','reply-history','contact-attempts'])void client.invalidateQueries({queryKey:[q]})},onSettled:()=>{flight.current=false}});
 const status=useMutation({mutationFn:(id:string)=>api<DmOutcome>('/direct-messages/requests/'+encodeURIComponent(id)),retry:false,onSuccess:setOutcome});
 const verification=useMutation({mutationFn:(id:string)=>send<DmOutcome>('/direct-messages/requests/'+encodeURIComponent(id)+'/verify','POST',{}),retry:false,onSuccess:r=>{setOutcome(r);for(const q of ['accounts','reply-history','contact-attempts'])void client.invalidateQueries({queryKey:[q]})},onSettled:()=>{verifyFlight.current=false}});
 const prepare=()=>{if(flight.current||submitted||grant.isPending)return;flight.current=true;grant.mutate(undefined,{onSettled:()=>{flight.current=false}})};
 const submit=()=>{if(flight.current||submitted||!grant.data||Date.parse(grant.data.expiresAt)<=Date.now())return;flight.current=true;key.current=crypto.randomUUID();setSubmitted(true);confirm.mutate(grant.data)};
 return {grant,confirm,status,verification,verify:()=>{if(grant.data&&outcome?.outcome==='UNKNOWN'&&!verifyFlight.current){verifyFlight.current=true;verification.mutate(grant.data.previewId)}},outcome,submitted,prepare,submit,check:()=>{if(grant.data&&!status.isPending)status.mutate(grant.data.previewId)}};
}
