import {useQuery} from '@tanstack/react-query';
import type {AutoContactOverview,JourneySummary} from '@crm/contracts';
import {api} from '@/lib/api';
import {useReviewOverview} from '@/features/comment-review/use-comment-review';
import type {Config} from '@/features/collection/types';
import {dashboardRuns,dashboardCurrent,dashboardCounts,collecting} from './dashboard-model';
import {journeyProgress} from './journey-progress';
export function useWorkDashboard(configs:Config[]){
 const runs=dashboardRuns(configs),run=dashboardCurrent(runs);
 const review=useReviewOverview(true);
 const contact=useQuery({queryKey:['auto-contact'],queryFn:()=>api<AutoContactOverview>('/auto-contact'),refetchInterval:5000,refetchIntervalInBackground:false});
 const summary=useQuery({queryKey:['journey-summary',run?.id],queryFn:()=>api<JourneySummary>('/auto-contact/journey?'+new URLSearchParams({runId:run!.id})),enabled:!!run,retry:false,refetchInterval:5000,refetchIntervalInBackground:false});
 const progress=summary.data&&review.data&&contact.data&&!summary.isError&&!review.isError&&!contact.isError?journeyProgress(summary.data,!!review.data?.policies.some(p=>p.autoEnabled),!!contact.data?.rules.some(r=>r.enabled)):undefined;
 return {runs,run,summary,review,contact,progress,counts:summary.data&&!summary.isError?dashboardCounts(summary.data):undefined,activeCount:runs.filter(collecting).length};
}
