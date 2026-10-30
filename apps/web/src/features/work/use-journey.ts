import {useAutomationPreferences} from './settings-data';
import {useEffect} from 'react';
import {journeyProgress} from './journey-progress';
import {useQuery} from '@tanstack/react-query';
import {useSearchParams} from 'react-router-dom';
import type {AutoContactOverview, ReviewResults, JourneySummary} from '@crm/contracts';
import {api} from '@/lib/api';
import {useConfig} from '@/features/collection/use-collection';
import {useReviewOverview} from '@/features/comment-review/use-comment-review';
import {collectionOutcome} from '@/features/collection/collection-outcome';
import type {Config} from '@/features/collection/types';
import {journeyStage, type JourneyStage} from './journey-model';

export function useJourney(config: Config | undefined, visible: boolean) {
  const preferences=useAutomationPreferences(visible);
  const [params, setParams] = useSearchParams();
  const detail = useConfig(config?.id), reviews = useReviewOverview(visible);
  const runs = detail.data && detail.data.id === config?.id ? detail.data.runs : config?.runs ?? [];
  const requested = params.get('run') || '';
  const run = runs.find(r => r.id === (requested || config?.activeRunId)) ??
    (!requested && params.get('fresh') !== '1' ? runs[0] : undefined);
  const policy = reviews.data?.policies.find(p => p.id === params.get('policy')) ?? (reviews.data?.policies.find(p=>p.id===preferences.data?.policyId)||reviews.data?.policies[0]);
  const version=Number(params.get('reviewVersion'));
  const policyRevision=Number.isInteger(version)&&version>0?version:undefined;
  const scope = new URLSearchParams({offset: '0', sort: 'newest', ...(run ? {runId: run.id} : {}),...(policyRevision?{policyRevision:String(policyRevision)}:{})});
  const results = useQuery({queryKey: ['comment-review', 'journey', policy?.id, run?.id,policyRevision],
    queryFn: () => api<ReviewResults>(`/comment-review/policies/${policy!.id}/results?${scope}`),
    enabled: visible && !!run && !!policy, refetchInterval: 5000});
  const contact = useQuery({queryKey: ['auto-contact'], queryFn: () => api<AutoContactOverview>('/auto-contact'),
    enabled: visible, refetchInterval: 5000});
  const stage = journeyStage(params.get('stage'));
  useEffect(()=>{if(visible&&params.get('stage')==='handoff')setParams(old=>{const p=new URLSearchParams(old);p.set('stage','contact');return p;},{replace:true});},[visible,params,setParams]);
  const summaryParams=new URLSearchParams({runId:run?.id||''});
  const summary=useQuery({queryKey:['journey-summary',run?.id],queryFn:()=>api<JourneySummary>(`/auto-contact/journey?${summaryParams}`),enabled:visible&&!!run&&!reviews.isPending&&!reviews.isError,refetchInterval:5000,retry:false});
  const changeStage = (next: JourneyStage) => setParams(old => {
    const p = new URLSearchParams(old); p.set('module', 'runs'); p.set('stage', next);
    if (config) p.set('config', config.id); if (run) p.set('run', run.id);
    return p;
  });
  const selectRun = (id: string) => {setParams(old => {
    const p = new URLSearchParams(old); if(id){p.set('run', id);p.delete('fresh');}else{p.delete('run');p.set('fresh','1');}
    if (config) p.set('config', config.id); return p;
  });};
  const progress=summary.data?journeyProgress(summary.data,!!reviews.data?.policies.some(p=>p.autoEnabled),!!contact.data?.rules.some(r=>r.enabled)):undefined;
  const unread=summary.isError||reviews.isError||contact.isError;
  const statuses=[detail.isError?'状态读取失败':run?collectionOutcome(run).label:'尚未开始',
    unread?'状态读取失败':!run?'等待采集':progress?.review||'正在读取',
    unread?'状态读取失败':!run?'等待采集':progress?.contact||'正在读取'];
  const conclusion=unread?'进度读取失败，不能判断本轮是否结束。':!run?'选择已有任务或明确开始新一轮。':detail.isError?'采集状态读取失败。':!['COMPLETE','PARTIAL'].includes(run.status)?`采集${run.status==='FAILED'?'失败':run.status==='PAUSED'?'已暂停':'尚未结束'}，不标记本轮完成。`:collectionOutcome(run).warning?'采集存在中断或异常；后续结果仍可回看，不标记本轮全部完成。':progress?.conclusion||'正在读取本轮处理状态。';
  return {policyRevision,selectVersion:(value:string)=>setParams(old=>{const p=new URLSearchParams(old);if(value)p.set('reviewVersion',value);else p.delete('reviewVersion');return p;}),stage, changeStage, run, runs, requested, selectRun, detail, reviews, policy, results, contact, summary, statuses, conclusion};
}
