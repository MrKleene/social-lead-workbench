import {useRef} from 'react';
import {useSearchParams} from 'react-router-dom';
import {useArchivePage} from './archive-data';
import {useConfig} from './use-collection';
import {archiveOffset,infoPosts,type InfoPost} from './collection-info-model';
import type {Config} from './types';
export function useCollectionInfo(configs:Config[],initialId?:string){
 const [params,setParams]=useSearchParams();
 const active=params.get('module')==='archive';
 const selected=configs.find(c=>c.id===params.get('config'))||configs.find(c=>c.id===initialId)||configs[0];
 const listOffset=archiveOffset(params.get('infoPage')),search=params.get('infoSearch')||'',runId=params.get('infoRun')||'',postId=params.get('post')||'';
 const offset=postId?archiveOffset(params.get('infoCommentPage')):listOffset;
 const archive=useArchivePage(selected?.id,offset,false,postId),history=useConfig(selected?.id);
 const posts=infoPosts(archive.data?.posts||[],archive.data?.items||[],runId);
 const remembered=useRef(new Map<string,InfoPost>());
 const post=posts.find(p=>p.id===postId)||remembered.current.get(`${selected?.id}:${postId}`);
 const comments=(posts.find(p=>p.id===postId)?.comments||[]);
 const query=search.trim().toLocaleLowerCase();
 const visible=posts.filter(p=>`${p.title} ${p.id} ${p.comments.map(c=>c.snapshot.comment+' '+(c.snapshot.parent||'')).join(' ')}`.toLocaleLowerCase().includes(query));
 const update=(patch:Record<string,string>)=>setParams(old=>{const next=new URLSearchParams(old);for(const [key,value]of Object.entries(patch)){if(value)next.set(key,value);else next.delete(key);}return next;},{replace:true});
 return {active,selected,offset,search,runId,postId,post,comments,visible,archive,history,
  open:(p:InfoPost)=>{remembered.current.set(`${selected?.id}:${p.id}`,p);update({post:p.id,infoCommentPage:''});},
  back:()=>update({post:'',infoCommentPage:''}),setSearch:(value:string)=>update({infoSearch:value}),setRun:(value:string)=>update({infoRun:value,post:'',infoCommentPage:''}),
  setPage:(n:number)=>update({[postId?'infoCommentPage':'infoPage']:n?String(n):''}),
  setConfig:(id:string)=>update({config:id,infoPage:'',infoRun:'',post:'',infoSearch:'',infoCommentPage:''})};
}
