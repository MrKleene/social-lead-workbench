import {createHash} from 'node:crypto';
import {commentCheckpointSchema,type CommentCheckpoint,type CommentChunkReceipt} from '@crm/contracts';
import {ReadFailure,type Comment} from './contract';
export function checkpointHash(value:CommentCheckpoint){return createHash('sha256').update(JSON.stringify(commentCheckpointSchema.parse(value))).digest('hex');}
export function commentDigest(post:string,c:Comment){const values=[post,c.id,c.parentId||'',c.userId,c.text];return createHash('sha256').update(values.map(x=>`${Buffer.byteLength(x)}:${x}`).join('')).digest('hex');}
export function validateChunk(previous:CommentCheckpoint,receipt:CommentChunkReceipt,post:string,comments:Comment[]){
 const next=commentCheckpointSchema.parse(receipt.checkpoint);
 // 检查点落库时会被规范化成另一种键序，所以历史标记必须逐字段比较，不能比 JSON 字符串。
 const prefixKept=previous.marks.length<=next.marks.length&&previous.marks.every((mark,i)=>{const kept=next.marks[i];return !!kept&&kept.id===mark.id&&kept.parent===mark.parent&&kept.digest===mark.digest;});
 if(checkpointHash(next)!==receipt.hash||next.sequence!==previous.sequence+(comments.length?1:0)||next.marks.length!==previous.marks.length+comments.length||!prefixKept)throw new ReadFailure('INVALID_DATA');
 const byId=new Map(comments.map(c=>[c.id,c]));if(byId.size!==comments.length)throw new ReadFailure("INVALID_DATA");
 next.marks.slice(previous.marks.length).forEach(m=>{const c=byId.get(m.id);if(!c)throw new ReadFailure("INVALID_DATA");if(m.id!==c.id||m.parent!==(c.parentId||'')||m.digest!==commentDigest(post,c))throw new ReadFailure('INVALID_DATA');});
 if(receipt.replaying&&comments.length)throw new ReadFailure('INVALID_DATA');return next;
}
