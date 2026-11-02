import {useRef} from 'react';
import {useSearchParams} from 'react-router-dom';
import {readReviewFilters,reviewFilterQuery,reviewFilterError} from './review-filters';
import {useQuery} from '@tanstack/react-query';
import type {ReviewResults} from '@crm/contracts';
import {api} from '@/lib/api';
import type {SavedReviewPost} from './post-picker';
import {reviewDefaults} from './review-scope';
export function useReviewResults(policyId:string|undefined,post:SavedReviewPost|null,scope?:{runId:string;policyRevision?:number}){
 const defaults=reviewDefaults(!!scope);
 const [params,setParams]=useSearchParams(),filters=readReviewFilters(params,!!scope);
 const pending=useRef(params),observed=useRef(params);if(observed.current!==params){observed.current=params;pending.current=params;}
 const update=(edit:(p:URLSearchParams)=>void,replace=true)=>{const p=new URLSearchParams(pending.current);edit(p);pending.current=p;setParams(p,{replace});};
 const rawOffset=Number(params.get('review_offset')||0),offset=Number.isInteger(rawOffset)&&rawOffset>=0&&rawOffset<=100000?Math.floor(rawOffset/20)*20:0;
 const setOffset=(n:number)=>update(p=>{p.set('review_offset',String(n));},false);
 const base=`/comment-review/policies/${policyId}/results`;
 const scopeQuery=new URLSearchParams(scope?{runId:scope.runId,...(scope.policyRevision?{policyRevision:String(scope.policyRevision)}:{})}:{}).toString();
 const total=useQuery({queryKey:['comment-review','summary',policyId,'all',scopeQuery,post?.id],queryFn:()=>api<ReviewResults>(base+'?offset=0&sort=newest&'+scopeQuery+(post?'&postId='+encodeURIComponent(post.id):'')),enabled:!!policyId,retry:false,refetchInterval:5000});
 const scored=useQuery({queryKey:['comment-review','summary',policyId,'scored',scopeQuery,post?.id],queryFn:()=>api<ReviewResults>(base+'?offset=0&sort=newest&state=EVALUATED&'+scopeQuery+(post?'&postId='+encodeURIComponent(post.id):'')),enabled:!!policyId,retry:false,refetchInterval:5000});
 const query=new URLSearchParams({offset:String(offset),...Object.fromEntries(Object.entries(reviewFilterQuery(filters)).filter(([,v])=>v)),...(post?{postId:post.id}:{}),...(scope?{runId:scope.runId,...(scope.policyRevision?{policyRevision:String(scope.policyRevision)}:{})}:{})});
 const error=reviewFilterError(filters),invalid=!!error;
 const results=useQuery({queryKey:['comment-review','results',policyId,query.toString()],queryFn:()=>api<ReviewResults>(base+'?'+query),enabled:!!policyId&&!invalid,retry:false,refetchInterval:5000});
 return {filters,offset,setOffset,invalid,error,results,total,scored,change:(key:keyof typeof filters,value:string)=>update(p=>{p.set('review_'+key,value);p.delete('review_offset');}),reset:()=>update(p=>{for(const key of Object.keys(defaults))p.delete('review_'+key);p.delete('review_post');p.delete('review_post_title');p.delete('review_offset');})};
}
