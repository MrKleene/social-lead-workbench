import {describe,it,expect} from 'vitest';
import type {RunPostFeed} from '@crm/contracts';
import type {Run} from '@/features/collection/types';
import {taskFeedTotals} from './task-feed-totals';
const run={id:'r',capturedPosts:2} as Run;
const item={id:'row',platformPostId:'p1',title:'synthetic',savedAt:'2026-10-25',savedCount:5,rootCount:2,replyCount:3,newCount:2,reusedCount:3,coverage:'PARTIAL',stopReason:null};
const feed:RunPostFeed={version:1,runId:'r',configId:'c',availability:'AVAILABLE',status:'PARTIAL',limited:false,items:[item,{...item,id:'row2',platformPostId:'p2',newCount:0,reusedCount:5}]};
describe('task summary counts',()=>{
 it('keeps new and reused original versions distinct',()=>expect(taskFeedTotals(feed,'c',run)).toEqual({newCount:2,reusedCount:8}));
 it('does not use a different task, config, partial response or superseded snapshot',()=>{for(const f of [{...feed,runId:'old'},{...feed,configId:'other'},{...feed,limited:true},{...feed,availability:'SUPERSEDED' as const},{...feed,items:[item]}])expect(taskFeedTotals(f,'c',run)).toBeUndefined();});
 it('does not invent missing counters or count duplicate posts twice',()=>{expect(taskFeedTotals({...feed,items:[item,{...feed.items[1],newCount:null}]},'c',run)).toBeUndefined();expect(taskFeedTotals({...feed,items:[item,item]},'c',run)).toBeUndefined();});
 it('distinguishes confirmed empty response from no task or absent counts',()=>{expect(taskFeedTotals({...feed,items:[]},'c',{...run,capturedPosts:0})).toEqual({newCount:0,reusedCount:0});expect(taskFeedTotals(feed,'c',undefined)).toBeUndefined();expect(taskFeedTotals(feed,'c',{...run,capturedPosts:undefined})).toBeUndefined();});
});
