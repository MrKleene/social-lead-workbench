import {it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {observedReadCounts,safeRunCoverage,reviewObservationPolicy} from '@crm/contracts';
import {prepareReviewOutbound,reviewObservations} from '../src/comment-review/review-observation';
import {commentDigest} from '../src/collection/comment-checkpoint';
import {validateQwenEvidence} from '../src/collection/semantic-redaction';
function fixture(){
 const report=JSON.parse(readFileSync(resolve(__dirname,'../../../scripts/mcp-avatar-diagnostics/root-scope-wire.json'),'utf8')).data.boundedRead;
 const evidence={postRef:'synthetic-post',ordinal:1,saved:0,roots:0,replies:0,complete:true,reason:'DECLARED_TREE_EXHAUSTED',boundedRead:report,recovery:{confirmedTotal:6,remainingAnchors:0,sequence:1}};
 const run={id:'new-run',status:'COMPLETE',cancelRequested:false,revision:1,createdAt:new Date(1000),execution:{accountId:'synthetic-account',deviceId:'synthetic-device'},metrics:{coverage:{version:1,search:'UNKNOWN',reasons:[],posts:[evidence]}}};
 const post={id:'post-row',configId:'config',platformPostId:'synthetic-post',lastRunId:run.id,coverage:'COMPLETE',snapshot:{boundedRead:report}};
 const captures=Array.from({length:6},(_,i)=>({id:'capture'+i,postId:post.id,configId:'config',lastRunId:'old-run',snapshot:{postId:post.platformPostId,commentId:'comment'+i,userId:'synthetic-user'+i,comment:'学科'+i,title:'合成标题',body:'',parentId:i%2?'comment'+(i-1):null,parent:i%2?'学科'+(i-1):null,coverage:'PARTIAL',isDemo:true},post}));
 const checkpoint={configId:'config',platformPostId:post.platformPostId,accountId:'synthetic-account',deviceId:'synthetic-device',revision:1,ownerRunId:null,updatedAt:new Date(2000),state:'COMPLETE',sequence:1,checkpoint:{version:1,sequence:1,marks:captures.map(c=>({id:c.snapshot.commentId,parent:c.snapshot.parentId||'',digest:commentDigest(post.platformPostId,{id:c.snapshot.commentId,userId:c.snapshot.userId,text:c.snapshot.comment,parentId:c.snapshot.parentId||undefined,nickname:'',hasReplies:false})}))}};
 const db={capturedComment:{findMany:vi.fn(async()=>captures)},collectionRun:{findMany:vi.fn(async()=>[run])},commentReadCheckpoint:{findMany:vi.fn(async()=>[checkpoint])}} as any;
 const rows=captures.map(c=>({id:'review-'+c.id,captureId:c.id,snapshot:c.snapshot,rules:{version:1 as const,target:'识别评论中明确提到的学科专业',reviewThreshold:0}}));return {db,rows,captures,checkpoint,run,post,evidence,report};
}
it('resumed zero delta confirms six existing originals with versioned complete input and preserves history',async()=>{
 const f=fixture(),before=JSON.stringify(f.rows),coverage=safeRunCoverage(f.run.metrics.coverage)!;expect(observedReadCounts(coverage.posts[0])).toEqual({count:6,roots:3,replies:3,recovered:true});
 const {payload,inputs}=await prepareReviewOutbound(f.db,f.rows,true);expect(payload.observationPolicy).toBe(reviewObservationPolicy);expect(payload.items).toHaveLength(6);expect(payload.items.every(i=>!i.partial&&i.observation?.coverage==='COMPLETE')).toBe(true);expect(JSON.stringify(f.rows)).toBe(before);expect(payload.items.map(i=>i.comment)).toEqual(f.captures.map(c=>c.snapshot.comment));expect(JSON.stringify(payload)).not.toMatch(/synthetic-account|synthetic-device|comment0|new-run/);
 // Full collection coverage is not a command to turn a model's uncertain result into a match.
 const result={items:payload.items.map(i=>({id:i.id,score:95,decision:'MATCH',context:'INSUFFICIENT',reason:'合成不确定判断',evidence:[{source:'COMMENT',quote:i.comment}]}))};expect(validateQwenEvidence(result,payload,inputs,true).every(r=>r.context==='INSUFFICIENT'&&r.decision==='UNCERTAIN')).toBe(true);
});
it.each(['missing-report','unknown','partial','remaining','count','sequence','identity','other-owner','cancelled','failed','missing-checkpoint'])(`does not promote %s to complete`,async mode=>{
 const f=fixture();if(mode==='missing-report')f.post.snapshot={} as any;if(mode==='unknown'||mode==='partial'){f.report.state=mode==='unknown'?'UNKNOWN':'PARTIAL';f.report.reason='BUTTON_NOT_FOUND';f.report.replyStop='BUTTON_NOT_FOUND';f.post.coverage='PARTIAL';f.evidence.complete=false;}if(mode==='remaining')f.evidence.recovery.remainingAnchors=1;if(mode==='count')f.evidence.recovery.confirmedTotal=5;if(mode==='sequence')f.checkpoint.sequence=2;if(mode==='identity')f.checkpoint.checkpoint.marks[0].digest='0'.repeat(64);if(mode==='other-owner')f.checkpoint.ownerRunId='different-run' as any;if(mode==='cancelled')f.run.cancelRequested=true;if(mode==='failed')f.run.status='FAILED';if(mode==='missing-checkpoint')f.db.commentReadCheckpoint.findMany.mockResolvedValue([]);
 const {payload}=await prepareReviewOutbound(f.db,f.rows,true);expect(payload.items[0].partial).toBe(true);expect(payload.items[0].observation?.coverage).not.toBe('COMPLETE');
});
it('evidence changes invalidate hashes without mutating semantic identities',async()=>{const f=fixture(),before=await reviewObservations(f.db,['capture0']);f.run.cancelRequested=true;const after=await reviewObservations(f.db,['capture0']);expect(before.get('capture0')?.evidenceHash).not.toBe(after.get('capture0')?.evidenceHash);expect(f.captures[0].snapshot.coverage).toBe('PARTIAL');});
it.each(['unknown','partial','remaining','mismatch','forged'])('resumed count does not turn %s into full coverage',mode=>{const f=fixture();if(mode==='unknown'||mode==='partial'){f.report.state=mode==='unknown'?'UNKNOWN':'PARTIAL';f.report.reason='BUTTON_NOT_FOUND';f.report.replyStop='BUTTON_NOT_FOUND';}if(mode==='remaining')f.evidence.recovery.remainingAnchors=1;if(mode==='mismatch')f.evidence.recovery.confirmedTotal=7;if(mode==='forged')f.report.final.ready.rootEndVisible=false;expect(observedReadCounts(f.evidence as any).recovered).toBe(false);});
