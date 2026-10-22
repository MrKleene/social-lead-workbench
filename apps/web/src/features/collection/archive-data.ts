import {useQuery} from '@tanstack/react-query';
import type {SemanticSnapshot} from '@crm/contracts';
import {api} from '@/lib/api';
export type ArchivedPost={id:string;runId:string;lastRunId:string;platformPostId:string;lastSeenAt:string;snapshot:{id?:string;title:string;body?:string};coverage:string;stopReason:string|null};
export type ArchivedComment={id:string;postId:string;runId:string;lastRunId:string;platformCommentId:string;lastSeenAt:string;snapshot:SemanticSnapshot;contextVersion:string;post:{coverage:string;stopReason:string|null};reviews:{id:string;state:string;score:number|null;reason:string|null;selectedModel:string|null;revision:number;result:{evidence:{source:string;quote:string}[]}|null}[]};
export type ArchivePage={control:{enabled:boolean;version:number};model:string;hasRules:boolean;total:number;postTotal:number;legacyWithoutSnapshot:number;hasMore:boolean;posts:ArchivedPost[];items:ArchivedComment[]};
export function useArchivePage(configId:string|undefined,offset=0,live=false){return useQuery({queryKey:['collection',configId,'captures',offset],queryFn:()=>api<ArchivePage>(`/collection/configs/${configId}/captures?offset=${offset}`),enabled:!!configId,retry:false,refetchInterval:live?2000:false,refetchIntervalInBackground:false});}
export function belongsToRun(row:{runId:string;lastRunId:string},id:string){return !id||row.runId===id||row.lastRunId===id;}
export function coverageLabel(coverage:string){return coverage==='COMPLETE'?'本次有限窗口完整':coverage==='PARTIAL'?'部分覆盖':'覆盖未知';}
