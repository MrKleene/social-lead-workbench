import {describe,expect,it} from 'vitest';
import {checkpointHash,commentDigest,validateChunk} from '../src/collection/comment-checkpoint';
import type {Comment} from '../src/collection/contract';
import type {CommentCheckpoint,CommentChunkReceipt} from '@crm/contracts';

const post='a'.repeat(24);
const comment=(id:string,text:string):Comment=>({id,userId:'b'.repeat(24),nickname:'合成用户',text,hasReplies:false});

/** 检查点落库时会被规范化成另一种键序（digest,id,parent），读回来就是这个形状。 */
const asStored=(checkpoint:CommentCheckpoint):CommentCheckpoint=>JSON.parse(JSON.stringify({...checkpoint,marks:checkpoint.marks.map(m=>({digest:m.digest,id:m.id,parent:m.parent}))}));

function receiptFor(checkpoint:CommentCheckpoint,replaying=false):CommentChunkReceipt{
 return {checkpoint,hash:checkpointHash(checkpoint),replaying,remainingAnchors:0};
}

describe('validateChunk',()=>{
 it('接受落库规范化后的历史标记（键序与校验器重建的不一致）',()=>{
  const first=comment('c1','第一条');
  const previous:CommentCheckpoint={version:1,sequence:1,marks:[{id:first.id,parent:'',digest:commentDigest(post,first)}]};
  const added=comment('c2','第二条');
  const next:CommentCheckpoint={version:1,sequence:2,marks:[...previous.marks,{id:added.id,parent:'',digest:commentDigest(post,added)}]};
  const stored=asStored(previous);
  expect(JSON.stringify(stored.marks)).not.toEqual(JSON.stringify(previous.marks));
  expect(()=>validateChunk(stored,receiptFor(next),post,[added])).not.toThrow();
 });

 it('拒绝被改过的历史标记',()=>{
  const first=comment('c1','第一条');
  const previous:CommentCheckpoint={version:1,sequence:1,marks:[{id:first.id,parent:'',digest:commentDigest(post,first)}]};
  const tampered=asStored({...previous,marks:[{...previous.marks[0],digest:'0'.repeat(64)}]});
  const added=comment('c2','第二条');
  const next:CommentCheckpoint={version:1,sequence:2,marks:[...previous.marks,{id:added.id,parent:'',digest:commentDigest(post,added)}]};
  expect(()=>validateChunk(tampered,receiptFor(next),post,[added])).toThrow();
 });

 it('拒绝序号没有递增的窗口',()=>{
  const first=comment('c1','第一条');
  const previous:CommentCheckpoint={version:1,sequence:1,marks:[{id:first.id,parent:'',digest:commentDigest(post,first)}]};
  const added=comment('c2','第二条');
  const next:CommentCheckpoint={version:1,sequence:1,marks:[...previous.marks,{id:added.id,parent:'',digest:commentDigest(post,added)}]};
  expect(()=>validateChunk(asStored(previous),receiptFor(next),post,[added])).toThrow();
 });
});
