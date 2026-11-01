import {useRef} from 'react';
import {useSearchParams} from 'react-router-dom';
import {useArchivePage,useSavedPostPage} from './archive-data';
import {useConfig} from './use-collection';
import {postListOffset,infoPosts,type InfoPost} from './collection-info-model';
import type {Config} from './types';
export function useCollectionInfo(configs:Config[],initialId?:string){
 const [params,setParams]=useSearchParams();
 const active=params.get('module')==='archive';
 const selected=configs.find(c=>c.id===params.get('config'))||configs.find(c=>c.id===initialId)||configs[0];
 const listOffset=postListOffset(params.get('infoPage')),search=params.get('infoSearch')||'',runId=params.get('infoRun')||'',postId=params.get('post')||'';
 const availability=params.get('postState')||'';
 const offset=listOffset;
 const detail=useArchivePage(postId?selected?.id:undefined,0,false,postId,runId),list=useSavedPostPage(selected?.id,listOffset,search.trim(),runId,availability),history=useConfig(selected?.id);
 const archive=postId?detail:list;
 const posts=infoPosts(archive.data?.posts||[],postId?archive.data?.items||[]:[]);
 const remembered=useRef(new Map<string,InfoPost>());
 const post=posts.find(p=>p.id===postId)||remembered.current.get(`${selected?.id}:${runId}:${postId}`);
 const comments=(posts.find(p=>p.id===postId)?.comments||[]);
 const visible=infoPosts(list.data?.posts||[],[]);
 const update=(patch:Record<string,string>,replace=true)=>setParams(old=>{const next=new URLSearchParams(old);for(const [key,value]of Object.entries(patch)){if(value)next.set(key,value);else next.delete(key);}return next;},{replace});
 return {availability,setAvailability:(value:string)=>update({postState:value,infoPage:''}),active,selected,offset,search,runId,postId,post,comments,visible,archive,list,history,
  open:(p:InfoPost)=>{remembered.current.set(`${selected?.id}:${runId}:${p.id}`,p);update({post:p.id,infoCommentPage:''},false);},
  back:()=>update({post:'',infoCommentPage:''}),setSearch:(value:string)=>update({infoSearch:value,infoPage:''}),setRun:(value:string)=>update({infoRun:value,infoPage:'',post:'',infoCommentPage:''}),
  setPage:(n:number)=>update({infoPage:n?String(n):''}),
  setConfig:(id:string)=>update({config:id,infoPage:'',infoRun:'',post:'',infoSearch:'',infoCommentPage:''})};
}
