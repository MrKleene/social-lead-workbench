import {describe,it,expect} from 'vitest';
import {effectiveAccountLimit} from '../src/accounts/account-day-limit';
const day='REAL:Asia/Shanghai:2026-11-02';
describe('date-bound account allowance',()=>{
 it('raises only the selected real day while preserving occupied and base',()=>{const usage={day,occupied:1,dailyLimitOverride:2};expect(effectiveAccountLimit(1,usage,day)).toBe(2);expect(usage.occupied).toBe(1);expect(effectiveAccountLimit(1,usage,'REAL:Asia/Shanghai:2026-11-03')).toBe(1);});
 it('does not use historical, simulation or absent overrides',()=>{expect(effectiveAccountLimit(1,{day,dailyLimitOverride:2},'SIMULATION:2026-11-02')).toBe(1);expect(effectiveAccountLimit(1,null,day)).toBe(1);expect(effectiveAccountLimit(1,{day},day)).toBe(1);});
 it('supports zero and never raises the independently authorized rule cap',()=>{expect(effectiveAccountLimit(10,{day,dailyLimitOverride:0},day)).toBe(0);expect(Math.min(1,effectiveAccountLimit(1,{day,dailyLimitOverride:2},day))).toBe(1);});
 it('fails closed on malformed values',()=>{for(const value of [-1,1001,1.5,NaN])expect(()=>effectiveAccountLimit(1,{day,dailyLimitOverride:value},day)).toThrow('INVALID_DAY_LIMIT');});
});
