import {z} from 'zod';
export const runReviewQuerySchema=z.object({policyId:z.string().min(1).max(200).optional(),policyRevision:z.coerce.number().int().min(1).optional(),postId:z.string().min(1).max(200).optional(),postOffset:z.coerce.number().int().min(0).max(100000).default(0),offset:z.coerce.number().int().min(0).max(100000).default(0)}).strict();
export type RunReviewQuery=z.infer<typeof runReviewQuerySchema>;
export type RunReviewJob={status:string;reason:string|null;processed:number};
export type RunReviewPost={id:string;title:string;expectedComments:number|null;jobs:RunReviewJob[]};
export type RunCommentReview={id:string;state:string;score:number|null;reason:string|null;decision:string|null;policyRevision:number|null;origin:'BOUND'|'SAVED';captureRunId:string;createdAt:string};
export type RunReviewComment={id:string;commentId:string;parentId:string|null;parentKnown:boolean;text:string;nickname:string;versions:number;membership:'CAPTURE'|'RECOVERY'|'BOUND';reviews:RunCommentReview[]};
export type RunReviewPage={runId:string;configId:string;runStatus:string;expectedPosts:number;expectedComments:number;posts:RunReviewPost[];postTotal:number;postHasMore:boolean;postOffset:number;limited:boolean;selectedPostId:string|null;comments:RunReviewComment[];knownComments:number;scope:'EXACT'|'PARTIAL'|'UNAVAILABLE';hasMore:boolean;offset:number;pageSize:number;policyId:string|null};
