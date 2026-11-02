import {Button} from '@/components/ui/button';
import {ErrorNotice,Loading} from '@/components/feedback';
import {useArchivePage} from '@/features/collection/archive-data';
import {infoPosts} from '@/features/collection/collection-info-model';
import {CollectionPostDetail} from '@/features/collection/collection-post-detail';
import type {Platform} from '@/lib/types';
/** Saved local records only; no read/qualification/send action is mounted. */
export function RunPostReader({configId,runId,postId,platform,onClose}:{configId:string;runId:string;postId:string;platform:Platform;onClose:()=>void}){
 const archive=useArchivePage(configId,0,false,postId,runId);
 const post=infoPosts(archive.data?.posts||[],archive.data?.items||[]).find(p=>p.id===postId);
 if(archive.isPending)return <div className="task-settings-body"><Loading/></div>;
 if(archive.isError)return <div className="task-settings-body"><ErrorNotice error={archive.error}/><Button variant="outline" onClick={()=>void archive.refetch()}>重试读取原文</Button></div>;
 if(!post)return <div className="task-settings-body"><p>本轮没有可返回的帖子原文。</p></div>;
 return <CollectionPostDetail key={`${runId}:${postId}`} configId={configId} post={post} id={postId} platform={platform} readOnly onBack={onClose} onRefresh={()=>void archive.refetch()}/>;
}
