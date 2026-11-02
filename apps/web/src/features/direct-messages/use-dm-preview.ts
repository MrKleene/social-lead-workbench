import {useState} from 'react';
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import type {ReviewOverview,ReviewResults} from '@crm/contracts';
import {api,send,ApiError} from '@/lib/api';
import {useAccounts} from '@/features/accounts/use-accounts';
import type {ReplyTemplate} from '@/features/replies/use-replies';
export type DmCapability={platform:'XHS'|'DOUYIN';previewAvailable:boolean;sendingAvailable:boolean;reason:string};
export type DmPreview={mode:'PREVIEW_ONLY';canSend:false;sent:false;authorizationCreated:false;content:string;source:{authorNickname:string|null;recipientId:string;postTitle:string|null;comment:string|null;score:number|null};account:{label:string};quota:{remaining:number;occupied:number;accountDailyLimit:number;reservedByPreview:0};issues:{code:string;message:string}[];missingFields:string[];unknownFields:string[];checkedAt:string};
export type DmRequest={accountId:string;accountVersion:number;reviewId:string;reviewVersion:number;templateId:string;templateVersion:number};
export const previewKey=(input:DmRequest)=>JSON.stringify(input);
export function previewForSelection(value:{key:string;value:DmPreview}|undefined,input:DmRequest|null){return input&&value?.key===previewKey(input)?value.value:null;}
export function capabilityError(error:unknown){return error instanceof ApiError&&error.status===404?'当前服务尚未启用私信预览':error instanceof Error?error.message:'私信能力读取失败';}
export function useDmPreview(template:ReplyTemplate){
 const client=useQueryClient();
 const [accountId,setAccountId]=useState(''),[policyId,setPolicyId]=useState(''),[reviewId,setReviewId]=useState(''),[offset,setOffset]=useState(0);
 const accounts=useAccounts(),account=accounts.data?.accounts.find(a=>a.id===accountId&&!a.isDemo);
 const capability=useQuery({queryKey:['dm-capability',account?.platform||'XHS'],queryFn:()=>api<DmCapability>('/direct-messages/capability?platform='+(account?.platform||'XHS')),retry:false});
 const overview=useQuery({queryKey:['dm-policies'],queryFn:()=>api<ReviewOverview>('/comment-review'),retry:false,enabled:capability.data?.previewAvailable===true});
 const results=useQuery({queryKey:['dm-sources',policyId,offset],queryFn:()=>api<ReviewResults>(`/comment-review/policies/${encodeURIComponent(policyId)}/results?sort=newest&offset=${offset}`),enabled:!!policyId&&capability.data?.previewAvailable===true,retry:false});
 const review=results.data?.items.find(r=>r.id===reviewId&&!r.isDemo);
 const input: DmRequest|null=account&&review?{accountId:account.id,accountVersion:account.version,reviewId:review.id,reviewVersion:review.version,templateId:template.id,templateVersion:template.version}:null;
 const prepare=useMutation({mutationFn:async(body:DmRequest)=>({key:previewKey(body),value:await send<DmPreview>('/direct-messages/preview','POST',body)}),retry:false,onError:error=>{if(error instanceof ApiError&&error.status===409)for(const key of ['accounts','dm-sources','reply-templates'])void client.invalidateQueries({queryKey:[key]});}});
 const reset=()=>{prepare.reset();};
 return {accounts,accountId,policyId,reviewId,offset,capability,overview,results,prepare,input,preview:prepare.isPending||accounts.isError||results.isError||capability.isError?null:previewForSelection(prepare.data,input),
  changeAccount:(id:string)=>{reset();setAccountId(id);},changePolicy:(id:string)=>{reset();setPolicyId(id);setReviewId('');setOffset(0);},
  changePage:(n:number)=>{reset();setReviewId('');setOffset(n);},changeReview:(id:string)=>{reset();setReviewId(id);},
  previewNow:()=>{if(input&&!prepare.isPending&&capability.data?.previewAvailable&&!capability.isError)prepare.mutate(input);}};
}
