import type {AutoContactOverview} from '@crm/contracts';
type Account=AutoContactOverview['accounts'][number];
export function accountReadyForRule(a:Account|undefined,mode:string){
 if(!a||a.systemBlockReason||a.dailyLimit<=0)return false;
 return mode==='SIMULATION'?a.healthy&&a.isDemo:!a.isDemo&&(a.canCheck===true||a.healthy&&!!a.sendEligibility?.canSend&&!a.sendEligibility.stale);
}
