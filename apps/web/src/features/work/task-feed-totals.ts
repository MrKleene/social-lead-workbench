import type {RunPostFeed} from '@crm/contracts';
import type {Run} from '@/features/collection/types';
/** A partial page or stale task snapshot must never masquerade as a task-wide total. */
export function taskFeedTotals(feed:RunPostFeed|undefined,configId:string,run:Run|undefined){
 if(!feed||!run||feed.configId!==configId||feed.runId!==run.id||feed.availability!=='AVAILABLE'||feed.limited||run.capturedPosts===undefined||feed.items.length!==run.capturedPosts)return undefined;
 if(new Set(feed.items.map(p=>p.platformPostId)).size!==feed.items.length||feed.items.some(p=>p.newCount===null||p.reusedCount===null))return undefined;
 return {newCount:feed.items.reduce((n,p)=>n+p.newCount!,0),reusedCount:feed.items.reduce((n,p)=>n+p.reusedCount!,0)};
}
