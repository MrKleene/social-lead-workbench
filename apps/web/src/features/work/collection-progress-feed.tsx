import type {Platform} from '@/lib/types';
import {collectionOutcome} from '../collection/collection-outcome';
import {TaskRunSummary} from './task-run-summary';
import {RunPostStream} from './run-post-stream';
import {Button} from '@/components/ui/button';
import type {Run} from '@/features/collection/types';
import {collectionTaskHeadline} from './collection-task-summary';
export function CollectionProgressFeed({configId,platform,run,pending,error,visible,onRefresh}:{configId:string;platform:Platform;run:Run|undefined;pending:boolean;error:unknown;visible:boolean;onRefresh:()=>void}){
 return <section className="task-progress task-results-inline" aria-label="采集进度">
  <div className="task-feed-heading"><h2>{run?'采集结果':'采集任务'}</h2></div>
  {error||pending?<div className="task-feed-empty"><h2>{error?'任务状态读取失败':'正在获取任务记录…'}</h2>{!!error&&<Button variant="outline" onClick={onRefresh}>重试读取</Button>}</div>:run?<>
   <TaskRunSummary configId={configId} run={run}/>
   {collectionOutcome(run).warning&&<p className="task-result-summary" role="status" data-run-id={run.id} data-warning="true">{collectionTaskHeadline(run)}</p>}
   <RunPostStream key={run.id} configId={configId} platform={platform} run={run} visible={visible} compact/>
  </>:<div className="task-feed-empty"><p>开始后，采集结果会显示在这里。</p></div>}
 </section>;
}
