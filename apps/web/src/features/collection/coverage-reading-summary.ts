import {safeBoundedReadReport} from '@crm/contracts';
/** Describe observed boundaries without upgrading UNKNOWN/PARTIAL to COMPLETE. */
export function coverageReadingSummary(value:unknown):string|undefined{
 const d=safeBoundedReadReport(value);if(!d)return;
 const s=d.retained,f=d.final,n=s.loaded;
 if(!n)return '本次可见数量未确认，不能判断是否读尽。';
 if(n.uniqueKnown===0)return s.ready.emptyVisible===true?'页面显示空评论提示；仅代表本次可见状态。':'本次未读到评论，缺少可信空态证据，不能判定确实没有评论。';
 const roots=s.groups.filter(g=>g.depth===0);
 const rootRepliesKnown=roots.length===n.roots&&roots.every(g=>g.declared.state==='EXACT'&&g.loaded.state==='EXACT'&&g.declared.value===g.loaded.value);
 const trustworthy=s.status==='OK'&&s.list==='EXACT'&&s.ready.document==='complete'&&s.ready.container&&!n.missingIds&&!n.invalidNodes&&!n.duplicateIds&&!d.excludedRoots;
 const ended=trustworthy&&f.status==='OK'&&f.ready.document==='complete'&&f.ready.container&&f.loaded?.uniqueKnown===n.uniqueKnown&&f.loaded?.roots===n.roots&&rootRepliesKnown&&d.rootStop==='ROOT_END'&&s.hasMore.value===false&&f.hasMore.value===false&&['BUTTON_NOT_FOUND','DECLARED_REPLIES_LOADED'].includes(d.replyStop);
 const total=f.total.state==='EXACT'?f.total.value:null;
 const visibleEnd=ended&&s.ready.rootScopeExact===true&&f.ready.rootScopeExact===true&&s.ready.rootEndVisible===true&&f.ready.rootEndVisible===true&&s.ready.replyControls===0&&f.ready.replyControls===0;
 if(visibleEnd)return `本次可见评论区已到末尾，无可见展开入口，根讨论声明的回复均已读取。${total!==null&&total!==n.uniqueKnown?`已保留 ${n.uniqueKnown} 条，平台声明 ${total} 条；差额原因未知，不能断言属于删除、隐藏或漏读。`:'这不保证平台未展示的内容可获取。'}`;
 if(ended&&total!==null&&total!==n.uniqueKnown)return `主评论已到末页，主评论声明的回复数均已加载。本次保留 ${n.uniqueKnown} 条，平台声明 ${total} 条，差额 ${Math.abs(total-n.uniqueKnown)} 条原因未确认；不能认定平台全部评论已采全。`;
 if(ended&&d.state!=='COMPLETE')return `主评论已到末页，主评论声明的回复数均已加载；${total===n.uniqueKnown?'数量与平台声明一致，但':''}仍缺少全部层级的完整性证据。`;
 if(d.state==='COMPLETE')return '本次页面明确声明的评论范围已读尽；平台隐藏或不可访问的内容无法据此保证。';
 return '尚未证明可见评论范围读尽，停止原因与各层缺口见下方。';
}
