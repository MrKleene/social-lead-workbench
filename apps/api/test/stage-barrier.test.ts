import {describe,it,expect} from 'vitest';
import {collectionBarrier,stagePlan} from '../src/collection/stage-barrier';
import {configInput,runConfigSnapshot} from '../src/collection/contract';
const run=(patch:Record<string,unknown>={})=>({snapshot:{mode:'MOCK',strictStages:{version:1,policies:[]}},status:'COMPLETE',finishedAt:new Date(),cancelRequested:false,capturedPosts:2,capturedCommentsCount:3,...patch} as any);
it.each(['RUNNING','QUEUED','PAUSED','CANCELLED','FAILED','PARTIAL'])('never releases %s collection',status=>expect(collectionBarrier(run({status})).ready).toBe(false));
it('complete durable runs only, missing timestamp / legacy / cancellation fail closed',()=>{expect(collectionBarrier(run()).ready).toBe(true);for(const patch of [{finishedAt:null},{snapshot:{}},{cancelRequested:true}])expect(collectionBarrier(run(patch)).ready).toBe(false);});
it('private phase evidence cannot corrupt strict saved configuration parsing',()=>{const snapshot={name:'虚构',platform:'XHS',mode:'MOCK',keywords:['测试'],excludeWords:[],batchLimit:3,enabled:true,strictStages:{version:1,policies:[]}};expect(configInput.parse(runConfigSnapshot(snapshot))).not.toHaveProperty('strictStages');expect(stagePlan({snapshot}).success).toBe(true);expect(()=>configInput.parse(snapshot)).toThrow();});
