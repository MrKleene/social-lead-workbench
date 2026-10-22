export function belongsToRun(row:{runId:string;lastRunId:string},id:string){return !id||row.runId===id||row.lastRunId===id;}
export function coverageLabel(coverage:string){return coverage==='COMPLETE'?'本次有限窗口完整':coverage==='PARTIAL'?'部分覆盖':'覆盖未知';}
