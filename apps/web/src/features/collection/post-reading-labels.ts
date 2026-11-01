import {postStateLabels} from '@crm/contracts';
/** Access evidence is independent of comment matching and read coverage. */
export function postAccessLabel(state:string){return state==='UNKNOWN'?'访问状态未知':postStateLabels[state]??'访问状态未知';}
