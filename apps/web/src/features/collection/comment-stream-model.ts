import type {ArchivedComment} from './archive-data';
export type StreamComment=ArchivedComment&{savedVersions?:number};
export type CommentStreamPage={items:StreamComment[];context:StreamComment[];snapshotAt:string;total:number;matched:number;roots:number;replies:number;nextCursor:string|null};
export function mergeCommentStream(pages:CommentStreamPage[]){
 const rows=new Map<string,StreamComment>(),matched=new Set<string>();
 for(const page of pages){for(const c of [...page.context,...page.items]){const key=c.snapshot.postId+'\0'+c.platformCommentId;if(!rows.has(key))rows.set(key,c);}for(const c of page.items)matched.add(c.platformCommentId);}
 return {comments:[...rows.values()],matched};
}
