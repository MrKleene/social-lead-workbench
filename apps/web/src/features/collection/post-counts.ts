import {safeBoundedReadReport} from '@crm/contracts';
import type {InfoPost} from './collection-info-model';
/** Saved count spans versions/pages; platform declaration belongs to the latest read, not proof of completeness. */
export function postCounts(post:InfoPost|undefined){
 const latest=post?.versions[0],saved=latest?.savedComments;
 const report=safeBoundedReadReport(latest?.snapshot.boundedRead),total=report?.final?.total;
 const declared=total?.state==='EXACT'?total.value:undefined;
 return {saved,declared,different:saved!==undefined&&declared!==undefined&&declared!==null&&saved!==declared};
}
