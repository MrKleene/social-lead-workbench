import {useEffect,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import type {ReviewResults} from '@crm/contracts';
import {api} from '@/lib/api';
import type {SavedReviewPost} from './post-picker';
const defaults={search:'',minScore:'',maxScore:'',sort:'score-desc',status:'',state:'EVALUATED'};
export function useReviewResults(policyId:string|undefined,post:SavedReviewPost|null){
 const [filters,setFilters]=useState(defaults),[offset,setOffset]=useState(0);
 useEffect(()=>setOffset(0),[post?.id]);
 const base=`/comment-review/policies/${policyId}/results`;
 const total=useQuery({queryKey:['comment-review','summary',policyId,'all'],queryFn:()=>api<ReviewResults>(base+'?offset=0&sort=newest'),enabled:!!policyId,retry:false,refetchInterval:5000});
 const scored=useQuery({queryKey:['comment-review','summary',policyId,'scored'],queryFn:()=>api<ReviewResults>(base+'?offset=0&sort=newest&state=EVALUATED'),enabled:!!policyId,retry:false,refetchInterval:5000});
 const query=new URLSearchParams({offset:String(offset),...Object.fromEntries(Object.entries(filters).filter(([,v])=>v)),...(post?{postId:post.id}:{})});
 const invalid=filters.minScore!==''&&filters.maxScore!==''&&Number(filters.minScore)>Number(filters.maxScore);
 const results=useQuery({queryKey:['comment-review','results',policyId,query.toString()],queryFn:()=>api<ReviewResults>(base+'?'+query),enabled:!!policyId&&!invalid,retry:false,refetchInterval:5000});
 return {filters,offset,setOffset,invalid,results,total,scored,change:(key:keyof typeof filters,value:string)=>{setFilters(f=>({...f,[key]:value}));setOffset(0);},reset:()=>{setFilters(defaults);setOffset(0);}};
}
