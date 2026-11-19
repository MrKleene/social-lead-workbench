'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fixture,entry,collect,evaluate}=require('./flow-fixture.cjs');
const {LocalWorkspace}=require('../dist/workspace.cjs');
const {LocalReporting}=require('../dist/reporting.cjs');
const {RunReview}=require('../dist/run-review.cjs');
const limit=require('@crm/local-runtime/policy').reviewCommentPolicy.maxChars;

test('comments over the length limit are skipped instead of sent to the model',t=>{
 const f=fixture(t),short='想请教学习方法和选题指导',atLimit='短'.repeat(limit),over='长'.repeat(limit+1);
 const run=collect(f,[entry('post-a',[short,atLimit,over])]),postId=f.collection.posts(run.runId)[0].id;
 const segments=f.review.commentSegments(run.runId,postId);
 assert.equal(segments.comments.length,2);
 assert.equal(f.review.skippedComments(run.runId,postId).length,1);
 const plan=f.review.plan(run.runId,postId,'policy');
 assert.equal(plan.inputs.length,2);assert.equal(plan.empty,false);
 const workspace=new LocalWorkspace(f.store),progress=workspace.runProgress({runId:run.runId});
 assert.equal(progress.reviewProgress.total,2);assert.equal(progress.reviewProgress.skipped,1);
 const posts=workspace.reviewPosts({runId:run.runId});
 assert.equal(posts.items[0].total,2);assert.equal(posts.items[0].skipped,1);
 const comments=workspace.reviewComments({runId:run.runId,postId});
 assert.equal(comments.total,3);assert.equal(comments.items.filter(c=>c.state==='SKIPPED').length,1);
 assert.equal(new LocalReporting(f.store).unreviewed({runId:run.runId}).total,2);
 evaluate(f,run.runId,postId);
 assert.equal(f.review.barrier(run.runId).ready,true);
 assert.equal(new LocalReporting(f.store).unreviewed({runId:run.runId}).total,0);
});

test('a post whose comments are all too long has no review request',t=>{
 const f=fixture(t),run=collect(f,[entry('post-a',['长'.repeat(limit+1),'更长'.repeat(limit)])]);
 const preview=new RunReview(f.store).preview({runId:run.runId});
 assert.equal(preview.requests,0);assert.equal(preview.comments,0);assert.equal(preview.skippedComments,2);
});
