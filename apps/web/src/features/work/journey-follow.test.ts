import {describe,it,expect} from 'vitest';
import {followJourney,type JourneyObservation} from './journey-follow';
import {journeyProgress} from './journey-progress';
const initial={key:'c:r',status:'RUNNING',safeEnd:false,reviewReady:true,stage:'collect' as const};
const running=()=>followJourney(undefined,initial).observation;
describe('display-only stage following',()=>{
 it('follows normal completion once, then allows manual collection review',()=>{
  const done={...initial,status:'COMPLETE',safeEnd:true};
  const result=followJourney(running(),done);expect(result.follow).toBe(true);
  expect(followJourney(result.observation,done).follow).toBe(false);
 });
 it('waits for asynchronous matching metadata before following',()=>{
  const done={...initial,status:'COMPLETE',safeEnd:true};
  const waiting=followJourney(running(),{...done,reviewReady:undefined});expect(waiting.follow).toBe(false);
  expect(followJourney(waiting.observation,done).follow).toBe(true);
 });
 it.each(['COMPLETE','PARTIAL'])('does not redirect opening historical %s or refreshing finished task',status=>{
  expect(followJourney(undefined,{...initial,status,safeEnd:true}).follow).toBe(false);
 });
 it.each(['FAILED','PAUSED','CANCELLED','UNKNOWN'])('stays with interrupted %s',status=>expect(followJourney(running(),{...initial,status}).follow).toBe(false));
 it('allows normal bounded completion but not a partial interruption',()=>{
  expect(followJourney(running(),{...initial,status:'PARTIAL',safeEnd:true}).follow).toBe(true);
  expect(followJourney(running(),{...initial,status:'PARTIAL',safeEnd:false}).follow).toBe(false);
 });
 it('does not move when matching is disabled without records or there are no comments',()=>expect(followJourney(running(),{...initial,status:'COMPLETE',safeEnd:true,reviewReady:false}).follow).toBe(false));
 it('does not steal a manually selected stage or follow after navigating back',()=>{
  const r=followJourney(running(),{...initial,status:'COMPLETE',safeEnd:true,stage:'contact'});
  expect(r.follow).toBe(false);expect(followJourney(r.observation,{...initial,status:'COMPLETE',safeEnd:true}).follow).toBe(false);
 });
 it('does not carry transitions between tasks',()=>expect(followJourney(running(),{...initial,key:'c:history',status:'COMPLETE',safeEnd:true}).follow).toBe(false));
 it('is safe when React repeats effect setup',()=>{let previous:JourneyObservation|undefined;
  for(const status of ['RUNNING','RUNNING','COMPLETE','COMPLETE']){const r=followJourney(previous,{...initial,status,safeEnd:status==='COMPLETE'});if(status==='COMPLETE'&&previous?.consumed)expect(r.follow).toBe(false);previous=r.observation;}
 });
});
describe('stage-scoped actionable notices',()=>{
 const summary={reviews:{EVALUATED:2},reviewJobs:{},contacts:{},matches:0};
 it('does not render a banner for normal completed or disabled flows',()=>{const p=journeyProgress(summary,false,false);expect(p.reviewNotice).toBeUndefined();expect(p.contactNotice).toBeUndefined();});
 it.each(['PENDING','FAILED','UNCONFIGURED'])('keeps %s matching notice at matching',state=>{const p=journeyProgress({...summary,reviews:{[state]:1}},true,false);expect(p.reviewNotice).toContain('匹配');expect(p.contactNotice).toBeUndefined();});
 it.each(['UNKNOWN','BLOCKED_POST'])('keeps %s do-not-resend protection visible at reply',state=>{const p=journeyProgress({...summary,contacts:{[state]:1}},true,true);expect(p.contactNotice).toContain('勿重发或换号补发');expect(p.reviewNotice).toBeUndefined();});
});
