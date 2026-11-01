import {InfoSection} from '../../components/information-section';
import {commentCoverage} from './collection-outcome';
import {safeRunCoverage} from '@crm/contracts';
import {BoundedReadEvidence,BoundedReadWindows} from './bounded-read-evidence';
import {savedTitleLabel} from './saved-text';
import {reasonLabels} from './types';
/** Immutable task evidence. Labels come from matching public post IDs, never snapshot order. */
export function RunCoverageDetails({value,labels=[]}:{value:unknown;labels?:{postRef:string;title:string}[]}){
 const c=safeRunCoverage(value);if(!c)return null;
 const titles=new Map(labels.map(p=>[p.postRef,p.title]));
 return <section aria-label="本次任务覆盖证据"><p>{c.selection==='SAVED_POST'?'仅重新读取所选已保存帖子，未执行搜索':`搜索范围：${c.search==='COMPLETE'?'本轮搜索范围已结束':c.search==='PARTIAL'?'有限搜索结果，未证明穷尽':'未知'}`}。</p>
 {c.posts.some(p=>!p.postRef)&&<p className="helper-text">旧任务未记录帖子关联，以下读取序号不能与存档序号对应。</p>}
 {c.posts.map(p=><InfoSection key={p.ordinal} data-coverage-post={p.postRef} title={<>读取 {p.ordinal} · {p.postRef&&titles.has(p.postRef)?savedTitleLabel(titles.get(p.postRef)):p.postRef?'帖子标题暂不可用':'未记录帖子关联'} · 已存 {p.roots} 主评／{p.replies} 回复 · {commentCoverage(p.boundedRead,p.reason,p.saved).label}</>}><>{p.recovery&&<p>检查点已确认 {p.recovery.confirmedTotal} 条；本次保存 {p.saved} 条{p.recovery.remainingAnchors?`，尚有 ${p.recovery.remainingAnchors} 个已存节点待重新核对`:""}。旧记录不重复计入本次新增读取。</p>}</><p>已保存 {p.saved} 条{commentCoverage(p.boundedRead,p.reason,p.saved).declared!==null?` · 平台声明 ${commentCoverage(p.boundedRead,p.reason,p.saved).declared} 条`:""}{commentCoverage(p.boundedRead,p.reason,p.saved).difference?` · 差 ${commentCoverage(p.boundedRead,p.reason,p.saved).difference} 条原因未确认`:""}。{reasonLabels[p.reason||'']||'覆盖证据待确认'}</p><BoundedReadEvidence value={p.boundedRead}/><BoundedReadWindows values={p.boundedReadWindows}/></InfoSection>)}</section>;
}
