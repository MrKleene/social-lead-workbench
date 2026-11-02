import {describe,it,expect} from 'vitest';
import {reviewDateBoundary,reviewFilterError,reviewFilterQuery,readReviewFilters} from './review-filters';
import {reviewDefaults} from './review-scope';
import {reviewResultFilterSchema} from '@crm/contracts';
describe('review publication filters',()=>{
 it('converts inclusive calendar range to half-open Beijing days',()=>{expect(reviewDateBoundary('2026-11-01')).toBe('2026-10-31T16:00:00.000Z');expect(reviewDateBoundary('2026-11-01',true)).toBe('2026-11-01T16:00:00.000Z');expect(reviewDateBoundary('2026-02-30')).toBeUndefined();});
 it('round-trips URL selection including empty all-states and ascending sort',()=>{const f=readReviewFilters(new URLSearchParams('review_state=&review_sort=comment-oldest&review_from=2026-11-01'),false);expect(f.state).toBe('');expect(f.sort).toBe('comment-oldest');expect(reviewFilterQuery(f).publishedFrom).toBe('2026-10-31T16:00:00.000Z');});
 it('rejects inverted ranges and conflicting unknown-only dates',()=>{expect(reviewFilterError({...reviewDefaults(false),from:'2026-11-02',to:'2026-11-01'})).not.toBe('');expect(reviewFilterError({...reviewDefaults(false),publication:'unknown',from:'2026-11-01'})).not.toBe('');expect(reviewResultFilterSchema.safeParse({publication:'unknown',publishedFrom:'2026-11-01T00:00:00Z'}).success).toBe(false);});
 it('keeps comment-date sorting distinct from review-created sorting',()=>{expect(reviewDefaults(false).sort).toBe('comment-newest');for(const sort of ['newest','review-oldest','comment-newest','comment-oldest'])expect(reviewResultFilterSchema.parse({sort}).sort).toBe(sort);});
});
