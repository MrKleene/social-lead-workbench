import {useState} from 'react';
/** Display the saved original, with explicit expansion rather than altered text. */
export function SavedText({text,limit=320,label='全文'}:{text:string;limit?:number;label?:string}){
 const [expanded,setExpanded]=useState(false),long=text.length>limit;
 return <div className="info-saved-text"><p>{long&&!expanded?text.slice(0,limit)+'…':text}</p>{long&&<button className="info-text-action" aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)}>{expanded?'收起'+label:'展开'+label}</button>}</div>;
}

export function savedSourceText(value:unknown){return typeof value!=='string'?'原文未保存':value.trim()?value:'来源返回空文字';}

/** Rendering only: never writes a placeholder into source snapshots. */
export function savedTitleLabel(value:unknown){return typeof value==='string'&&value.trim()&&value!=='未提供标题'?value:'无标题';}
