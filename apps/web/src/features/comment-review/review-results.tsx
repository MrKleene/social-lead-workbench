import {ResultPagination} from '@/components/result-pagination';
import {ReviewFilterToolbar} from './review-filter-toolbar';
import {useAuth} from '@/features/auth/use-auth';
import {ReviewManualDialog} from './review-manual-actions';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Empty } from '@/components/ui/empty';
import {useRef,useState} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import type {SemanticReviewItem} from '@crm/contracts';
import {Button} from '@/components/ui/button';
import {ErrorNotice,Loading} from '@/components/feedback';
import type {SavedReviewPost} from './post-picker';
import {ReviewResultsTable} from './review-result-detail';
import type {useReviewResults} from './use-review-results';
export function ReviewResults({state:s,policyId,post,onPostChange,onManual,manualDisabled}:{state:ReturnType<typeof useReviewResults>;policyId?:string;post:SavedReviewPost|null;onPostChange:(p:SavedReviewPost|null)=>void;onManual:()=>void;manualDisabled:boolean}){
 const {user}=useAuth();
 const [selected,setSelected]=useState<SemanticReviewItem|null>(null);
 const detailTrigger=useRef<HTMLElement|null>(null),heading=useRef<HTMLHeadingElement>(null),client=useQueryClient(),q=s.results;
 const noCompleted=s.filters.state==='EVALUATED'&&s.scored.data?.total===0;
 const pending=s.total.data&&s.scored.data?Math.max(0,s.total.data.total-s.scored.data.total):undefined;
 const reset=()=>s.reset();
 return <section className="review-results graphite-review-results" aria-label="评论审核结果" id="review-results"><div className="review-results-heading"><h2 ref={heading} tabIndex={-1}>审核结果</h2></div><ReviewFilterToolbar state={s} post={post} onPostChange={onPostChange}/>
 {s.invalid?<Alert role="alert" className="review-filter-error"><AlertDescription>{s.error}</AlertDescription></Alert>:!policyId?<Empty className="review-empty"><h3>先设置你想识别的评论</h3><p>请在配置管理中添加评论匹配方案。</p></Empty>:q.isPending?<Loading/>:q.isError?<ErrorNotice error={q.error}/>:<><div className="review-list-count" role="status">符合筛选 {q.data.total} 条</div>{q.data.items.length?<ReviewResultsTable items={q.data.items} canReview={user?.role==='ADMIN'} onOpen={(r,trigger)=>{detailTrigger.current=trigger;setSelected(r);}}/>:<Empty className="review-empty"><span className="review-empty-mark" aria-hidden="true">○</span><h3>{noCompleted?'尚无已完成审核结果':'暂无符合条件的记录'}</h3><p>{noCompleted?`当前${pending===undefined?'':`有 ${pending} 条未评分记录，`}还没有可信评分。`:'调整筛选范围，或测试另一篇已保存帖子。'}</p><div className="action-row"><Button variant="outline" onClick={onManual} disabled={manualDisabled}>手动测试</Button>{pending!==undefined&&pending>0&&<Button variant="outline" onClick={()=>s.change('state','')}>查看全部记录</Button>}{!noCompleted&&<Button variant="ghost" size="content" onClick={reset}>清除筛选</Button>}</div></Empty>}<ResultPagination total={q.data.total} offset={s.offset} pending={q.isFetching} onChange={s.setOffset} label="评论审核分页"/></>}
 {selected&&<ReviewManualDialog key={selected.id} item={selected} onClose={()=>setSelected(null)} onReviewed={()=>{void client.invalidateQueries({queryKey:['comment-review']});setSelected(null);}} onReturnFocus={()=>{if(detailTrigger.current?.isConnected)detailTrigger.current.focus();else heading.current?.focus();}}/>}</section>;
}
