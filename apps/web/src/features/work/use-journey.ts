import {useQuery} from '@tanstack/react-query';
import {useSearchParams} from 'react-router-dom';
import type {AutoContactOverview, ReviewResults} from '@crm/contracts';
import {api} from '@/lib/api';
import {useConfig} from '@/features/collection/use-collection';
import {useReviewOverview} from '@/features/comment-review/use-comment-review';
import {collectionOutcome} from '@/features/collection/collection-outcome';
import type {Config} from '@/features/collection/types';
import {journeyStage, type JourneyStage} from './journey-model';

export function useJourney(config: Config | undefined, visible: boolean) {
  const [params, setParams] = useSearchParams();
  const detail = useConfig(config?.id), reviews = useReviewOverview(visible);
  const runs = detail.data && detail.data.id === config?.id ? detail.data.runs : config?.runs ?? [];
  const requested = params.get('run') || '';
  const run = runs.find(r => r.id === (requested || config?.activeRunId)) ??
    (!requested && params.get('fresh') !== '1' ? runs[0] : undefined);
  const policy = reviews.data?.policies.find(p => p.id === params.get('policy')) ?? reviews.data?.policies[0];
  const version=Number(params.get('reviewVersion'));
  const policyRevision=Number.isInteger(version)&&version>0?version:undefined;
  const scope = new URLSearchParams({offset: '0', sort: 'newest', ...(run ? {runId: run.id} : {}),...(policyRevision?{policyRevision:String(policyRevision)}:{})});
  const results = useQuery({queryKey: ['comment-review', 'journey', policy?.id, run?.id,policyRevision],
    queryFn: () => api<ReviewResults>(`/comment-review/policies/${policy!.id}/results?${scope}`),
    enabled: visible && !!run && !!policy, refetchInterval: 5000});
  const contact = useQuery({queryKey: ['auto-contact'], queryFn: () => api<AutoContactOverview>('/auto-contact'),
    enabled: visible, refetchInterval: 5000});
  const stage = journeyStage(params.get('stage'));
  const changeStage = (next: JourneyStage) => setParams(old => {
    const p = new URLSearchParams(old); p.set('module', 'runs'); p.set('stage', next);
    if (config) p.set('config', config.id); if (run) p.set('run', run.id);
    return p;
  });
  const selectRun = (id: string) => {setParams(old => {
    const p = new URLSearchParams(old); if(id){p.set('run', id);p.delete('fresh');}else{p.delete('run');p.set('fresh','1');}
    if (config) p.set('config', config.id); return p;
  });};
  const rule = contact.data?.rules[0];
  const jobs = reviews.data?.autoJobs?.filter(j => j.runId === run?.id) ?? [];
  const statuses = [
    detail.isError ? '状态读取失败' : run ? collectionOutcome(run).label : '尚未开始',
    reviews.isError || results.isError ? '状态读取失败' : !run ? '等待采集' :
      jobs.some(j => ['RUNNING', 'PROCESSING', 'PENDING'].includes(j.status)) ? '正在匹配' :
      results.data ? `${results.data.total} 条来源记录` : policy ? '正在读取' : '未配置目标',
    contact.isError ? '状态读取失败' : contact.isPending ? '正在读取' : rule?.pauseReason ? '已暂停' : rule?.enabled ? '已授权开启' : '未启用',
    '收信待接通',
  ];
  return {policyRevision,selectVersion:(value:string)=>setParams(old=>{const p=new URLSearchParams(old);if(value)p.set('reviewVersion',value);else p.delete('reviewVersion');return p;}),stage, changeStage, run, runs, requested, selectRun, detail, reviews, policy, results, contact, statuses};
}
