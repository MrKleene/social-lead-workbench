import { z } from 'zod';
export const semanticRulesSchema = z.object({
  version: z.literal(1), target: z.string().trim().min(10).max(1500),
  reviewThreshold: z.number().int().min(0).max(100),
}).strict();
export type SemanticRules = z.infer<typeof semanticRulesSchema>;
export const semanticEvidenceSchema = z.object({source:z.enum(['COMMENT','POST_TITLE','POST_BODY','PARENT_COMMENT']),quote:z.string().min(1).max(500)}).strict();
export const semanticOutputSchema = z.object({id:z.string().min(1),score:z.number().int().min(0).max(100),decision:z.enum(['MATCH','NO_MATCH','UNCERTAIN']).optional(),reason:z.string().trim().min(1).max(1000),context:z.enum(['SUFFICIENT','INSUFFICIENT']),evidence:z.array(semanticEvidenceSchema).min(1).max(8)}).strict();
export type SemanticOutput = z.infer<typeof semanticOutputSchema>;
export type SemanticSnapshot = {postId:string;commentId:string;userId:string;title:string;body:string;comment:string;parentId:string|null;parent:string|null;coverage:'PARTIAL'|'COMPLETE';isDemo:boolean};
export const semanticStateLabels:Record<string,string>={UNANALYSED:'待分析',UNCONFIGURED:'模型未配置',EVALUATED:'已评估',PROCESSING:'评估中',FAILED:'评估失败',PENDING:'待审核',APPROVED:'已人工确认',REJECTED:'已排除',SUFFICIENT:'上下文充分',INSUFFICIENT:'上下文不足'};
export type SemanticReviewItem={policyId?:string|null;policyRevision?:number|null;id:string;revision:number;version:number;state:string;reviewStatus:string;score:number|null;reason:string|null;displayReason?:string;context:string;result:SemanticOutput|null;snapshot:SemanticSnapshot;rules:SemanticRules;provider:string;modelVersion:string|null;isDemo:boolean;createdAt:string;reviewNote:string|null;evaluationInput?:SemanticOutbound|null;eligibility:{canSend:false;blockers:string[]}};
export type SemanticReviewPage={configured:boolean;provider:string;connection?:SemanticConnection;control?:{enabled:boolean;version:number};usage?:SemanticUsage;total:number;items:SemanticReviewItem[];offset:number;hasMore:boolean};

export const semanticInputPolicy='comment-original-context-redacted-v2' as const;
export const wholePostRequestPolicy='whole-post-single-request-v1' as const;
export type SemanticOutbound={requestPolicy?:string;inputPolicyVersion?:string;redactionVersion:string;target:string;items:{id:string;title:string;body:string;comment:string;parent:string|null;missingParent:boolean;partial:boolean;truncated:boolean}[]};
export type SemanticConnection={state:'DISABLED'|'UNAUTHORIZED'|'BUDGET_REQUIRED'|'UNCONFIGURED'|'INVALID_CONFIG'|'READY';message:string;model:string;region:'cn-beijing';authorized?:boolean;priceVersion?:string;priceDescription?:string;dailyLimit:number|null;batchLimit:number;automaticRetries:0;timeoutSeconds:number};
export type SemanticUsage={requests:number;dailyLimit:number|null;inputTokens:number;outputTokens:number;unknownUsage:number;lastStatus:string|null;canCall:boolean};
export type SemanticPreview={hash:string;revision:number;payload:SemanticOutbound;count:number;reviewIds?:string[];connection:SemanticConnection;usage:SemanticUsage};
export const semanticBatchConsent='send-original-comments-priced-batch-v3' as const;
export const semanticEvaluateRequestSchema=z.object({requestKey:z.string().uuid(),previewHash:z.string().regex(/^[a-f0-9]{64}$/),reviewIds:z.array(z.string().min(1).max(200)).min(1).optional(),priceVersion:z.string().min(1).max(60),consent:z.literal(semanticBatchConsent)}).strict();
export type SemanticEvaluateRequest=z.infer<typeof semanticEvaluateRequestSchema>;
