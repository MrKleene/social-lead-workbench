import {useAutomationPreferences} from './settings-data';
import {useEffect,useRef} from 'react';
import {followJourney,type JourneyObservation} from './journey-follow';
import {journeyProgress} from './journey-progress';
import {collectionTaskSession} from './collection-task-session';
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
  const runs = collectionTaskSession(config, detail.data?.id === config?.id ? detail.data?.runs : []).runs;
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
  const outcome=run?collectionOutcome(run):undefined;
  const notice=stage==='collect'?(outcome?.warning?outcome.issue||outcome.label:undefined):unread?'进度读取失败，请重试。':stage==='review'?progress?.reviewNotice:progress?.contactNotice;
  const observed=useRef<JourneyObservation|undefined>(undefined);
  const reviewReady=!summary.data||reviews.isPending||unread?undefined:
    Object.values(summary.data.reviews).some(n=>n>0)||Object.values(summary.data.reviewJobs).some(n=>n>0)||
    (!!run?.capturedCommentsCount&&!!reviews.data?.policies.some(p=>p.autoEnabled));
  useEffect(()=>{
    if(!visible||!run||detail.isError)return;
    const next=followJourney(observed.current,{key:`${config?.id}:${run.id}`,status:run.status,
      safeEnd:['COMPLETE','PARTIAL'].includes(run.status)&&!outcome?.warning,reviewReady,stage});
    observed.current=next.observation;
    if(next.follow)setParams(old=>{
      const p=new URLSearchParams(old);
      if(journeyStage(p.get('stage'))!=='collect')return old;
      p.set('stage','review');p.set('run',run.id);if(config)p.set('config',config.id);
      return p;
    },{replace:true});
  },[visible,run?.id,run?.status,config?.id,detail.isError,outcome?.warning,reviewReady,stage,setParams]);

  return {policyRevision,selectVersion:(value:string)=>setParams(old=>{const p=new URLSearchParams(old);if(value)p.set('reviewVersion',value);else p.delete('reviewVersion');return p;}),stage, changeStage, run, runs, requested, selectRun, detail, reviews, policy, results, contact, summary, statuses, notice};
}
