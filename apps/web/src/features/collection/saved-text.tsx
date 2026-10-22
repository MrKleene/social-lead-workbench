import {useState} from 'react';
/** Display the saved original, with explicit expansion rather than altered text. */
export function SavedText({text,limit=320,label='全文'}:{text:string;limit?:number;label?:string}){
 const [expanded,setExpanded]=useState(false),long=text.length>limit;
 return <div className="info-saved-text"><p>{long&&!expanded?text.slice(0,limit)+'…':text}</p>{long&&<button className="info-text-action" aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)}>{expanded?'收起'+label:'展开'+label}</button>}</div>;
}
