import {describe,it,expect} from 'vitest';
import {reviewDefaults,reviewActivityJobs} from './review-scope';
describe('run review presentation scope',()=>{
 it('shows all states in task scope without a score threshold',()=>{const f=reviewDefaults(true);expect(f.state).toBe('');expect(f.minScore).toBe('');expect(f.maxScore).toBe('');expect(f.sort).toBe('newest');});
 it('preserves standalone score-browser defaults',()=>expect(reviewDefaults(false).state).toBe('EVALUATED'));
 it('does not display unrelated global manual completions as run progress',()=>{const global=[{id:'manual',success:6}];expect(reviewActivityJobs(global,true)).toEqual([]);expect(reviewActivityJobs(global,false)).toEqual(global);expect(global).toHaveLength(1);});
});
