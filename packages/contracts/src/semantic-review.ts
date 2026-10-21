import { z } from 'zod';
export const semanticRulesSchema = z.object({
  version: z.literal(1), target: z.string().trim().min(10).max(1500),
  reviewThreshold: z.number().int().min(0).max(100),
}).strict();
export type SemanticRules = z.infer<typeof semanticRulesSchema>;
export const semanticEvidenceSchema = z.object({source:z.enum(['COMMENT','POST_TITLE','POST_BODY','PARENT_COMMENT']),quote:z.string().min(1).max(500)}).strict();
export const semanticOutputSchema = z.object({id:z.string().min(1),score:z.number().int().min(0).max(100),reason:z.string().trim().min(1).max(1000),context:z.enum(['SUFFICIENT','INSUFFICIENT']),evidence:z.array(semanticEvidenceSchema).min(1).max(8)}).strict();
export type SemanticOutput = z.infer<typeof semanticOutputSchema>;
export type SemanticSnapshot = {postId:string;commentId:string;userId:string;title:string;body:string;comment:string;parentId:string|null;parent:string|null;coverage:'PARTIAL'|'COMPLETE';isDemo:boolean};
export const semanticStateLabels:Record<string,string>={UNCONFIGURED:'模型未配置',EVALUATED:'已评估',PROCESSING:'评估中',FAILED:'评估失败',PENDING:'待审核',APPROVED:'已人工确认',REJECTED:'已排除',SUFFICIENT:'上下文充分',INSUFFICIENT:'上下文不足'};
export type SemanticReviewItem={id:string;revision:number;version:number;state:string;reviewStatus:string;score:number|null;reason:string|null;context:string;result:SemanticOutput|null;snapshot:SemanticSnapshot;rules:SemanticRules;provider:string;modelVersion:string|null;isDemo:boolean;createdAt:string;reviewNote:string|null;eligibility:{canSend:false;blockers:string[]}};
export type SemanticReviewPage={configured:false;provider:'NONE';total:number;items:SemanticReviewItem[];offset:number;hasMore:boolean};
