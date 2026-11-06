import {ListEmpty} from '@/components/list-empty';
import {Button} from '@/components/ui/button';
import {ErrorNotice,Loading} from '@/components/feedback';
import {reasonLabels,runLabels} from '@/features/collection/types';
import {collectionOutcome} from '@/features/collection/collection-outcome';
import type {SpatialState} from './use-spatial-work';
export function SpaceNotices({state:s}:{state:SpatialState}){
 const q=s.work.configs,exceptions=(q.data||[]).filter(c=>c.pauseReason||(c.runs[0]&&collectionOutcome(c.runs[0]).warning));
 return <section className="notification-workspace"><header className="page-heading"><h1>运行异常</h1></header><div className="space-notices glass-panel"><ErrorNotice error={q.error}/>{!s.admin?<p>此页面仅管理员可用。</p>:q.isPending?<Loading/>:q.isError?<Button variant="outline" onClick={()=>void q.refetch()}>重试读取</Button>:!exceptions.length?<ListEmpty title="当前没有需要处理的异常任务" description="任务出现需要人工处理的异常时，会在这里显示原因和处理入口。"/>:exceptions.map(c=><article key={c.id}><strong>{c.name}</strong><p>{reasonLabels[c.pauseReason||c.runs[0]?.reason||'']||runLabels[c.runs[0]?.status]}</p><Button variant="outline" onClick={()=>s.openModule('runs',c.id)}>查看采集进度</Button></article>)}</div></section>;
}
