import type {z} from 'zod';
import type {coverageSampleSchema} from './coverage-diagnostic';
type Sample=z.infer<typeof coverageSampleSchema>;
/** A root-scoped flat list is a separate proof, never a missing-to-zero rewrite. */
export function rootScopedRepliesExhausted(s:Sample):boolean {
 const n=s.loaded;
 if(s.status!=='OK'||s.list!=='EXACT'||!n||s.ready.document!=='complete'||!s.ready.container||s.ready.rootEndVisible!==true||s.ready.rootScopeExact!==true||s.ready.replyControls!==0||s.hasMore.state!=='EXACT'||s.hasMore.value!==false||!['EMPTY','NONEMPTY'].includes(s.cursor)||s.total.state!=='EXACT'||s.total.value!==n.uniqueKnown||n.uniqueKnown!==n.roots+n.replies||n.missingIds||n.duplicateIds||n.invalidNodes||s.findings.length||s.groups.length!==n.uniqueKnown)return false;
 const roots=new Map(s.groups.filter(g=>g.depth===0&&g.parent===null).map(g=>[g.ordinal,g]));
 const counts=new Map<number,number>();let missingLeaves=0;
 for(const g of s.groups){
  if(g.depth===0&&g.parent===null)continue;
  if(g.depth!==1||g.parent===null||!roots.has(g.parent))return false;
  counts.set(g.parent,(counts.get(g.parent)??0)+1);
  if(g.declared.state==='MISSING'&&(g.loaded.state==='MISSING'||g.loaded.state==='EXACT'&&g.loaded.value===0)){missingLeaves++;continue;}
  if(g.declared.state!=='EXACT'||g.declared.value!==0||g.loaded.state!=='EXACT'||g.loaded.value!==0)return false;
 }
 return missingLeaves>0&&roots.size>0&&roots.size===n.roots&&[...roots].every(([id,g])=>g.declared.state==='EXACT'&&g.loaded.state==='EXACT'&&g.declared.value===(counts.get(id)??0)&&g.loaded.value===(counts.get(id)??0));
}
