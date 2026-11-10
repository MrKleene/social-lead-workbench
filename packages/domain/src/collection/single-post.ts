import {safeBoundedReadReport,safeCoverageDiagnostic,safeImageDiagnostics} from '@crm/contracts';
import type {Post,Comment} from './contract';
export function singlePostSummary(post:Post,comments:Comment[],mode:'INITIAL_WINDOW'|'BOUNDED_REPLIES'='INITIAL_WINDOW'){
 const groups=(reply:boolean)=>{const selected=comments.filter(c=>!!c.parentId===reply),outcomes=new Map<string,number>();
  for(const c of selected)for(const o of safeImageDiagnostics(c.imageDiagnostics)?.authorAvatar?.outcomes||[])outcomes.set(o.reason,(outcomes.get(o.reason)||0)+o.count);
  return {count:selected.length,displayableAvatars:selected.filter(c=>!!c.authorAvatarUrl).length,outcomes:[...outcomes].map(([reason,count])=>({reason,count}))};};
 const boundedRead=mode==='BOUNDED_REPLIES'?safeBoundedReadReport(post.boundedRead):undefined;
 if(mode==='BOUNDED_REPLIES'&&!boundedRead)throw new Error('INVALID_DATA');
 return {status:'CHECKED' as const,mode,coverage:boundedRead?.state??'WINDOW_ONLY',boundedRead:boundedRead??null,coverageDiagnostic:safeCoverageDiagnostic(post.coverageDiagnostic)??null,roots:groups(false),replies:groups(true),imageDiagnostics:safeImageDiagnostics(post.imageDiagnostics)??null};
}
