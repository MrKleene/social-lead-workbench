import type {SemanticOutbound} from '@crm/contracts';
import {qwenModel} from './qwen-models.cjs';
import {wholePostCapacity} from './whole-post-capacity';
/** Local conservative estimate, NOT a tokenizer or provider billing guarantee.
 * Never count free quotas/cache discounts. Values are pinned to the reviewed catalog. */
export function estimateWholePostCost(payload:SemanticOutbound,modelId:string){
 const capacity=wholePostCapacity(payload,modelId),model=qwenModel(modelId);
 const tier=model?.priceTiers.find(t=>capacity.inputTokensUpper<=t.upToInputTokens);
 return {...capacity,model:modelId,priceVersion:model?.priceVersion??null,
  estimatedMicros:tier?Math.ceil(capacity.inputTokensUpper*tier.inputCnyPerMillion+capacity.outputTokens*tier.outputCnyPerMillion):null,
  basis:'UTF8_UPPER_ESTIMATE_AND_REQUESTED_MAX_OUTPUT' as const,billingHardCap:false as const};
}
