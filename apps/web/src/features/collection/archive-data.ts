import type {DisplayMetadata} from './display-metadata';
import {useQuery} from '@tanstack/react-query';
import type {ReplyTargetMetadata,SemanticSnapshot} from '@crm/contracts';
import {api} from '@/lib/api';
export type ArchivedPost={savedComments?:number;sourceAvailable?:boolean;id:string;runId:string;lastRunId:string;platformPostId:string;lastSeenAt:string;snapshot:{boundedReadWindows?:unknown;boundedRead?:unknown;id?:string;title:string;body?:string;coverUrl?:string}&DisplayMetadata;coverage:string;stopReason:string|null};
export type ArchivedComment={id:string;postId:string;runId:string;lastRunId:string;platformCommentId:string;lastSeenAt:string;snapshot:SemanticSnapshot & DisplayMetadata & ReplyTargetMetadata;contextVersion:string;post:{coverage:string;stopReason:string|null};reviews:{id:string;state:string;score:number|null;reason:string|null;selectedModel:string|null;revision:number;result:{evidence:{source:string;quote:string}[]}|null}[]};
export type ArchivePage={postPageSize?:number;postVersions?:number;commentScope?:{postId:string}|null;control:{enabled:boolean;version:number};model:string;hasRules:boolean;total:number;postTotal:number;legacyWithoutSnapshot:number;hasMore:boolean;posts:ArchivedPost[];items:ArchivedComment[]};
export function useArchivePage(configId:string|undefined,offset=0,live=false,postId=''){return useQuery({queryKey:['collection',configId,'captures',offset,postId],queryFn:()=>api<ArchivePage>(`/collection/configs/${configId}/captures?offset=${offset}${postId?`&postId=${encodeURIComponent(postId)}`:''}`),enabled:!!configId,retry:false,refetchInterval:live?2000:false,refetchIntervalInBackground:false});}
export {belongsToRun,coverageLabel} from './archive-labels';

export function useSavedPostPage(configId:string|undefined,offset:number,q:string,runId:string){return useQuery({queryKey:['collection',configId,'saved-posts',offset,q,runId],queryFn:({signal})=>api<ArchivePage>(`/collection/configs/${configId}/posts?${new URLSearchParams({offset:String(offset),q,runId})}`,{signal}),enabled:!!configId,retry:false});}
