import {safeRunCoverage} from '@crm/contracts';
import type {Run} from '../collection/types';

/** Explain a terminal observation; never promote coverage or reinterpret missing fields as zero. */
export function collectionBoundarySummary(run:Run):string|undefined {
 if(run.status!=='PARTIAL'||run.reason!=='BUTTON_NOT_FOUND')return;
 const coverage=safeRunCoverage(run.metrics?.coverage);
 if(!coverage?.posts.length||coverage.posts.length!==run.capturedPosts)return;
 if(coverage.posts.reduce((sum,p)=>sum+p.saved,0)!==run.capturedCommentsCount)return;
 const counts:string[]=[];
 for(const p of coverage.posts){
  const d=p.boundedRead;if(!d||d.reason!=='BUTTON_NOT_FOUND'||d.rootStop!=='ROOT_END'||d.replyStop!=='BUTTON_NOT_FOUND'||d.excludedRoots)return;
  for(const s of [d.final,d.retained]){
   const n=s.loaded,roots=s.groups.filter(g=>g.depth===0);
   if(s.status!=='OK'||s.list!=='EXACT'||s.ready.document!=='complete'||!s.ready.container||s.ready.rootScopeExact!==true||s.ready.replyControls!==0||s.hasMore.state!=='EXACT'||s.hasMore.value!==false||s.findings.length||!n||n.missingIds||n.duplicateIds||n.invalidNodes||n.roots!==p.roots||n.replies!==p.replies||n.uniqueKnown!==p.saved||roots.length!==p.roots||!roots.every(g=>g.declared.state==='EXACT'&&g.loaded.state==='EXACT'&&g.declared.value===g.loaded.value))return;
  }
  const total=d.final.total;if(total.state!=='EXACT'||total.value===null||d.retained.total.state!=='EXACT'||d.retained.total.value!==total.value)return;
  counts.push(`第 ${p.ordinal} 篇已保存 ${p.saved} / 平台声明 ${total.value} 条${p.saved===total.value?'，数量一致':`，差额 ${Math.abs(total.value-p.saved)} 条原因未确认`}`);
 }
 return `主评论均已到末页，根讨论声明的回复数均已加载，未发现可操作的展开入口。${counts.join('；')}。${coverage.search==='PARTIAL'?'搜索仅覆盖本轮返回范围。':''}全部评论完整性仍待确认。`;
}
