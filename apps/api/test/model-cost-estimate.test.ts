import {it,expect} from 'vitest';
import {estimateWholePostCost} from '../src/collection/model-cost-estimate';
const payload=(comment:string)=>({items:[{comment}],requestPolicy:'whole-post-single-request-v1'}) as any;
it('discloses catalog version and conservative estimate, not a billing guarantee or free-quota assumption',()=>{
 const e=estimateWholePostCost(payload('护理学'),'qwen3.8-flash');expect(e.fits).toBe(true);expect(e.inputTokensUpper).toBeGreaterThan(8192);expect(e.estimatedMicros).toBeGreaterThan(0);expect(e).toMatchObject({priceVersion:'beijing-2026-10-21',billingHardCap:false,basis:'UTF8_UPPER_ESTIMATE_AND_REQUESTED_MAX_OUTPUT'});
});
it('unknown model or unsupported price range has no estimate and cannot be approved from a guessed price',()=>{
 expect(estimateWholePostCost(payload('合成'),'unknown')).toMatchObject({fits:false,estimatedMicros:null});
 expect(estimateWholePostCost(payload('a'.repeat(995000)),'qwen3.8-max').estimatedMicros).toBeNull();
});
it('tiered catalog prices use the conservative input tier and include the requested maximum output',()=>{
 const e=estimateWholePostCost(payload('x'.repeat(40000)),'qwen3.7-flash-2026-07-15');expect(e.inputTokensUpper).toBeGreaterThan(32000);expect(e.estimatedMicros).toBe(Math.ceil(e.inputTokensUpper*0.6+e.outputTokens*2.4));
});
