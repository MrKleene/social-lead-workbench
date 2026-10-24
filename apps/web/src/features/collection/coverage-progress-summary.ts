import {safeBoundedReadReport,type BoundedReadReport} from '@crm/contracts';
type Sample=BoundedReadReport['retained'];
function reliable(s:Sample){return s.status==='OK'&&s.list==='EXACT'&&s.loaded&&!s.loaded.invalidNodes&&!s.loaded.missingIds&&!s.loaded.duplicateIds?s.loaded:undefined;}
/** Counts within one read, never database additions or inferred successful clicks. */
export function coverageProgressSummary(value:unknown){
 const d=safeBoundedReadReport(value);if(!d)return;
 const initial=reliable(d.initial),retained=reliable(d.retained),final=reliable(d.final);
 const counts=initial&&retained?`初始窗口 ${initial.uniqueKnown} 条（${initial.roots} 主评／${initial.replies} 回复）→ 本次保留 ${retained.uniqueKnown} 条（${retained.roots} 主评／${retained.replies} 回复）。`:undefined;
 const growth=initial&&retained&&!d.excludedRoots&&retained.roots>=initial.roots&&retained.replies>=initial.replies?`本次读取中主评数量增加 ${retained.roots-initial.roots}，回复数量增加 ${retained.replies-initial.replies}；不是数据库新增条数。`:undefined;
 const roots=d.retained.groups.filter(g=>g.depth===0),unknownRoots=roots.filter(g=>g.declared.state!=='EXACT'||g.loaded.state!=='EXACT').length;
 const gaps=roots.filter(g=>g.declared.value!==null&&g.loaded.value!==null&&g.declared.value>g.loaded.value).length;
 const missingDescendantCounts=d.retained.groups.filter(g=>g.depth>0&&g.declared.state!=='EXACT').length;
 const rootCountsMatch=!!retained&&roots.length===retained.roots&&unknownRoots===0&&roots.every(g=>g.declared.value===g.loaded.value);
 const boundary=d.replyStop==='BUTTON_NOT_FOUND'&&d.rootStop==='ROOT_END'&&rootCountsMatch&&retained&&retained.uniqueKnown>0&&d.excludedRoots===0&&d.retained.hasMore.value===false&&d.final.hasMore.value===false&&final?.uniqueKnown===retained.uniqueKnown&&d.retained.ready.document==='complete'&&d.retained.ready.container&&d.final.ready.document==='complete'&&d.final.ready.container
  ?`未找到可操作的展开入口，根讨论已知回复缺口为 0。${missingDescendantCounts?`${missingDescendantCounts} 条回复未提供可用的后续回复数量声明，完整性仍待确认。`:'不能仅据此认定所有评论完整。'}`
  :retained&&gaps?`仍有 ${gaps} 个根讨论的声明回复数大于已载数。`:undefined;
 return {counts,growth,boundary,actions:`主评论页读取／滚动尝试 ${d.rootActions} 次；回复展开尝试 ${d.replyActions} 次。${d.actions?`确认点击 ${d.actions.replyClicks} 次、滚动 ${d.actions.rootScrolls} 次；窗口新增读取 ${d.actions.addedRoots} 主评／${d.actions.addedReplies} 回复，不代表新增入库。`:'现有记录未提供成功点击次数。'}`};
}
