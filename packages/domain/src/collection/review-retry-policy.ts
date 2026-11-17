export type ReviewErrorStage='CONFIG'|'NETWORK'|'PROVIDER'|'OUTPUT'|'AUTH'|'CAPACITY'|'LOCAL'|'UNKNOWN';
export type ReviewFailure={code:string;stage:ReviewErrorStage;retryable:boolean;unknown:boolean;httpStatus:number|null};
/** 分批审核的固定上限；重试只针对能够确定“没有产生结果”的失败。 */
export const reviewRetryPolicy=Object.freeze({chunkSize:50,maxAttempts:3,rateLimitWaitMs:60000,failureWaitMs:30000});
const outputCodes=new Set(['INVALID_OUTPUT','INVALID_RESPONSE','OUTPUT_JSON_INVALID']);
export function classifyReviewError(code:string,httpStatus:number|null=null):ReviewFailure{
 const output=outputCodes.has(code)||code.startsWith('OUTPUT_');
 if(code==='NETWORK_ERROR')return {code,stage:'NETWORK',retryable:true,unknown:false,httpStatus};
 if(code==='RATE_LIMIT'||code==='UPSTREAM_FAILED')return {code,stage:'PROVIDER',retryable:true,unknown:false,httpStatus};
 if(output)return {code,stage:'OUTPUT',retryable:true,unknown:false,httpStatus};
 if(code==='AUTH_FAILED')return {code,stage:'AUTH',retryable:false,unknown:false,httpStatus};
 if(code==='TIMEOUT'||code==='TRANSPORT_UNKNOWN'||code==='MODEL_RESPONSE_UNVERIFIED'||code==='MODEL_ALREADY_SUBMITTED_OR_UNKNOWN')return {code,stage:'UNKNOWN',retryable:false,unknown:true,httpStatus};
 if(code==='WHOLE_POST_CAPACITY'||code==='MODEL_CAPACITY_OR_PRICE_ACK_REQUIRED'||code==='MODEL_DAILY_LIMIT'||code==='MODEL_DAILY_LIMIT_CHANGED'||code==='MODEL_CALL_COOLDOWN'||code==='MODEL_CALL_IN_PROGRESS')return {code,stage:'CAPACITY',retryable:false,unknown:false,httpStatus};
 if(code==='MODEL_CANCELLED'||code==='MODEL_DISPATCH_NOT_CURRENT'||code==='MODEL_COMMAND_CHANGED'||code==='MODEL_TRANSPORT_SCOPE_CHANGED'||code==='MODEL_PROVIDER_NOT_READY'||code==='MODEL_KEY_UNAVAILABLE'||code==='INVALID_REVIEW_JOB'||code==='INVALID_MODEL_RESULT'||code==='MODEL_AUTHORIZATION_REQUIRED'||code==='MODEL_AUTHORIZATION_ENDED'||code==='MODEL_BATCH_ALREADY_CLAIMED'||code==='REQUEST_KEY_CONFLICT')return {code,stage:'LOCAL',retryable:false,unknown:false,httpStatus};
 if(code==='REVIEW_PREVIEW_CHANGED'||code==='REVIEW_POLICY_CHANGED'||code==='REVIEW_SOURCE_CHANGED'||code==='COLLECTION_BARRIER_NOT_READY'||code==='AUTOMATIC_REVIEW_AUTHORIZATION_CHANGED')return {code,stage:'CONFIG',retryable:false,unknown:false,httpStatus};
 return {code,stage:'LOCAL',retryable:false,unknown:false,httpStatus};
}
