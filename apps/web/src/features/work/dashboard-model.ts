import type {JourneySummary} from '@crm/contracts';
import type {Config,Run} from '@/features/collection/types';
export type DashboardRun=Run&{configId:string;configName:string;mode:Config['mode']};
export const collecting=(run:Run)=>['QUEUED','RUNNING'].includes(run.status);
export function dashboardRuns(configs:Config[]):DashboardRun[]{
 return configs.flatMap(c=>c.runs.map(r=>({...r,configId:c.id,configName:r.snapshot?.name||c.name,mode:r.snapshot?.mode||c.mode}))).sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt));
}
export function dashboardCurrent(runs:DashboardRun[]){return runs.find(r=>r.status==='RUNNING')||runs.find(collecting)||runs[0];}
export function dashboardCounts(summary:JourneySummary){
 const c=summary.contacts,sum=(keys:string[])=>keys.reduce((n,k)=>n+(c[k]||0),0);
 return {reviewed:summary.reviews.EVALUATED||0,high:summary.highRelevance,confirmed:c.CONFIRMED||0,pending:sum(['PENDING_ACTION','MANUAL_READY','QUEUED','WAITING_QUOTA','WAITING_ACCOUNT','RESERVED','ATTEMPTED']),failed:c.FAILED||0,unknown:c.UNKNOWN||0,blocked:c.BLOCKED_POST||0,simulated:c.SIMULATED_SUCCESS||0,skipped:sum(['SKIPPED','CANCELLED']),other:Object.entries(c).filter(([k])=>!['CONFIRMED','PENDING_ACTION','MANUAL_READY','QUEUED','WAITING_QUOTA','WAITING_ACCOUNT','RESERVED','ATTEMPTED','FAILED','UNKNOWN','BLOCKED_POST','SIMULATED_SUCCESS','SKIPPED','CANCELLED'].includes(k)).reduce((n,[,v])=>n+v,0)};
}
export function taskHref(run:DashboardRun,stage='collect'){return '/automation?'+new URLSearchParams({config:run.configId,run:run.id,stage});}
