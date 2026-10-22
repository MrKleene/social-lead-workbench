import type {Config,Run} from '@/features/collection/types';
const running=(r:Run)=>['QUEUED','RUNNING'].includes(r.status);
/** The current list snapshot wins over older detail-cache entries. A terminal
 * record is history unless this visible visit started or observed its task ID live. */
export function collectionTaskSession(config:Config|undefined,detailRuns:Run[]=[],startedId='',historyId=''){
 const runs=[...new Map([...detailRuns,...(config?.runs||[])].map(r=>[r.id,r])).values()].sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt));
 const activeId=config?.activeRunId||config?.runs.find(running)?.id||'';
 const currentId=activeId||startedId;
 const currentRun=runs.find(r=>r.id===currentId);
 const run=runs.find(r=>r.id===(historyId||currentId));
 return {runs,activeId,currentId,currentRun,run,history:!!historyId,pending:!!(historyId||currentId)&&(!run||(!historyId&&!!activeId&&!running(run)))};
}
