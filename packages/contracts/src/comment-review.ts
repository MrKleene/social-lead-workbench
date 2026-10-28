import {z} from 'zod';
import type {SemanticConnection,SemanticUsage,SemanticReviewItem} from './semantic-review';
export const reviewAutoConsent='comment-review-continuous-single-post-v3' as const;
export const reviewUseConsent='comment-review-original-first-use-v2' as const;
export const reviewPolicySaveSchema=z.object({version:z.number().int().nonnegative(),target:z.string().trim().min(10).max(1500)}).strict();
export const reviewPolicyToggleSchema=z.object({version:z.number().int().positive(),enabled:z.boolean(),consent:z.literal(reviewUseConsent).optional(),modelVersion:z.number().int().nonnegative().optional(),priceVersion:z.string().max(60).optional()}).strict();
export const reviewAutoToggleSchema=z.object({version:z.number().int().positive(),enabled:z.boolean(),consent:z.literal(reviewAutoConsent).optional(),modelVersion:z.number().int().nonnegative().optional(),priceVersion:z.string().max(60).optional()}).strict();
export const reviewAuthorizationSchema=z.object({consent:z.literal(reviewUseConsent),modelVersion:z.number().int().nonnegative(),priceVersion:z.string().max(60)}).strict();
export const reviewScopeSchema=z.discriminatedUnion('kind',[z.object({kind:z.literal('ALL')}).strict(),z.object({kind:z.literal('COMMENTS'),commentIds:z.array(z.string().min(1).max(200)).min(1).max(5).refine(v=>new Set(v).size===v.length)}).strict(),z.object({kind:z.literal('POSTS'),postIds:z.array(z.string().min(1).max(200)).min(1).max(50).refine(v=>new Set(v).size===v.length)}).strict()]);
export const reviewPrepareSchema=z.object({version:z.number().int().positive(),scope:reviewScopeSchema}).strict();
export type ReviewScope=z.infer<typeof reviewScopeSchema>;
export type ReviewPolicy={id:string;name:string;target:string;revision:number;version:number;enabled:boolean;autoEnabled:boolean;autoModelVersion:number|null};
export type ReviewOverview={policies:ReviewPolicy[];connection:SemanticConnection;usage:SemanticUsage;modelVersion:number;capturedComments:number;autoJobs:{runId?:string;id:string;postId:string;title:string;status:string;reason:string|null;processed:number}[]};
export type ReviewResults={items:(SemanticReviewItem&{policyId:string|null;policyRevision:number|null})[];total:number;hasMore:boolean};
export type ReviewComments={items:{id:string;comment:string;coverage:string}[];hasMore:boolean};
export type ReviewPosts={items:{id:string;title:string;comments:number;coverUrl?:string;coverage?:string}[];hasMore:boolean};

export const manualPostConsent='comment-review-saved-post-single-request-v3' as const;
export const manualPostPrepareSchema=z.object({postId:z.string().min(1).max(200),revision:z.number().int().positive()}).strict();
export const manualPostConfirmSchema=z.object({hash:z.string().regex(/^[a-f0-9]{64}$/),requestKey:z.string().uuid(),consent:z.literal(manualPostConsent),providerConsent:z.literal(reviewUseConsent)}).strict();
export type ManualReviewTask={id:string;postId:string;title:string;coverage:string;policyRevision:number;model:string;modelVersion:number;priceVersion:string;scopeHash:string;status:string;reason:string|null;total:number;pending:number;success:number;failed:number;skipped:number;maxCalls:number;retrying:number;capacityError:string|null;target:string;priceDescription?:string;dailyLimit:number|null;authorized:boolean};
export type ManualReviewPreview={items:import('./semantic-review').SemanticOutbound['items'];hasMore:boolean};

export const reviewResultFilterSchema=z.object({runId:z.string().min(1).max(200).optional(),policyRevision:z.coerce.number().int().min(1).optional(),postId:z.string().max(200).optional(),search:z.string().trim().max(100).optional(),minScore:z.coerce.number().min(0).max(100).optional(),maxScore:z.coerce.number().min(0).max(100).optional(),sort:z.enum(['newest','score-desc','score-asc']).default('newest'),status:z.enum(['PENDING','APPROVED','REJECTED']).optional(),state:z.enum(['EVALUATED','FAILED','UNANALYSED','PROCESSING']).optional()}).strict().refine(v=>v.minScore===undefined||v.maxScore===undefined||v.minScore<=v.maxScore,{message:'最低相关度不能超过最高相关度'});
