import {it,expect} from 'vitest';
import {dashboardCounts,dashboardCurrent,dashboardRuns,taskHref} from './dashboard-model';
import type {Config} from '@/features/collection/types';
it('prioritizes running tasks over newer history without mixing their counts',()=>{
 const configs=[{id:'a',name:'A',mode:'MOCK',runs:[{id:'new',status:'COMPLETE',createdAt:'2026-10-30',capturedPosts:9},{id:'live',status:'RUNNING',createdAt:'2026-10-29',capturedPosts:1}]}] as Config[];
 const runs=dashboardRuns(configs),current=dashboardCurrent(runs)!;
 expect(runs.map(r=>r.id)).toEqual(['new','live']);expect(current.id).toBe('live');expect(current.capturedPosts).toBe(1);expect(taskHref(current,'review')).toBe('/work?module=runs&config=a&run=live&stage=review');
 expect(dashboardCurrent([])).toBeUndefined();expect(dashboardCurrent(runs.filter(r=>r.id!=='live'))?.id).toBe('new');
});
it('keeps failed, unknown, simulated, blocked and pending sends separate',()=>{
 const counts=dashboardCounts({reviews:{EVALUATED:17,FAILED:2},reviewJobs:{COMPLETED:3},contacts:{CONFIRMED:2,FAILED:3,UNKNOWN:4,QUEUED:5,WAITING_QUOTA:6,RESERVED:1,BLOCKED_POST:2,SIMULATED_SUCCESS:9,CANCELLED:1,NEW_STATE:1},matches:8,highRelevance:7});
 expect(counts).toEqual({reviewed:17,high:7,confirmed:2,pending:12,failed:3,unknown:4,blocked:2,simulated:9,skipped:1,other:1});
 expect(dashboardCounts({reviews:{},reviewJobs:{},contacts:{},matches:0}).high).toBeUndefined();
});
