import type {ArchivedComment} from './archive-data';
export type CommentRow={comment:ArchivedComment;depth:number;parent?:ArchivedComment;parentAmbiguous:boolean};
/** Only a unique saved parent version can anchor a row. Preserve every version,
 * including orphaned replies and cycles, without inventing a root comment. */
export function commentThread(items:ArchivedComment[]):CommentRow[]{
 const parents=new Map<string,ArchivedComment[]>();
 for(const c of items){const key=c.snapshot.postId+'\0'+c.snapshot.commentId;parents.set(key,[...(parents.get(key)||[]),c]);}
 const rows=items.map(comment=>{const candidates=comment.snapshot.parentId?parents.get(comment.snapshot.postId+'\0'+comment.snapshot.parentId)||[]:[];return {comment,depth:comment.snapshot.parentId?1:0,parent:candidates.length===1&&candidates[0].id!==comment.id?candidates[0]:undefined,parentAmbiguous:candidates.length>1};});
 const result:CommentRow[]=[],seen=new Set<string>();
 const visit=(row:CommentRow,depth:number)=>{if(seen.has(row.comment.id))return;seen.add(row.comment.id);result.push({...row,depth:Math.min(depth,3)});for(const child of rows.filter(c=>c.parent?.id===row.comment.id))visit(child,depth+1);};
 for(const row of rows.filter(r=>!r.parent))visit(row,row.depth);
 for(const row of rows)visit(row,row.depth); // Cycles remain inspectable, never dropped.
 return result;
}

/** Group only proven parent links. Ambiguities/cycles stay visible and inspectable. */
export function replyGroups(rows:CommentRow[]):Map<string,CommentRow[]> {
 const byId=new Map(rows.map(r=>[r.comment.id,r])),groups=new Map<string,CommentRow[]>();
 for(const row of rows){let current=row;const seen=new Set<string>();
  while(current.parent&&!seen.has(current.comment.id)){seen.add(current.comment.id);current=byId.get(current.parent.id)!;}
  if(current.parent||current===row)continue;
  groups.set(current.comment.id,[...(groups.get(current.comment.id)||[]),row]);
 }return groups;
}
