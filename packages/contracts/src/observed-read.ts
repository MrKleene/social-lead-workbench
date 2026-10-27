import {safeBoundedReadReport} from './bounded-read';
import type {RunCoverage} from './run-coverage';
/** Count the confirmed checkpoint scope only when independent completion evidence agrees.
 * Never overwrite the persisted delta counts or promote a partial/unknown recovery. */
export function observedReadCounts(p:RunCoverage['posts'][number]){
 const d=safeBoundedReadReport(p.boundedRead),n=d?.chunkSummary?{uniqueKnown:d.chunkSummary.unique,roots:d.chunkSummary.roots,replies:d.chunkSummary.replies}:d?.retained.loaded;
 const recovered=!!p.recovery&&p.complete&&d?.state==='COMPLETE'&&p.recovery.remainingAnchors===0&&!!n&&p.recovery.confirmedTotal===n.uniqueKnown&&p.saved<=n.uniqueKnown;
 return recovered?{count:n!.uniqueKnown,roots:n!.roots,replies:n!.replies,recovered:true}:{count:p.saved,roots:p.roots,replies:p.replies,recovered:false};
}
