import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {commentDigest} from '../src/collection/comment-checkpoint';
export function readEvidenceFixture(n=33){
 const report=JSON.parse(readFileSync(resolve(__dirname,'../../../scripts/mcp-avatar-diagnostics/root-scope-wire.json'),'utf8')).data.boundedRead;
 delete report.chunkSummary;
 for(const sample of [report.initial,report.final,report.retained]){delete sample.relations;sample.total.value=n;sample.loaded={roots:n,replies:0,uniqueKnown:n,duplicateIds:0,missingIds:0,invalidNodes:0};sample.groups=Array.from({length:n},(_,i)=>({ordinal:i+1,parent:null,depth:0,declared:{state:'EXACT',value:0},loaded:{state:'EXACT',value:0}}));}
 const run={id:'run',configId:'config',status:'PARTIAL',cancelRequested:false,revision:1,createdAt:new Date(1000),finishedAt:new Date(3000),execution:{accountId:'account',deviceId:'device'},metrics:{coverage:{version:1,search:'PARTIAL',reasons:['SEARCH_PARTIAL'],posts:[{postRef:'synthetic-post',ordinal:1,saved:0,roots:0,replies:0,complete:true,reason:'DECLARED_TREE_EXHAUSTED',boundedRead:report,recovery:{confirmedTotal:n,remainingAnchors:0,sequence:1}}]}}};
 const post={id:'post',configId:'config',platformPostId:'synthetic-post',lastRunId:'run',createdAt:new Date(500),lastSeenAt:new Date(2500),coverage:'COMPLETE',snapshot:{boundedRead:report}};
 const comments=Array.from({length:n},(_,i)=>({platformCommentId:'c'+i,snapshot:{postId:'synthetic-post',commentId:'c'+i,userId:'u'+i,comment:'虚构评论'+i,parentId:null}}));
 const checkpoint={sequence:1,checkpoint:{version:1,sequence:1,marks:comments.map(c=>({id:c.platformCommentId,parent:'',digest:commentDigest('synthetic-post',{id:c.platformCommentId,userId:c.snapshot.userId,text:c.snapshot.comment,nickname:'',hasReplies:false})}))}};
 return {run,post,comments,checkpoint,report};
}
